/**
 * Real AI analysis via the Google Gemini API (official @google/genai SDK), with automatic
 * fallback: if the main model is overloaded, rate limited or slow, backup Gemini models are
 * tried, then an optional OpenAI-compatible provider (Groq, OpenRouter, or a local Ollama).
 *
 * Safeguards:
 *  - The API key lives only in server/.env; the browser never sees it.
 *  - Every byte sent is redacted first (see redact.ts) and kept on the record
 *    (`sentContext`) so assessors can audit exactly what left the server.
 *  - `store: false` asks Google not to retain the interaction for retrieval.
 *    Note: on the free tier Google states content may be used to improve its
 *    products, hence the mandatory redaction and synthetic/test data only.
 *  - Output is forced into a JSON schema and validated; it is advisory only and
 *    never changes a finding's verification status.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { AIAnalysis, AIMode, Evidence, Project, Scan, ScanResult, Severity, Target, VulnerabilityFinding } from "@/types";
import { AI_MODES, CATEGORY_BY_ID } from "@/lib/constants";
import { newId } from "../db.ts";
import { HttpError } from "../http.ts";
import { excerpt, redact } from "./redact.ts";

// gemini-3.6-flash: free tier and responsive. (gemini-3.8-flash is listed but did not respond on free-tier keys when tested.)
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
/** Tried in order when the main model is overloaded, rate limited or slow. Same API key. */
export const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-2.5-flash")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m && m !== GEMINI_MODEL);
const TIMEOUT_MS = 45_000;

/**
 * Optional backup providers using the widely supported OpenAI-compatible chat API:
 * Groq, OpenRouter, Mistral, or a local Ollama / LM Studio (nothing leaves the computer).
 * Configured as AI_FALLBACK_* (tried first), then AI_FALLBACK_2_*, then AI_FALLBACK_3_*.
 */
interface FallbackProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
}
const FALLBACKS: FallbackProvider[] = ["AI_FALLBACK_", "AI_FALLBACK_2_", "AI_FALLBACK_3_"]
  .map((p, i) => ({
    name: process.env[`${p}NAME`]?.trim() || `Backup AI ${i + 1}`,
    baseUrl: process.env[`${p}BASE_URL`]?.trim().replace(/\/+$/, "") ?? "",
    apiKey: process.env[`${p}API_KEY`]?.trim() || undefined,
    model: process.env[`${p}MODEL`]?.trim() ?? "",
    timeoutMs: Number(process.env[`${p}TIMEOUT_MS`]) || undefined,
  }))
  .filter((f) => f.baseUrl && f.model);
const geminiConfigured = () => !!process.env.GEMINI_API_KEY?.trim();
export const aiConfigured = () => geminiConfigured() || FALLBACKS.length > 0;

/** Human-readable order in which AI providers are tried, for the Integrations page. */
export function aiProviderChain(): string[] {
  return [...(geminiConfigured() ? [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].map((m) => `Gemini ${m}`) : []), ...FALLBACKS.map((f) => `${f.name} ${f.model}`)];
}

let client: GoogleGenAI | null = null;
const gemini = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export interface AIContext {
  mode: AIMode;
  project: Project;
  target?: Target;
  scan?: Scan;
  scanResults: ScanResult[];
  finding?: VulnerabilityFinding;
  evidence: Evidence[];
  projectFindings?: VulnerabilityFinding[];
  requestedBy: string;
}

const SYSTEM_INSTRUCTION = `You are an assistant to a human web-application security assessor working on an authorized, scoped assessment.
Rules:
- Base every statement only on the context provided. If the evidence is insufficient, say so explicitly in "evidenceGaps" and lower "confidence".
- You never confirm a vulnerability. Tool output and observations are indicators until a human verifies them.
- Recommend only non-destructive verification steps that stay inside the stated scope and exclusions. No denial-of-service, no data modification, no testing of third-party hosts, no credential brute forcing.
- Do not invent CVE IDs, versions, endpoints, or evidence that is not in the context.
- Values shown as [REDACTED ...] were removed on purpose; do not ask for them.
- Be concise and practical. Write for a security assessor and a developer.`;

