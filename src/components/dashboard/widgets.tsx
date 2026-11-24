import * as React from "react";
import { Link } from "react-router";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Info, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Hint } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { SeverityBadge, StatusBadge } from "@/components/security/badges";
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
  accent,
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
  /** CSS colour for the icon chip and glow, e.g. "var(--sev-high)". Defaults to the tone, else primary. */
  accent?: string;
}) {
  const color = accent ?? toneColor(tone) ?? "var(--primary)";
  const body = (
    <Card className={cn("group relative h-full overflow-hidden px-5 py-4 transition-shadow", to && "hover:shadow-md")}>
      <span className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-60 blur-2xl" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }} aria-hidden />
      <div className="relative flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <p className="leading-tight">{label}</p>
        <Hint label={tooltip}>
          <span tabIndex={0} role="button" aria-label={`About ${label}`} className="ml-auto text-muted-foreground/70 hover:text-foreground" onClick={(e) => e.preventDefault()}>
            <Info className="size-3.5" />
          </span>
        </Hint>
      </div>
      <p className={cn("relative mt-3 text-[32px] leading-9 font-semibold tracking-tight tabular-nums", tone?.includes("critical") ? tone : "text-foreground")}>{value}</p>
      <div className="relative mt-1 flex min-h-4 items-center gap-2 text-xs text-muted-foreground">
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

/** "text-sev-high" → "var(--sev-high)", so a tone class can also colour backgrounds. */
export function toneColor(tone?: string) {
  return tone?.startsWith("text-") && tone !== "text-foreground" ? `var(--${tone.slice(5)})` : undefined;
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
