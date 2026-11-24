/**
 * Derived notifications. Runs in the browser against demo state only.
 * Overdue remediation tasks produce one notification per task (deduplicated by
 * link), honouring Settings → Notifications → Remediation due dates.
 */
import { useDataStore } from "@/stores/dataStore";
import { daysUntil } from "@/lib/format";

export function checkOverdueRemediation(): number {
  const s = useDataStore.getState();
  if (!s.settings.notifications.remediationDue) return 0;
  let added = 0;
  s.remediation
    .filter((t) => t.status !== "resolved" && t.status !== "accepted_risk" && (daysUntil(t.dueDate) ?? 0) < 0)
    .forEach((t) => {
      const link = `/remediation?task=${t.id}`;
      if (useDataStore.getState().notifications.some((n) => n.link === link && n.title === "Remediation overdue")) return;
      useDataStore.getState().pushNotification({ title: "Remediation overdue", message: `${t.code} (${t.title}) is ${Math.abs(daysUntil(t.dueDate) ?? 0)} day(s) past its due date.`, tone: "critical", link });
      added++;
    });
  return added;
}

/** Findings no person has verified after this many days get a reminder (once a day per project). Same rule as the server. */
const VERIFY_REMIND_AFTER_DAYS = 2;

export function checkUnverifiedFindings(): number {
  const s = useDataStore.getState();
  if (!s.settings.notifications.findingUpdates) return 0;
  const cutoff = Date.now() - VERIFY_REMIND_AFTER_DAYS * 86400_000;
  const waiting = s.findings.filter((f) => (f.verificationStatus === "pending" || f.verificationStatus === "needs_review") && new Date(f.discoveredAt).getTime() < cutoff);
  const byProject = new Map<string, typeof waiting>();
  for (const f of waiting) byProject.set(f.projectId, [...(byProject.get(f.projectId) ?? []), f]);
  let added = 0;
  for (const [projectId, list] of byProject) {
    const link = `/findings?project=${projectId}&status=unverified`;
    const dayAgo = Date.now() - 86400_000;
    if (useDataStore.getState().notifications.some((n) => n.link === link && n.title === "Still waiting for verification" && new Date(n.createdAt).getTime() > dayAgo)) continue;
    const project = s.projects.find((p) => p.id === projectId);
    const n = list.length;
    // Demo notifications are shared, so one message names who each finding is with.
    const names = [...new Set(list.map((f) => s.users.find((u) => u.id === f.assignedAssessorId)?.name).filter(Boolean))];
    useDataStore.getState().pushNotification({
      title: "Still waiting for verification",
      message: `${n} finding${n === 1 ? "" : "s"} in ${project ? `${project.code} ${project.name}` : "a project"} ${n === 1 ? "has" : "have"} not been verified by a person${names.length ? ` (assigned to ${names.join(", ")})` : ""}.`,
      tone: "warning",
      link,
    });
    added++;
  }
  return added;
}
