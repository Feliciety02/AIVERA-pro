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
