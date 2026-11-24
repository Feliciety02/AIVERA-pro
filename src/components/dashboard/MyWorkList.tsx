import { Link } from "react-router";
import { BadgeCheck, ClipboardCheck, FilePen, FileText, ShieldAlert, Target, Wrench, type LucideIcon } from "lucide-react";
import { SeverityBadge, StatusBadge, ToneBadge } from "@/components/security/badges";
import { useLookups } from "@/hooks";
import type { MyWork } from "@/features/myWork";
import { REMEDIATION_STATUS, VERIFICATION_STATUS } from "@/lib/constants";
import { daysUntil, formatDate } from "@/lib/format";
import type { RemediationTask } from "@/types";

interface Row { id: string; to: string; code: string; title: string; badge?: React.ReactNode; meta?: React.ReactNode }
interface GroupDef { key: string; title: string; icon: LucideIcon; hint: string; rows: Row[]; viewAll: string }

const due = (iso: string) => {
  const d = daysUntil(iso);
  return d === null ? formatDate(iso) : d < 0 ? <span className="text-sev-critical">Overdue {Math.abs(d)}d</span> : `Due ${formatDate(iso)}`;
};

const taskRow = (t: RemediationTask, badge?: React.ReactNode): Row => ({
  id: t.id, to: `/remediation?task=${t.id}`, code: t.code, title: t.title, meta: due(t.dueDate), badge: badge ?? <SeverityBadge severity={t.priority} />,
});

/** Everything waiting on the signed-in person, one group per kind of work. */
export function useMyWorkGroups(w: MyWork): GroupDef[] {
  const lookups = useLookups();
  return [
    { key: "websites", title: "Websites to authorize", icon: Target, hint: "Check the owner's permission, then mark the website authorized so it can be scanned.", viewAll: "/my-work", rows: w.websites.map((t) => ({ id: t.id, to: `/targets/${t.id}`, code: t.authorizationReference || "Website", title: t.name, meta: t.url })) },
    { key: "signoffs", title: "Critical and high findings to sign off", icon: BadgeCheck, hint: "A second look before they go into a final report.", viewAll: "/findings", rows: w.signoffs.map((f) => ({ id: f.id, to: `/findings/${f.id}`, code: f.code, title: f.title, meta: lookups.targets[f.targetId]?.name, badge: <SeverityBadge severity={f.severity} /> })) },
    { key: "reviews", title: "Findings to review", icon: ShieldAlert, hint: "Check the evidence, then confirm or reject.", viewAll: "/findings?status=unverified", rows: w.reviews.map((f) => ({ id: f.id, to: `/findings/${f.id}`, code: f.code, title: f.title, meta: lookups.targets[f.targetId]?.name, badge: <StatusBadge status={f.verificationStatus} map={VERIFICATION_STATUS} /> })) },
    { key: "fixApprovals", title: "Fixes to approve", icon: ClipboardCheck, hint: "The fix is done (and retested where needed). Approve closing it or send it back.", viewAll: "/remediation", rows: w.fixApprovals.map((t) => taskRow(t)) },
    { key: "retests", title: "Retests to do", icon: ClipboardCheck, hint: "The developer says it's fixed. Check it within the approved scope.", viewAll: "/remediation", rows: w.retests.map((t) => taskRow(t)) },
    { key: "fixes", title: "Your fixes", icon: Wrench, hint: "Fix it, then mark it ready for retest.", viewAll: "/remediation", rows: w.fixes.map((t) => taskRow(t, <StatusBadge status={t.status} map={REMEDIATION_STATUS} />)) },
    { key: "reportApprovals", title: "Reports to approve", icon: FileText, hint: "Approve as final, or send back with what to change.", viewAll: "/reports", rows: w.reportApprovals.map((r) => ({ id: r.id, to: `/reports/${r.id}`, code: r.code, title: r.title, meta: `By ${lookups.users[r.createdBy]?.name ?? "unknown"}`, badge: <ToneBadge tone="warning">In review</ToneBadge> })) },
    { key: "returnedReports", title: "Reports sent back to you", icon: FilePen, hint: "The lead asked for changes.", viewAll: "/reports", rows: w.returnedReports.map((r) => ({ id: r.id, to: `/reports/${r.id}`, code: r.code, title: r.title, meta: r.reviewNote })) },
  ].filter((g) => g.rows.length > 0);
}

/**
 * The "waiting on you" list. `limit` caps the rows per group (Home shows a short preview);
 * without it every row is shown (the My work page).
 */
export function MyWorkList({ work, limit }: { work: MyWork; limit?: number }) {
  const groups = useMyWorkGroups(work);
  return (
    <div className="divide-y divide-border">
      {groups.map((g) => {
        const rows = limit ? g.rows.slice(0, limit) : g.rows;
        const more = g.rows.length - rows.length;
        return (
          <section key={g.key} className="py-3 first:pt-0 last:pb-0" aria-label={g.title}>
            <div className="mb-1 flex items-center gap-2">
              <g.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-semibold">
                {g.title} <span className="font-normal text-muted-foreground tabular-nums">({g.rows.length})</span>
              </h3>
            </div>
            <p className="mb-1.5 pl-6 text-xs text-muted-foreground">{g.hint}</p>
            <ul>
              {rows.map((r) => (
                <li key={r.id}>
                  <Link to={r.to} className="flex min-w-0 items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50">
                    <span className="hidden w-20 shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">{r.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                    {r.meta && <span className="hidden max-w-[40%] truncate text-xs text-muted-foreground sm:inline">{r.meta}</span>}
                    <span className="shrink-0">{r.badge}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {more > 0 && (
              <Link to={g.viewAll} className="mt-1 inline-block pl-2 text-xs font-medium text-primary hover:underline">
                {more} more…
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
