import { SEVERITIES, SEVERITY_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types";

/** A small stacked bar of findings by severity, with the total. For table cells and cards. */
export function SeverityStrip({ severities, className, width = "w-24" }: { severities: Severity[]; className?: string; width?: string }) {
  const total = severities.length;
  if (!total) return <span className={cn("text-xs text-muted-foreground", className)}>None</span>;
  const counts = SEVERITIES.map((s) => ({ s, n: severities.filter((x) => x === s).length })).filter((c) => c.n);
  const label = counts.map((c) => `${c.n} ${SEVERITY_META[c.s].label.toLowerCase()}`).join(", ");
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={label}>
      <span className="w-5 text-right text-sm font-semibold tabular-nums">{total}</span>
      <span className={cn("flex h-2 overflow-hidden rounded-full bg-muted", width)} role="img" aria-label={label}>
        {counts.map((c) => (
          <span key={c.s} style={{ width: `${(c.n / total) * 100}%`, background: SEVERITY_META[c.s].color }} />
        ))}
      </span>
    </span>
  );
}
