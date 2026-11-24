import { Link } from "react-router";
import { PieChart } from "lucide-react";
import { SectionCard } from "@/components/shared/display";
import { SEVERITIES, SEVERITY_META } from "@/lib/constants";
import type { VulnerabilityFinding } from "@/types";

/** Open findings (not rejected or fixed) by severity, as one stacked bar plus a legend you can click. */
export function SeverityBreakdown({ findings }: { findings: VulnerabilityFinding[] }) {
  const open = findings.filter((f) => f.verificationStatus !== "rejected");
  const counts = SEVERITIES.map((s) => ({ s, n: open.filter((f) => f.severity === s).length }));
  const total = open.length;
  const unchecked = open.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review").length;
  return (
    <SectionCard title="How serious are the findings?" icon={PieChart}>
      {total === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No findings yet. Run a scan to see them here.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={counts.map((c) => `${c.n} ${SEVERITY_META[c.s].label}`).join(", ")}>
            {counts.filter((c) => c.n).map((c) => (
              <span key={c.s} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(c.n / total) * 100}%`, background: SEVERITY_META[c.s].color }} />
            ))}
          </div>
          <ul className="grid grid-cols-5 gap-1">
            {counts.map((c) => (
              <li key={c.s}>
                <Link to={`/findings?severity=${c.s}`} className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 hover:bg-accent/60">
                  <span className="text-lg font-semibold tabular-nums" style={{ color: c.n ? SEVERITY_META[c.s].color : undefined }}>{c.n}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="size-2 rounded-[2px]" style={{ background: SEVERITY_META[c.s].color }} aria-hidden />
                    {SEVERITY_META[c.s].label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {unchecked > 0 && <p className="text-xs text-muted-foreground">{unchecked === total ? "None of these have" : `${unchecked} of these ${unchecked === 1 ? "hasn't" : "haven't"}`} been checked by a person yet, so they may not be real problems.</p>}
        </div>
      )}
    </SectionCard>
  );
}