const TASK: Record<AIMode, string> = {
  scan_interpretation: "Interpret this scan output: what it indicates, which items deserve attention first and why, likely false positives, and what to verify manually.",
  vulnerability_explanation: "Explain this potential vulnerability in plain language: what it is, why it matters for this application, and how an attacker might abuse it if it is real.",
  risk_prioritization: "Prioritize the risk of this finding: give a suggested severity with justification based on exposure, exploitability and impact in this context, and say how urgently it should be handled.",
  remediation: "Recommend concrete remediation steps for developers and system owners, most effective first, including how to confirm the fix during a retest.",
  test_recommendations: "Recommend specific manual security tests the assessor should run to confirm or rule out this finding, within scope, ordered by value.",
  assessment_summary: "Draft an executive summary of this assessment for a report. Treat only CONFIRMED findings as vulnerabilities; mention unverified observations only as pending items.",
};

const outputSchema = {
  type: "object",
  properties: {
    interpretation: { type: "string", description: "Main answer for the requested task (2-5 sentences)." },
    explanation: { type: "string", description: "Supporting explanation in plain language." },
    suggestedSeverity: { type: "string", enum: ["critical", "high", "medium", "low", "info", "none"], description: "Suggested severity, or none if not applicable." },
    potentialImpact: { type: "string" },
    recommendations: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    verificationSteps: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    reasoning: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8, description: "Key points from the context that support the answer." },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidenceGaps: { type: "string", description: "What evidence is missing or ambiguous; empty string if none." },
  },
  required: ["interpretation", "explanation", "suggestedSeverity", "potentialImpact", "recommendations", "verificationSteps", "reasoning", "confidence", "evidenceGaps"],
};

// Tolerant of small format differences between providers (e.g. "High" instead of "high",
// or a single string where a list was asked for). Gemini already follows the schema exactly.
const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const list = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).min(1));
const Output = z.object({
  interpretation: z.string().min(1),
  explanation: z.string().default(""),
  suggestedSeverity: z.preprocess(lower, z.enum(["critical", "high", "medium", "low", "info", "none"])).catch("none"),
  potentialImpact: z.string().default(""),
  recommendations: list,
  verificationSteps: list,
  reasoning: list,
  confidence: z.preprocess(lower, z.enum(["low", "medium", "high"])).catch("low"),
  evidenceGaps: z.string().default(""),
});

/** Asked of providers that can't enforce a JSON schema themselves. */
const JSON_INSTRUCTIONS = `Reply with ONE JSON object only, no markdown, with exactly these keys:
interpretation (string, 2-5 sentences), explanation (string), suggestedSeverity ("critical"|"high"|"medium"|"low"|"info"|"none"),
potentialImpact (string), recommendations (array of strings), verificationSteps (array of strings), reasoning (array of strings),
confidence ("low"|"medium"|"high"), evidenceGaps (string, empty if none).`;

class AttemptError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// A local model (Ollama) may need a minute or two to load into memory on its first request.
const FALLBACK_TIMEOUT_MS = Number(process.env.AI_FALLBACK_TIMEOUT_MS) || 150_000;

const withTimeout = <T,>(p: Promise<T>, label: string, ms = TIMEOUT_MS): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new AttemptError(`${label} did not respond within ${ms / 1000}s`, 504)), ms))]);

function describe(e: unknown, label: string): AttemptError {
  if (e instanceof AttemptError) return e;
  const status = (e as { status?: number }).status;
  const msg = (e as Error).message ?? String(e);
  if (status === 429) return new AttemptError(`${label}: rate limit reached`, 429);
  // Google reports a bad key as 400 API_KEY_INVALID, not 401/403.
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(msg)) return new AttemptError(`${label}: API key rejected`, 401);
  if (status === 503 || /high demand|overloaded|unavailable/i.test(msg)) return new AttemptError(`${label}: overloaded (503)`, 503);
  return new AttemptError(`${label}: ${msg.slice(0, 200)}`, status);
}

async function callGemini(model: string, sent: string): Promise<string | undefined> {
  try {
    const interaction = await withTimeout(
      gemini().interactions.create({
        model,
        system_instruction: SYSTEM_INSTRUCTION,
        input: sent,
        store: false,
        response_format: { type: "text", mime_type: "application/json", schema: outputSchema },
        generation_config: { max_output_tokens: 4096 },
      }),
      `Gemini ${model}`,
    );
    return interaction.output_text;
  } catch (e) {
    const err = describe(e, `Gemini ${model}`);
    // Older models may not support the Interactions API: use the classic generateContent call instead.
    if (err.status !== 400 && err.status !== 404) throw err;
    const res = await withTimeout(
      gemini().models.generateContent({
        model,
        contents: sent,
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: "application/json", responseJsonSchema: outputSchema, maxOutputTokens: 4096 },
      }),
      `Gemini ${model}`,
    );
    return res.text;
  }
}

