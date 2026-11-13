import { Link } from "react-router";
import { BadgeCheck, ClipboardCheck, FilePen, FileText, Inbox, ShieldAlert, Target, Wrench, type LucideIcon } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { SeverityBadge, StatusBadge, ToneBadge } from "@/components/security/badges";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { useMyWork } from "@/features/myWork";
import { REMEDIATION_STATUS, ROLE_META, VERIFICATION_STATUS } from "@/lib/constants";
import { daysUntil, formatDate } from "@/lib/format";

interface Row { id: string; to: string; code: string; title: string; badge?: React.ReactNode; meta?: React.ReactNode }

function Group({ title, icon, hint, rows }: { title: string; icon: LucideIcon; hint: string; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <SectionCard title={`${title} (${rows.length})`} icon={icon} description={hint}>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={r.to} className="flex min-w-0 items-center gap-3 rounded-md px-2 py-2.5 hover:bg-accent/50">
              <span className="hidden w-20 shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">{r.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
              {r.meta && <span className="hidden text-xs text-muted-foreground sm:inline">{r.meta}</span>}
              <span className="shrink-0">{r.badge}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

const due = (iso: string) => {
  const d = daysUntil(iso);
  return d === null ? formatDate(iso) : d < 0 ? <span className="text-sev-critical">Overdue {Math.abs(d)}d</span> : `Due ${formatDate(iso)}`;
};

export default function MyWorkPage() {
  useDocumentTitle("My work");
  const user = useCurrentUser();
  const lookups = useLookups();
  const w = useMyWork();
  const task = (to: (id: string) => string) => (t: { id: string; code: string; title: string; priority: Parameters<typeof SeverityBadge>[0]["severity"]; dueDate: string; status: keyof typeof REMEDIATION_STATUS }) => ({
    id: t.id, to: to(t.id), code: t.code, title: t.title, meta: due(t.dueDate), badge: <SeverityBadge severity={t.priority} />,
  });

  return (
    <ContentContainer>
      <PageHeader
        title="My work"
        description={user ? `What is waiting on you as ${ROLE_META[user.role].label}. Work is assigned automatically: new findings go to the assessor with the fewest open reviews, fixes go to the project's developer, and approvals go to the project's lead.` : undefined}
      />
      {w.total === 0 ? (
        <EmptyState icon={Inbox} title="Nothing waiting on you" description="New assignments show up here and in your notifications." />
      ) : (
        // minmax(0,1fr) lets long titles truncate instead of widening the page on phones.
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <Group title="Websites to authorize" icon={Target} hint="Check the owner's permission, then mark the website authorized so it can be scanned." rows={w.websites.map((t) => ({ id: t.id, to: `/targets/${t.id}`, code: t.authorizationReference || "Website", title: t.name, meta: t.url }))} />
          <Group title="Critical and high findings to sign off" icon={BadgeCheck} hint="A second look before they go into a final report." rows={w.signoffs.map((f) => ({ id: f.id, to: `/findings/${f.id}`, code: f.code, title: f.title, meta: lookups.targets[f.targetId]?.name, badge: <SeverityBadge severity={f.severity} /> }))} />
          <Group title="Findings to review" icon={ShieldAlert} hint="Check the evidence, then confirm or reject." rows={w.reviews.map((f) => ({ id: f.id, to: `/findings/${f.id}`, code: f.code, title: f.title, meta: lookups.targets[f.targetId]?.name, badge: <StatusBadge status={f.verificationStatus} map={VERIFICATION_STATUS} /> }))} />
          <Group title="Fixes to approve" icon={ClipboardCheck} hint="The fix is done (and retested where needed). Approve closing it or send it back." rows={w.fixApprovals.map(task((id) => `/remediation?task=${id}`))} />
          <Group title="Retests to do" icon={ClipboardCheck} hint="The developer says it's fixed. Check it within the approved scope." rows={w.retests.map(task((id) => `/remediation?task=${id}`))} />
          <Group title="Your fixes" icon={Wrench} hint="Fix it, then mark it ready for retest." rows={w.fixes.map((t) => ({ ...task((id) => `/remediation?task=${id}`)(t), badge: <StatusBadge status={t.status} map={REMEDIATION_STATUS} /> }))} />
          <Group title="Reports to approve" icon={FileText} hint="Approve as final, or send back with what to change." rows={w.reportApprovals.map((r) => ({ id: r.id, to: `/reports/${r.id}`, code: r.code, title: r.title, meta: `By ${lookups.users[r.createdBy]?.name ?? "unknown"}`, badge: <ToneBadge tone="warning">In review</ToneBadge> }))} />
          <Group title="Reports sent back to you" icon={FilePen} hint="The lead asked for changes." rows={w.returnedReports.map((r) => ({ id: r.id, to: `/reports/${r.id}`, code: r.code, title: r.title, meta: r.reviewNote }))} />
        </div>
      )}
    </ContentContainer>
  );
}
