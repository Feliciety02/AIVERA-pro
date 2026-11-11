import { Bot, FlaskConical, Globe, Network, Radar, ScanSearch, ShieldCheck, ShieldOff, ShieldQuestion, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATA_ORIGIN, SEVERITY_META, SOURCE_LABEL, TONE_CLASS, type StatusMeta, type Tone } from "@/lib/constants";
import { Hint } from "@/components/ui/misc";
import type { DataOrigin, FindingSource, Severity } from "@/types";

const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-4";

/** Flat tinted chip. `dot` is accepted for API compatibility but not drawn (cleaner, Google-style chips). */
export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return <span className={cn(base, TONE_CLASS[tone], className)}>{children}</span>;
}

/** Severity shown as a solid colour square + label, as in Google Security Command Center. */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const m = SEVERITY_META[severity];
  return (
    <span className={cn(base, "px-0", m.className, className)}>
      <span className="size-2.5 rounded-[2px]" style={{ background: m.color }} aria-hidden />
      {m.label}
    </span>
  );
}

/** Generic status badge driven by a meta map from lib/constants. */
export function StatusBadge<K extends string>({ status, map, className }: { status: K; map: Record<K, StatusMeta>; className?: string }) {
  const m = map[status];
  return (
    <ToneBadge tone={m.tone} dot className={className}>
      {m.label}
    </ToneBadge>
  );
}

const TOOL_ICON: Record<FindingSource, LucideIcon> = {
  nmap: Network,
  owasp_zap: ScanSearch,
  dns_utils: Globe,
  http_inspector: Radar,
  manual: UserRound,
};

export function ToolBadge({ tool, className }: { tool: FindingSource; className?: string }) {
  const Icon = TOOL_ICON[tool];
  return (
    <span className={cn(base, "border-transparent bg-secondary px-1.5 font-normal text-secondary-foreground", className)}>
      <Icon className="size-3" aria-hidden />
      {SOURCE_LABEL[tool]}
    </span>
  );
}

/** Provenance badge, makes synthetic/simulated/imported data visible everywhere it appears. */
export function OriginBadge({ origin, className }: { origin: DataOrigin; className?: string }) {
  const m = DATA_ORIGIN[origin];
  return (
    <Hint label={m.description}>
      <span tabIndex={0} className={cn(base, TONE_CLASS[m.tone], "cursor-help", className)}>
        {origin === "simulated" ? <FlaskConical className="size-3" aria-hidden /> : null}
        {m.label}
      </span>
    </Hint>
  );
}

export function ScopeBadge({ inScope, className }: { inScope: boolean; className?: string }) {
  return inScope ? (
    <ToneBadge tone="primary" className={className}>
      <ShieldCheck className="size-3" /> In scope
    </ToneBadge>
  ) : (
    <ToneBadge tone="danger" className={className}>
      <ShieldOff className="size-3" /> Out of scope
    </ToneBadge>
  );
}

export function AIBadge({ className, label = "Sample analysis · demo" }: { className?: string; label?: string }) {
  return (
    <span className={cn(base, "border-transparent bg-secondary text-secondary-foreground", className)}>
      <Bot className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function UnverifiedBadge() {
  return (
    <ToneBadge tone="warning">
      <ShieldQuestion className="size-3" /> Not verified
    </ToneBadge>
  );
}
