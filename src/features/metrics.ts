/**
 * Derived metrics. Every number shown on dashboards/analytics is computed here
 * from store entities, nothing is hardcoded separately from the source data.
 */
import { eachWeekOfInterval, endOfWeek, format, isWithinInterval, parseISO, startOfWeek, subWeeks } from "date-fns";
import type { DataState } from "@/stores/dataStore";
import type { AssessmentCategoryId, RemediationStatus, Severity, VerificationStatus, VulnerabilityFinding } from "@/types";
import { CATEGORIES, REMEDIATION_STATUS, SEVERITIES, SEVERITY_META, VERIFICATION_STATUS } from "@/lib/constants";
import { percent } from "@/lib/utils";

export interface DashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  registeredTargets: number;
  authorizedTargets: number;
  completedAssessments: number;
  potentialFindings: number;
  confirmed: number;
  criticalConfirmed: number;
  pendingVerification: number;
  remediationProgress: number;
  remediationDone: number;
  remediationTotal: number;
  findingsLast30: number;
  findingsPrev30: number;
}

const DAY = 86400_000;

export function computeDashboardMetrics(s: Pick<DataState, "projects" | "targets" | "scans" | "findings" | "remediation" | "assessments">, now = Date.now()): DashboardMetrics {
  const confirmed = s.findings.filter((f) => f.verificationStatus === "confirmed");
  const done = s.remediation.filter((r) => r.status === "resolved" || r.status === "accepted_risk").length;
  const t = (f: VulnerabilityFinding) => parseISO(f.discoveredAt).getTime();
  return {
    totalProjects: s.projects.filter((p) => p.status !== "archived").length,
    activeProjects: s.projects.filter((p) => p.status === "in_progress" || p.status === "under_review").length,
    registeredTargets: s.targets.length,
    authorizedTargets: s.targets.filter((x) => x.authorizationStatus === "authorized" && x.authorizationConfirmed).length,
    completedAssessments: s.assessments.filter((a) => a.status === "completed").length,
    potentialFindings: s.findings.filter((f) => f.verificationStatus !== "rejected").length,
    confirmed: confirmed.length,
    criticalConfirmed: confirmed.filter((f) => f.severity === "critical").length,
    pendingVerification: s.findings.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review").length,
    remediationProgress: percent(done, s.remediation.length),
    remediationDone: done,
    remediationTotal: s.remediation.length,
    findingsLast30: s.findings.filter((f) => now - t(f) <= 30 * DAY).length,
    findingsPrev30: s.findings.filter((f) => now - t(f) > 30 * DAY && now - t(f) <= 60 * DAY).length,
  };
}

export function severityDistribution(findings: VulnerabilityFinding[]) {
  return SEVERITIES.map((sev) => ({ key: sev, name: SEVERITY_META[sev].label, value: findings.filter((f) => f.severity === sev).length, fill: SEVERITY_META[sev].color }));
}

export function verificationDistribution(findings: VulnerabilityFinding[]) {
  const order: VerificationStatus[] = ["pending", "needs_review", "confirmed", "rejected"];
  const colors: Record<VerificationStatus, string> = { pending: "var(--sev-medium)", needs_review: "var(--sev-low)", confirmed: "var(--primary)", rejected: "var(--sev-info)" };
  return order.map((st) => ({ key: st, name: VERIFICATION_STATUS[st].label, value: findings.filter((f) => f.verificationStatus === st).length, fill: colors[st] }));
}

export function remediationDistribution(tasks: DataState["remediation"]) {
  const order: RemediationStatus[] = ["open", "in_progress", "awaiting_retest", "resolved", "accepted_risk"];
  const colors: Record<RemediationStatus, string> = { open: "var(--sev-medium)", in_progress: "var(--cyan)", awaiting_retest: "var(--sev-low)", resolved: "var(--primary)", accepted_risk: "var(--sev-info)" };
  return order.map((st) => ({ key: st, name: REMEDIATION_STATUS[st].label, value: tasks.filter((t) => t.status === st).length, fill: colors[st] }));
}

export function categoryBreakdown(findings: VulnerabilityFinding[]) {
  return CATEGORIES.map((c) => {
    const inCat = findings.filter((f) => f.category === c.id);
    return {
      key: c.id as AssessmentCategoryId,
      name: c.short,
      confirmed: inCat.filter((f) => f.verificationStatus === "confirmed").length,
      unverified: inCat.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review").length,
      rejected: inCat.filter((f) => f.verificationStatus === "rejected").length,
      total: inCat.length,
    };
  });
}

/** Weekly buckets ending at `end`, counting findings by severity and confirmed state. */
export function findingsOverTime(findings: VulnerabilityFinding[], weeks = 12, end = new Date()) {
  const start = startOfWeek(subWeeks(end, weeks - 1), { weekStartsOn: 1 });
  return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map((weekStart) => {
    const interval = { start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) };
    const inWeek = findings.filter((f) => isWithinInterval(parseISO(f.discoveredAt), interval));
    const row: Record<string, number | string> = { week: format(weekStart, "MMM d"), total: inWeek.length, confirmed: inWeek.filter((f) => f.verificationStatus === "confirmed").length };
    for (const sev of SEVERITIES) row[sev] = inWeek.filter((f) => f.severity === sev).length;
    return row as { week: string; total: number; confirmed: number } & Record<Severity, number>;
  });
}

export function activityOverTime(activity: DataState["activity"], scans: DataState["scans"], weeks = 12, end = new Date()) {
  const start = startOfWeek(subWeeks(end, weeks - 1), { weekStartsOn: 1 });
  return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map((weekStart) => {
    const interval = { start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) };
    return {
      week: format(weekStart, "MMM d"),
      scans: scans.filter((s) => isWithinInterval(parseISO(s.createdAt), interval)).length,
      verifications: activity.filter((a) => ["finding_confirmed", "finding_rejected", "finding_needs_review"].includes(a.type) && isWithinInterval(parseISO(a.timestamp), interval)).length,
      events: activity.filter((a) => isWithinInterval(parseISO(a.timestamp), interval)).length,
    };
  });
}
