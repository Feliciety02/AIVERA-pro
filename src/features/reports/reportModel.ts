/**
 * Builds a single, derived report model used by BOTH the on-screen preview and
 * the PDF exporter, so the two never diverge. Verified findings are re-checked
 * at render time: anything no longer "confirmed" is excluded from the verified
 * section and listed as an exclusion instead.
 */
import type { DataState } from "@/stores/dataStore";
import type { Evidence, Project, RemediationTask, Report, Risk, ScanTool, Severity, Target, User, VulnerabilityFinding } from "@/types";
import { CATEGORY_BY_ID, SEVERITIES, SEVERITY_META, TOOL_META } from "@/lib/constants";
import { riskLevel, riskScore } from "@/lib/risk";

export interface ReportModel {
  report: Report;
  project: Project;
  targets: Target[];
  owner?: User;
  assessors: User[];
  verified: VulnerabilityFinding[];
  excluded: VulnerabilityFinding[];
  unverified: VulnerabilityFinding[];
  evidence: Record<string, Evidence[]>;
  risks: Record<string, Risk | undefined>;
  remediation: Record<string, RemediationTask[]>;
  tools: ScanTool[];
  scanOrigins: { simulated: number; imported: number };
  severityCounts: { severity: Severity; label: string; count: number }[];
  methodology: string[];
  conclusion: string;
  organization: string;
  preparedBy: string;
  watermark: boolean;
  hasSimulated: boolean;
}

export type ReportSource = Pick<DataState, "projects" | "targets" | "users" | "findings" | "evidence" | "risks" | "remediation" | "scans" | "settings">;

export function buildReportModel(report: Report, s: ReportSource): ReportModel | null {
  const project = s.projects.find((p) => p.id === report.projectId);
  if (!project) return null;
  const targets = s.targets.filter((t) => report.targetIds.includes(t.id));
  const selected = s.findings.filter((f) => report.findingIds.includes(f.id));
  const verified = selected.filter((f) => f.verificationStatus === "confirmed").sort((a, b) => SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank);
  const excluded = selected.filter((f) => f.verificationStatus !== "confirmed");
  const inPeriod = (d: string) => d.slice(0, 10) >= report.periodStart.slice(0, 10) && d.slice(0, 10) <= report.periodEnd.slice(0, 10);
  const unverified = report.includeUnverified
    ? s.findings.filter((f) => report.targetIds.includes(f.targetId) && (f.verificationStatus === "pending" || f.verificationStatus === "needs_review") && inPeriod(f.discoveredAt))
    : [];
  const scans = s.scans.filter((sc) => report.targetIds.includes(sc.targetId) && inPeriod(sc.createdAt));
  const tools = [...new Set(scans.flatMap((sc) => sc.config.tools))];
  const ids = new Set([...verified, ...unverified].map((f) => f.id));
  const evidence: Record<string, Evidence[]> = {};
  s.evidence.filter((e) => ids.has(e.findingId)).forEach((e) => (evidence[e.findingId] ??= []).push(e));
  const risks: Record<string, Risk | undefined> = Object.fromEntries(verified.map((f) => [f.id, s.risks.find((r) => r.findingId === f.id)]));
  const remediation: Record<string, RemediationTask[]> = Object.fromEntries(verified.map((f) => [f.id, s.remediation.filter((r) => r.findingId === f.id)]));
  const severityCounts = SEVERITIES.map((sev) => ({ severity: sev, label: SEVERITY_META[sev].label, count: verified.filter((f) => f.severity === sev).length }));
  const crit = severityCounts.find((x) => x.severity === "critical")!.count;
  const high = severityCounts.find((x) => x.severity === "high")!.count;
  const hasSimulated = [...verified, ...unverified].some((f) => f.dataOrigin === "simulated") || scans.some((sc) => sc.dataOrigin === "simulated");

  const methodology = [
    "Scope and authorization were confirmed for each target before testing; exclusions took precedence over allowed paths.",
    `Assessment categories: ${[...new Set(targets.flatMap((t) => t.scope.allowedCategories))].map((c) => CATEGORY_BY_ID[c].name).join("; ")}.`,
    `Tool-assisted checks (${tools.map((t) => TOOL_META[t].label).join(", ") || "none recorded"}) were combined with manual testing using provided test accounts.`,
    "AI-assisted analysis (demo adapter in this build) was used only to support interpretation; every finding in the verified section was confirmed by a human assessor after evidence review.",
    "Risk ratings use a qualitative likelihood × impact model (1–25). These are not CVSS scores.",
  ];
  const conclusion = verified.length
    ? `${verified.length} vulnerabilit${verified.length === 1 ? "y was" : "ies were"} verified${crit + high ? `, including ${crit} critical and ${high} high severity issue(s) that should be prioritised` : ""}. ${Object.values(remediation).flat().filter((t) => t.status === "resolved").length} remediation task(s) have been resolved with retest/approval. A follow-up retest is recommended once open remediation items are complete.`
    : "No vulnerabilities were verified in the selected period. Unverified observations, if listed, require further review and must not be treated as confirmed issues.";

  return {
    report,
    project,
    targets,
    owner: s.users.find((u) => u.id === project.ownerId),
    assessors: s.users.filter((u) => project.memberIds.includes(u.id) && u.role !== "viewer"),
    verified,
    excluded,
    unverified,
    evidence,
    risks,
    remediation,
    tools,
    scanOrigins: { simulated: scans.filter((x) => x.dataOrigin === "simulated").length, imported: scans.filter((x) => x.dataOrigin === "imported").length },
    severityCounts,
    methodology,
    conclusion,
    organization: s.settings.general.organizationName,
    preparedBy: s.settings.reports.preparedBy,
    watermark: s.settings.reports.showDemoWatermark,
    hasSimulated,
  };
}

export function riskSummary(r?: Risk): string {
  return r ? `${riskScore(r.likelihood, r.impact)} (${riskLevel(r)}) — L${r.likelihood} × I${r.impact}` : "Not rated";
}

export const DEMO_DISCLAIMER =
  "DEMONSTRATION REPORT — Generated by AEGIS AI from fictional demonstration data. It does not describe a real system and is not a real security assessment report.";
