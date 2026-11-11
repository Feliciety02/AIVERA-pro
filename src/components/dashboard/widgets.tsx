import * as React from "react";
import { Link } from "react-router";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Info, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Hint } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { SeverityBadge, StatusBadge, OriginBadge } from "@/components/security/badges";
import { VERIFICATION_STATUS } from "@/lib/constants";
import type { ActivityLog, User, VulnerabilityFinding } from "@/types";
import { EmptyState } from "@/components/shared/states";
import { activityIcon } from "@/features/activityMeta";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "text-foreground",
  tooltip,
  trend,
  sub,
  to,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: string;
  /** Kept for call-site compatibility; icons are rendered neutral in the redesign. */
  iconTone?: string;
  tooltip: string;
  trend?: { delta: number; goodWhenDown?: boolean; label: string };
  sub?: React.ReactNode;
  to?: string;
}) {
  const body = (
    <Card className={cn("group relative h-full overflow-hidden px-5 py-4 transition-colors", to && "hover:bg-accent/40")}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        <p>{label}</p>
        <Hint label={tooltip}>
          <span tabIndex={0} role="button" aria-label={`About ${label}`} className="ml-auto text-muted-foreground/70 hover:text-foreground" onClick={(e) => e.preventDefault()}>
            <Info className="size-3.5" />
          </span>
        </Hint>
      </div>
      {/* Numbers stay neutral; only critical counts get colour. */}
      <p className={cn("mt-3 text-[28px] leading-9 font-normal tabular-nums", tone?.includes("critical") ? tone : "text-foreground")}>{value}</p>
      <div className="mt-1 flex min-h-4 items-center gap-2 text-xs text-muted-foreground">
        {trend && trend.delta !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", (trend.delta > 0) !== !!trend.goodWhenDown ? "text-success" : "text-sev-critical")}>
            {trend.delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(trend.delta)}
          </span>
        )}
        {trend && <span>{trend.delta === 0 ? `No change ${trend.label}` : trend.label}</span>}
        {!trend && sub}
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export function RecentActivity({ items, users, limit = 8 }: { items: ActivityLog[]; users: Record<string, User>; limit?: number }) {
  if (!items.length) return <EmptyState compact title="No activity yet" />;
  return (
    <ol className="relative space-y-3.5 before:absolute before:top-1 before:bottom-1 before:left-[11px] before:w-px before:bg-border">
      {items.slice(0, limit).map((a) => {
        const { icon: Icon, tone } = activityIcon(a.type);
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={cn("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card", tone)}>
              <Icon className="size-3" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug">
                <span className="font-medium">{users[a.userId]?.name ?? "System"}</span> <span className="text-muted-foreground">{a.description}</span>
              </p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">
                {a.entityLabel} · {formatRelative(a.timestamp)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function FindingRow({ finding, target, right }: { finding: VulnerabilityFinding; target?: string; right?: React.ReactNode }) {
  return (
    <Link to={`/findings/${finding.id}`} className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
      <SeverityBadge severity={finding.severity} className="w-[70px] justify-center" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium group-hover:text-primary">{finding.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          <span className="font-mono">{finding.code}</span> · {target}
        </p>
      </div>
      {right ?? <StatusBadge status={finding.verificationStatus} map={VERIFICATION_STATUS} className="hidden sm:inline-flex" />}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}

export function VerificationQueue({ findings, targets, aiSent }: { findings: VulnerabilityFinding[]; targets: Record<string, { name: string }>; aiSent: Set<string> }) {
  if (!findings.length) return <EmptyState compact title="Verification queue is empty" description="Every finding has a human decision." />;
  return (
    <div className="-mx-2 space-y-0.5">
      {findings.map((f) => (
        <FindingRow
          key={f.id}
          finding={f}
          target={targets[f.targetId]?.name}
          right={
            <span className="hidden items-center gap-1.5 sm:flex">
              {aiSent.has(f.id) && <span className="rounded border border-primary/30 bg-primary/10 px-1 text-[10px] text-primary">AI notes</span>}
              {f.dataOrigin === "simulated" && <OriginBadge origin="simulated" />}
              <span className="text-[10.5px] text-muted-foreground">{formatRelative(f.discoveredAt)}</span>
            </span>
          }
        />
      ))}
    </div>
  );
}
