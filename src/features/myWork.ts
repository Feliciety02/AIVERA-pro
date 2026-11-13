import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser } from "@/hooks";
import { can } from "@/lib/permissions";
import type { RemediationTask, Report, Target, VulnerabilityFinding } from "@/types";

const CLOSED = ["resolved", "accepted_risk"];

/** Everything waiting on the signed-in person, grouped by kind of work. */
export interface MyWork {
  reviews: VulnerabilityFinding[];
  signoffs: VulnerabilityFinding[];
  fixes: RemediationTask[];
  retests: RemediationTask[];
  fixApprovals: RemediationTask[];
  returnedReports: Report[];
  reportApprovals: Report[];
  websites: Target[];
  total: number;
}

export function useMyWork(): MyWork {
  const user = useCurrentUser();
  const s = useDataStore(useShallow((st) => ({ findings: st.findings, verifications: st.verifications, tasks: st.remediation, reports: st.reports, targets: st.targets })));
  return React.useMemo(() => {
    const id = user?.id;
    const role = user?.role;
    const confirmerOf = (findingId: string) =>
      s.verifications.filter((v) => v.findingId === findingId && v.toStatus === "confirmed").sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0]?.assessorId;
    const reviews = can(role, "verify_findings") ? s.findings.filter((f) => f.assignedAssessorId === id && (f.verificationStatus === "pending" || f.verificationStatus === "needs_review")) : [];
    const signoffs = can(role, "signoff_findings") ? s.findings.filter((f) => f.signoffStatus === "pending" && confirmerOf(f.id) !== id) : [];
    const fixes = s.tasks.filter((t) => t.ownerId === id && (t.status === "open" || t.status === "in_progress"));
    const retests = can(role, "manage_remediation") ? s.tasks.filter((t) => t.status === "awaiting_retest" && t.ownerId !== id && (t.retestAssigneeId ? t.retestAssigneeId === id : true)) : [];
    const fixApprovals = can(role, "approve_remediation") ? s.tasks.filter((t) => t.status === "pending_approval" && t.ownerId !== id) : [];
    const returnedReports = s.reports.filter((r) => r.createdBy === id && r.status === "draft" && !!r.reviewNote);
    const reportApprovals = can(role, "approve_reports") ? s.reports.filter((r) => r.status === "in_review" && r.createdBy !== id) : [];
    const websites = can(role, "authorize_targets") ? s.targets.filter((t) => t.authorizationStatus === "pending") : [];
    const lists = [reviews, signoffs, fixes, retests, fixApprovals, returnedReports, reportApprovals, websites];
    return { reviews, signoffs, fixes, retests, fixApprovals, returnedReports, reportApprovals, websites, total: lists.reduce((n, l) => n + l.length, 0) };
  }, [user?.id, user?.role, s]);
}

export const isOpenTask = (t: RemediationTask) => !CLOSED.includes(t.status);
