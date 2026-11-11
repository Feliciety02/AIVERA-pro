/**
 * AI analysis service.
 *
 * `AIAdapter` is the contract the UI depends on. In this phase the only
 * implementation is `demoAIAdapter`, which returns PREDEFINED SAMPLE analyses
 * keyed to the selected synthetic finding's template. It does not call any
 * language model and never invents evidence: it only references evidence IDs
 * that already exist in the store.
 *
 * A future `apiAIAdapter` will POST to the backend AI gateway (see
 * `src/services/api/contracts.ts`), where model keys and evidence redaction live.
 */
import type { AIAnalysis, AIMode, Evidence, ID, Project, Scan, ScanResult, VulnerabilityFinding } from "@/types";
import { TEMPLATE_BY_KEY } from "@/data/findingTemplates";
import { CATEGORY_BY_ID, SEVERITY_META, TOOL_META } from "@/lib/constants";
import { createId, delay } from "@/lib/utils";
import { nowISO } from "@/lib/format";

export interface AIAnalysisRequest {
  mode: AIMode;
  project: Project;
  scan?: Scan;
  scanResults?: ScanResult[];
  finding?: VulnerabilityFinding;
  evidence: Evidence[];
  /** Used only for assessment summaries. */
  projectFindings?: VulnerabilityFinding[];
  requestedBy: ID;
}

export interface AIAdapter {
  readonly kind: "demo" | "api";
  readonly label: string;
  analyze(req: AIAnalysisRequest): Promise<AIAnalysis>;
}

export const DEMO_CAVEAT =
  "Sample AI Analysis — Demo Mode. This text is a predefined sample linked to the synthetic finding; it was not produced by a language model. AI output is advisory only and must be verified by a human assessor before any decision.";

function base(req: AIAnalysisRequest, title: string): Omit<AIAnalysis, "interpretation" | "explanation" | "potentialImpact" | "recommendations" | "verificationSteps" | "reasoning" | "suggestedSeverity"> {
  return {
    id: createId("ai"),
    mode: req.mode,
    projectId: req.project.id,
    targetId: req.finding?.targetId ?? req.scan?.targetId,
    scanId: req.scan?.id ?? req.finding?.scanId,
    findingId: req.finding?.id,
    title,
    evidenceRefs: req.evidence.map((e) => e.id),
    confidenceCaveat: DEMO_CAVEAT,
    status: "generated",
    generatedAt: nowISO(),
    generatedBy: req.requestedBy,
    adapter: "demo",
  };
}

function findingAnalysis(req: AIAnalysisRequest): AIAnalysis {
  const f = req.finding!;
  const t = TEMPLATE_BY_KEY[f.templateKey];
  const modeTitle: Record<AIMode, string> = {
    scan_interpretation: "Scan result interpretation",
    vulnerability_explanation: "Vulnerability explanation",
    risk_prioritization: "Risk prioritization",
    remediation: "Remediation recommendations",
    test_recommendations: "Security test recommendations",
    assessment_summary: "Assessment summary",
  };
  const title = `${modeTitle[req.mode]} — ${f.code}`;
  if (!t) {
    // Imported or manually recorded findings have no predefined sample. Be explicit
    // instead of fabricating content: only echo fields already on the record.
    const origin = f.templateKey.startsWith("import:") ? "imported tool report" : f.sourceTool === "manual" ? "assessor's manual record" : "finding record";
    return {
      ...base(req, title),
      interpretation: `No sample AI analysis exists for this finding in demo mode. The content below is copied from the ${origin}, not generated.`,
      explanation: f.description,
      potentialImpact: f.impact,
      recommendations: [f.remediation],
      verificationSteps: ["Review each attached evidence item.", "Reproduce the behaviour within the authorized scope before deciding.", "Record the outcome with a verification decision."],
      reasoning: [`Source: ${origin}.`, `${req.evidence.length} evidence item(s) attached.`, "A real AI analysis requires the backend AI gateway (not part of this phase)."],
      suggestedSeverity: undefined,
    };
  }
  const s = t.sample;
  const evidenceNote = req.evidence.length ? `Referenced evidence: ${req.evidence.map((e) => e.title).join("; ")}.` : "No evidence items are attached to this finding yet.";
  switch (req.mode) {
    case "risk_prioritization":
      return { ...base(req, title), interpretation: s.priority, explanation: s.explanation, potentialImpact: t.impact, recommendations: [s.priority, ...s.remediation.slice(0, 2)], verificationSteps: s.verification, reasoning: [...s.reasoning, `Reported severity: ${SEVERITY_META[f.severity].label}; sample suggestion: ${SEVERITY_META[s.suggestedSeverity].label}.`], suggestedSeverity: s.suggestedSeverity };
    case "remediation":
      return { ...base(req, title), interpretation: `Remediation guidance for ${CATEGORY_BY_ID[f.category].name.toLowerCase()} weakness.`, explanation: t.remediation, potentialImpact: t.impact, recommendations: s.remediation, verificationSteps: s.verification, reasoning: s.reasoning, suggestedSeverity: s.suggestedSeverity };
    case "test_recommendations":
      return { ...base(req, title), interpretation: "Suggested manual tests to confirm or rule out this observation, within the approved scope.", explanation: s.explanation, potentialImpact: t.impact, recommendations: s.tests, verificationSteps: s.verification, reasoning: [evidenceNote, ...s.reasoning.slice(0, 2)], suggestedSeverity: s.suggestedSeverity };
    case "vulnerability_explanation":
    default:
      return { ...base(req, title), interpretation: s.interpretation, explanation: s.explanation, potentialImpact: t.impact, recommendations: s.remediation, verificationSteps: s.verification, reasoning: [evidenceNote, ...s.reasoning], suggestedSeverity: s.suggestedSeverity };
  }
}