async function callFallback(provider: FallbackProvider, sent: string): Promise<string | undefined> {
  const label = `${provider.name} ${provider.model}`;
  const res = await withTimeout(
    fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM_INSTRUCTION}\n\n${JSON_INSTRUCTIONS}` },
          { role: "user", content: sent },
        ],
      }),
    }),
    label,
    provider.timeoutMs ?? FALLBACK_TIMEOUT_MS,
  );
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`), { status: res.status });
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content;
}

/** Parses a provider's reply, removing a ```json fence if one was added. */
function parseOutput(text: string | undefined, label: string): z.infer<typeof Output> {
  if (!text) throw new AttemptError(`${label}: returned no text`);
  const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return Output.parse(JSON.parse(json));
  } catch {
    throw new AttemptError(`${label}: reply was not in the expected format`);
  }
}

function buildContext(c: AIContext): { text: string; evidenceIds: string[] } {
  const lines: string[] = [`TASK: ${TASK[c.mode]}`, "", `PROJECT: ${c.project.name} (${c.project.code}) · ${c.project.assessmentType}`];
  if (c.target) {
    lines.push(
      `TARGET: ${c.target.name} · ${c.target.environment} environment, ${c.target.assetType}`,
      `IN-SCOPE HOSTS: ${c.target.scope.inScopeHosts.join(", ")}`,
      `ALLOWED PATHS: ${c.target.scope.allowedPaths.join(", ")}`,
      `EXCLUDED PATHS: ${c.target.scope.excludedPaths.join(", ") || "none"}`,
      `RESTRICTED ACTIVITIES: ${c.target.scope.restrictedActivities.join("; ")}`,
    );
  }
  const evidenceIds: string[] = [];
  if (c.finding) {
    const f = c.finding;
    lines.push(
      "",
      `FINDING ${f.code} (${f.verificationStatus.replace("_", " ")}; data origin: ${f.dataOrigin})`,
      `Title: ${f.title}`,
      `Reported severity: ${f.severity}; Category: ${CATEGORY_BY_ID[f.category].name}; Source: ${f.sourceTool}`,
      `Affected asset: ${f.affectedAsset}${f.parameter ? ` (parameter: ${f.parameter})` : ""}`,
      `References: ${[f.cwe, f.owasp].filter(Boolean).join(", ") || "none"}`,
      `Description: ${excerpt(f.description, 3000)}`,
      `Recorded impact: ${excerpt(f.impact, 1000)}`,
      `Recorded remediation: ${excerpt(f.remediation, 1500)}`,
    );
    c.evidence.slice(0, 6).forEach((e, i) => {
      evidenceIds.push(e.id);
      lines.push("", `EVIDENCE ${i + 1} [${e.id}] ${e.title} (${e.type}, source ${e.source}${e.reviewed ? ", reviewed by assessor" : ""}):`, excerpt(e.content, 3000));
    });
    if (!c.evidence.length) lines.push("", "EVIDENCE: none attached.");
  }
  if (c.scan) {
    lines.push("", `SCAN ${c.scan.code}: ${c.scan.name} (data origin: ${c.scan.dataOrigin}; tools: ${c.scan.config.tools.join(", ")})`);
    c.scanResults.forEach((r) => lines.push("", `TOOL OUTPUT (${r.tool}) · ${r.summary}:`, excerpt(r.rawOutput, 6000)));
  }
  if (c.mode === "assessment_summary" && c.projectFindings) {
    const confirmed = c.projectFindings.filter((f) => f.verificationStatus === "confirmed");
    const pending = c.projectFindings.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review");
    lines.push("", `CONFIRMED FINDINGS (${confirmed.length}):`);
    confirmed.slice(0, 40).forEach((f) => lines.push(`- ${f.code} [${f.severity}] ${f.title} · ${f.affectedAsset}`));
    lines.push("", `UNVERIFIED OBSERVATIONS: ${pending.length} (not to be treated as vulnerabilities)`);
    lines.push(`REJECTED AS FALSE POSITIVES: ${c.projectFindings.filter((f) => f.verificationStatus === "rejected").length}`);
  }
  return { text: lines.join("\n"), evidenceIds };
}

/**
 * Busy providers rest for a short time. While Gemini is resting, Groq and then Ollama answer
 * first; once the rest is over, Gemini is first in line again, so AIVERA moves back up by itself.
 */
