/**
 * Real AI analysis via the Google Gemini API (official @google/genai SDK).
 *
 * Safeguards:
 *  - The API key lives only in server/.env; the browser never sees it.
 *  - Every byte sent is redacted first (see redact.ts) and kept on the record
 *    (`sentContext`) so assessors can audit exactly what left the server.
 *  - `store: false` asks Google not to retain the interaction for retrieval.
 *    Note: on the free tier Google states content may be used to improve its
 *    products — hence the mandatory redaction and synthetic/test data only.
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
const TIMEOUT_MS = 60_000;
export const aiConfigured = () => !!process.env.GEMINI_API_KEY?.trim();

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

const Output = z.object({
  interpretation: z.string().min(1),
  explanation: z.string(),
  suggestedSeverity: z.enum(["critical", "high", "medium", "low", "info", "none"]),
  potentialImpact: z.string(),
  recommendations: z.array(z.string()).min(1),
  verificationSteps: z.array(z.string()).min(1),
  reasoning: z.array(z.string()).min(1),
  confidence: z.enum(["low", "medium", "high"]),
  evidenceGaps: z.string(),
});

function buildContext(c: AIContext): { text: string; evidenceIds: string[] } {
  const lines: string[] = [`TASK: ${TASK[c.mode]}`, "", `PROJECT: ${c.project.name} (${c.project.code}) — ${c.project.assessmentType}`];
  if (c.target) {
    lines.push(
      `TARGET: ${c.target.name} — ${c.target.environment} environment, ${c.target.assetType}`,
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
    c.scanResults.forEach((r) => lines.push("", `TOOL OUTPUT (${r.tool}) — ${r.summary}:`, excerpt(r.rawOutput, 6000)));
  }
  if (c.mode === "assessment_summary" && c.projectFindings) {
    const confirmed = c.projectFindings.filter((f) => f.verificationStatus === "confirmed");
    const pending = c.projectFindings.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review");
    lines.push("", `CONFIRMED FINDINGS (${confirmed.length}):`);
    confirmed.slice(0, 40).forEach((f) => lines.push(`- ${f.code} [${f.severity}] ${f.title} — ${f.affectedAsset}`));
    lines.push("", `UNVERIFIED OBSERVATIONS: ${pending.length} (not to be treated as vulnerabilities)`);
    lines.push(`REJECTED AS FALSE POSITIVES: ${c.projectFindings.filter((f) => f.verificationStatus === "rejected").length}`);
  }
  return { text: lines.join("\n"), evidenceIds };
}

export async function analyzeWithGemini(c: AIContext): Promise<AIAnalysis> {
  const built = buildContext(c);
  const { text: sent, count } = redact(built.text);

  let outputText: string | undefined;
  try {
    const request = gemini().interactions.create({
      model: GEMINI_MODEL,
      system_instruction: SYSTEM_INSTRUCTION,
      input: sent,
      store: false,
      response_format: { type: "text", mime_type: "application/json", schema: outputSchema },
      generation_config: { max_output_tokens: 4096 },
    });
    // Never leave the user waiting on an unresponsive model.
    const interaction = await Promise.race([
      request,
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { timeout: true })), TIMEOUT_MS)),
    ]);
    outputText = interaction.output_text;
  } catch (e) {
    if ((e as { timeout?: boolean }).timeout) throw new HttpError(504, `${GEMINI_MODEL} did not respond within ${TIMEOUT_MS / 1000}s. Try again, or set a different GEMINI_MODEL in server/.env.`);
    const status = (e as { status?: number }).status;
    if (status === 429) throw new HttpError(429, "Gemini rate limit reached (free tier). Wait a minute and try again.");
    if (status === 400) throw new HttpError(502, `Gemini rejected the request: ${(e as Error).message.slice(0, 300)}`);
    if (status === 401 || status === 403) throw new HttpError(502, "Gemini rejected the API key. Check GEMINI_API_KEY in server/.env.");
    throw new HttpError(502, `Gemini request failed: ${(e as Error).message.slice(0, 300)}`);
  }
  if (!outputText) throw new HttpError(502, "Gemini returned no text (the response may have been blocked or cut off).");

  let parsed: z.infer<typeof Output>;
  try {
    parsed = Output.parse(JSON.parse(outputText));
  } catch {
    throw new HttpError(502, "Gemini returned output that did not match the expected format. Try again.");
  }

  const label = AI_MODES.find((m) => m.id === c.mode)?.label ?? c.mode;
  return {
    id: newId("ai"),
    mode: c.mode,
    projectId: c.project.id,
    targetId: c.finding?.targetId ?? c.scan?.targetId,
    scanId: c.scan?.id ?? c.finding?.scanId,
    findingId: c.finding?.id,
    title: `${label} — ${c.finding?.code ?? c.scan?.code ?? c.project.code}`,
    interpretation: parsed.interpretation,
    explanation: parsed.explanation,
    suggestedSeverity: parsed.suggestedSeverity === "none" ? undefined : (parsed.suggestedSeverity as Severity),
    potentialImpact: parsed.potentialImpact,
    recommendations: parsed.recommendations,
    verificationSteps: parsed.verificationSteps,
    reasoning: parsed.reasoning,
    evidenceRefs: built.evidenceIds,
    confidenceCaveat: `AI-generated by ${GEMINI_MODEL} (model-stated confidence: ${parsed.confidence}). Advisory only — it can be wrong and does not confirm anything; an assessor must verify against the evidence.${parsed.evidenceGaps ? ` Evidence gaps noted: ${parsed.evidenceGaps}` : ""}`,
    status: "generated",
    generatedAt: new Date().toISOString(),
    generatedBy: c.requestedBy,
    adapter: "api",
    model: GEMINI_MODEL,
    sentContext: sent,
    redactionCount: count,
  };
}
