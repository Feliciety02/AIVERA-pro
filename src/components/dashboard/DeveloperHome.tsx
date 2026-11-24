import * as React from "react";
import { Link } from "react-router";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { AlarmClock, ArrowRight, CircleCheckBig, Hourglass, ListTodo, PartyPopper, Wrench } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/widgets";
import { SectionCard } from "@/components/shared/display";
import { SeverityBadge, StatusBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useLookups } from "@/hooks";
import { REMEDIATION_STATUS, SEVERITY_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { RemediationTask } from "@/types";

const ACTIVE = new Set(["open", "in_progress"]);
const WAITING = new Set(["awaiting_retest", "pending_approval"]);

function dueLabel(t: RemediationTask) {
  const days = differenceInCalendarDays(parseISO(t.dueDate), new Date());
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, late: true };
  if (days === 0) return { text: "Due today", late: true };
  return { text: days <= 7 ? `Due in ${days} day${days === 1 ? "" : "s"}` : `Due ${format(parseISO(t.dueDate), "MMM d")}`, late: false };
}

/**
 * Home for a website owner: just their fixes. What to do next, what's late, and what is with the
 * security team. No scans, websites or charts; those belong to the people who test.
 */
export function DeveloperHome() {
  const user = useCurrentUser();
  const lookups = useLookups();
  const all = useDataStore((s) => s.remediation);
  const findings = useDataStore((s) => s.findings);
  const mine = React.useMemo(() => all.filter((t) => t.ownerId === user?.id), [all, user?.id]);
  const todo = mine.filter((t) => ACTIVE.has(t.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || SEVERITY_META[a.priority].rank - SEVERITY_META[b.priority].rank);
  const waiting = mine.filter((t) => WAITING.has(t.status));
  const done = mine.filter((t) => t.status === "resolved" || t.status === "accepted_risk");
  const overdue = todo.filter((t) => dueLabel(t).late);

  return (
    <ContentContainer>
      <PageHeader
        title="Your fixes"
        actions={
          <Button size="sm" asChild>
            <Link to="/remediation">
              <Wrench /> All my fixes
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="To do" value={todo.length} icon={ListTodo} accent="var(--primary)" tooltip="Fixes assigned to you that are open or in progress." sub="assigned to you" to="/remediation" />
        <StatCard label="Overdue" value={overdue.length} icon={AlarmClock} accent="var(--sev-critical)" tone={overdue.length ? "text-sev-critical" : undefined} tooltip="Open fixes past their due date. The due date comes from the finding's severity." sub={overdue.length ? "past the due date" : "all on time"} to="/remediation" />
        <StatCard label="With the security team" value={waiting.length} icon={Hourglass} accent="var(--cyan)" tooltip="Fixes you finished that are waiting for a retest or an administrator's approval." sub="retest or approval" to="/remediation" />
        <StatCard label="Done" value={done.length} icon={CircleCheckBig} accent="var(--success)" tooltip="Fixes closed after approval, or accepted as a risk." sub={`of ${mine.length} in total`} to="/remediation" />
      </div>

      <SectionCard
        title="Fix next"
        icon={Wrench}
        actions={
          todo.length > 5 && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/remediation">
                See all <ArrowRight />
              </Link>
            </Button>
          )
        }
      >
        {todo.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-primary">
              <PartyPopper className="size-6" aria-hidden />
            </span>
            <p className="font-medium">You're all caught up</p>
            <p className="text-sm text-muted-foreground">New fixes show up here when the security team confirms a problem.</p>
          </div>
        ) : (
          <ul className="-mx-2 divide-y divide-border">
            {todo.slice(0, 5).map((t) => {
              const due = dueLabel(t);
              const finding = findings.find((f) => f.id === t.findingId);
              return (
                <li key={t.id}>
                  <Link to={`/remediation?task=${t.id}`} className="flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-accent/50">
                    <span className="w-1 self-stretch rounded-full" style={{ background: SEVERITY_META[t.priority].color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title.replace(/^Fix: /, "")}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <SeverityBadge severity={t.priority} />
                        <span className="font-mono">{t.code}</span>
                        {finding && <span className="truncate">· {lookups.targets[finding.targetId]?.name}</span>}
                      </span>
                    </span>
                    <span className="hidden shrink-0 sm:block">
                      <StatusBadge status={t.status} map={REMEDIATION_STATUS} />
                    </span>
                    <span className={cn("w-28 shrink-0 text-right text-xs font-medium", due.late ? "text-sev-critical" : "text-muted-foreground")}>{due.text}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {waiting.length > 0 && (
        <SectionCard title="With the security team" icon={Hourglass}>
          <ul className="-mx-2 divide-y divide-border">
            {waiting.map((t) => (
              <li key={t.id}>
                <Link to={`/remediation?task=${t.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-accent/50">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title.replace(/^Fix: /, "")}</span>
                  <StatusBadge status={t.status} map={REMEDIATION_STATUS} />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </ContentContainer>
  );
}