const COOLDOWN_MS = Math.max(0, Number(process.env.AI_COOLDOWN_SECONDS ?? 60)) * 1000;
const restingUntil = new Map<string, number>();
const isBusy = (msg: string) => /rate limit|overloaded|did not respond|timed out|exceeded|ECONNREFUSED|fetch failed/i.test(msg);

/** Current state of every provider, in the order they are tried. */
export function aiProviderStatus(): { name: string; resting: boolean; secondsLeft: number }[] {
  const now = Date.now();
  return aiProviderChain().map((name) => {
    const left = Math.max(0, (restingUntil.get(name) ?? 0) - now);
    return { name, resting: left > 0, secondsLeft: Math.ceil(left / 1000) };
  });
}

export async function analyzeWithGemini(c: AIContext): Promise<AIAnalysis> {
  const built = buildContext(c);
  const { text: sent, count } = redact(built.text);

  // Try each provider in turn; the same redacted text is sent to whichever one answers.
  const attempts: { label: string; model: string; run: () => Promise<string | undefined> }[] = [];
  if (geminiConfigured()) {
    let keyRejected = false;
    for (const model of [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])
      attempts.push({
        label: `Gemini ${model}`,
        model,
        run: () => {
          if (keyRejected) throw new AttemptError(`Gemini ${model}: skipped (API key rejected)`);
          return callGemini(model, sent).catch((e) => {
            const err = describe(e, `Gemini ${model}`);
            if (err.status === 401 || err.status === 403) keyRejected = true;
            throw err;
          });
        },
      });
  }
  for (const f of FALLBACKS) attempts.push({ label: `${f.name} ${f.model}`, model: `${f.name.toLowerCase()}:${f.model}`, run: () => callFallback(f, sent) });

  let parsed: z.infer<typeof Output> | undefined;
  let usedModel = "";
  const failures: string[] = [];
  // Resting providers go to the back of the line (never dropped), keeping the normal order otherwise.
  const now = Date.now();
  const ready = attempts.filter((a) => (restingUntil.get(a.label) ?? 0) <= now);
  const resting = attempts.filter((a) => (restingUntil.get(a.label) ?? 0) > now);
  for (const a of [...ready, ...resting]) {
    try {
      parsed = parseOutput(await a.run(), a.label);
      usedModel = a.model;
      restingUntil.delete(a.label);
      break;
    } catch (e) {
      const msg = describe(e, a.label).message;
      failures.push(msg);
      if (COOLDOWN_MS && isBusy(msg)) restingUntil.set(a.label, Date.now() + COOLDOWN_MS);
    }
  }
  if (resting.length && parsed) console.info(`[ai] answered by ${usedModel}; resting: ${resting.map((a) => a.label).join(", ")}`);
  if (!parsed) {
    const allBusy = failures.every((f) => /rate limit|overloaded|did not respond/.test(f));
    throw new HttpError(allBusy ? 503 : 502, `No AI provider could answer. ${failures.join(" · ")}${allBusy ? ". All are busy right now; try again in a minute." : ""}`);
  }
  const usedFallback = usedModel !== GEMINI_MODEL;

  const label = AI_MODES.find((m) => m.id === c.mode)?.label ?? c.mode;
  return {
    id: newId("ai"),
    mode: c.mode,
    projectId: c.project.id,
    targetId: c.finding?.targetId ?? c.scan?.targetId,
    scanId: c.scan?.id ?? c.finding?.scanId,
    findingId: c.finding?.id,
    title: `${label} · ${c.finding?.code ?? c.scan?.code ?? c.project.code}`,
    interpretation: parsed.interpretation,
    explanation: parsed.explanation,
    suggestedSeverity: parsed.suggestedSeverity === "none" ? undefined : (parsed.suggestedSeverity as Severity),
    potentialImpact: parsed.potentialImpact,
    recommendations: parsed.recommendations,
    verificationSteps: parsed.verificationSteps,
    reasoning: parsed.reasoning,
    evidenceRefs: built.evidenceIds,
    confidenceCaveat: `AI-generated by ${usedModel}${usedFallback ? ` (backup: ${failures.length} earlier provider(s) were busy or failed)` : ""} (model-stated confidence: ${parsed.confidence}). Advisory only, it can be wrong and does not confirm anything; an assessor must verify against the evidence.${parsed.evidenceGaps ? ` Evidence gaps noted: ${parsed.evidenceGaps}` : ""}`,
    status: "generated",
    generatedAt: new Date().toISOString(),
    generatedBy: c.requestedBy,
    adapter: "api",
    model: usedModel,
    sentContext: sent,
    redactionCount: count,
  };
}