function scanAnalysis(req: AIAnalysisRequest): AIAnalysis {
  const scan = req.scan!;
  const results = req.scanResults ?? [];
  const total = results.reduce((n, r) => n + r.itemsFound, 0);
  return {
    ...base(req, `Scan result interpretation — ${scan.code}`),
    interpretation: `${scan.code} (${scan.dataOrigin.toUpperCase()}) recorded ${total} item(s) across ${results.length} tool output(s). ${results.map((r) => `${TOOL_META[r.tool].label}: ${r.summary}`).join(" ")}`,
    explanation: "Scan output lists indicators, not confirmed vulnerabilities. Each indicator must be reviewed against its evidence and reproduced manually before being confirmed.",
    potentialImpact: "Depends on verification outcome of individual findings.",
    recommendations: [
      "Review high-severity indicators first.",
      "Discard indicators outside the approved scope.",
      scan.dataOrigin === "simulated" ? "Remember: these results are SIMULATED and cannot be used as real evidence." : "Imported sample output should be cross-checked with the tool's original report.",
    ],
    verificationSteps: ["Open each linked finding in Findings & Evidence.", "Mark evidence reviewed and record a verification decision."],
    reasoning: results.map((r) => `${TOOL_META[r.tool].label} output summary: ${r.summary}`),
    suggestedSeverity: undefined,
  };
}

function summaryAnalysis(req: AIAnalysisRequest): AIAnalysis {
  const all = req.projectFindings ?? [];
  const confirmed = all.filter((f) => f.verificationStatus === "confirmed");
  const pending = all.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review");
  const bySev = (sev: string) => confirmed.filter((f) => f.severity === sev).length;
  const top = [...confirmed].sort((a, b) => SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank).slice(0, 3);
  return {
    ...base(req, `Assessment summary — ${req.project.code}`),
    interpretation: `Draft summary built from ${confirmed.length} human-confirmed finding(s). ${pending.length} observation(s) remain unverified and are excluded from conclusions.`,
    explanation: `The ${req.project.name} engagement (demonstration data) confirmed ${bySev("critical")} critical, ${bySev("high")} high, ${bySev("medium")} medium and ${bySev("low")} low severity issues. ${top.length ? `Most significant: ${top.map((f) => f.title).join("; ")}.` : "No confirmed issues yet."}`,
    potentialImpact: top[0]?.impact ?? "No confirmed impact yet.",
    recommendations: top.map((f) => `${f.code}: ${f.remediation}`),
    verificationSteps: ["Have the lead assessor review this draft before it is used in a report.", "Verify the counts against the Findings register."],
    reasoning: [`Counts are computed from findings with status "confirmed" only.`, `${pending.length} pending/needs-review items are not treated as vulnerabilities.`],
    suggestedSeverity: undefined,
  };
}

export const demoAIAdapter: AIAdapter = {
  kind: "demo",
  label: "Demo Adapter (predefined samples)",
  async analyze(req) {
    await delay(650); // emulate latency so loading states are visible
    if (req.mode === "assessment_summary") return summaryAnalysis(req);
    if (req.mode === "scan_interpretation" && req.scan && !req.finding) return scanAnalysis(req);
    if (!req.finding) throw new Error("Select a finding for this analysis mode.");
    return findingAnalysis(req);
  },
};

/** Placeholder for the future backend adapter. Intentionally not callable yet. */
export const apiAIAdapter: AIAdapter = {
  kind: "api",
  label: "Backend AI Gateway (not configured)",
  async analyze() {
    throw new Error("The AI backend is not available in this frontend-only phase.");
  },
};

export const aiService: AIAdapter = demoAIAdapter;
