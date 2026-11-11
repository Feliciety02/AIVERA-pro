import { cn } from "@/lib/utils";
import { IMPACT_LABELS, LIKELIHOOD_LABELS, riskLevelFromScore, RISK_LEVEL_META } from "@/lib/risk";
import type { LikertScore, Risk } from "@/types";

const SCALE: LikertScore[] = [1, 2, 3, 4, 5];

/**
 * 5×5 likelihood × impact matrix (demo qualitative model, not CVSS).
 * Rows: likelihood 5 → 1 (top to bottom). Columns: impact 1 → 5.
 */
export function RiskMatrix({ risks, selected, onSelect }: { risks: Risk[]; selected?: { l: number; i: number } | null; onSelect?: (cell: { l: number; i: number } | null) => void }) {
  const count = (l: number, i: number) => risks.filter((r) => r.likelihood === l && r.impact === i).length;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[440px] grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1" role="grid" aria-label="Risk matrix: likelihood by impact">
        <div />
        {SCALE.map((i) => (
          <div key={`h${i}`} className="pb-1 text-center text-[10px] leading-tight text-muted-foreground" role="columnheader">
            <span className="block font-semibold text-foreground/80">I{i}</span>
            {IMPACT_LABELS[i]}
          </div>
        ))}
        {[...SCALE].reverse().map((l) => (
          <div key={`r${l}`} className="contents" role="row">
            <div className="flex items-center justify-end pr-2 text-right text-[10px] leading-tight text-muted-foreground" role="rowheader">
              <span>
                <span className="block font-semibold text-foreground/80">L{l}</span>
                {LIKELIHOOD_LABELS[l]}
              </span>
            </div>
            {SCALE.map((i) => {
              const n = count(l, i);
              const score = l * i;
              const lvl = riskLevelFromScore(score);
              const isSel = selected?.l === l && selected?.i === i;
              return (
                <button
                  key={`${l}-${i}`}
                  type="button"
                  role="gridcell"
                  aria-label={`Likelihood ${l}, impact ${i}: score ${score}, ${RISK_LEVEL_META[lvl].label}, ${n} risk(s)`}
                  aria-pressed={isSel}
                  onClick={() => onSelect?.(isSel ? null : { l, i })}
                  className={cn(
                    "relative flex aspect-[1.6] flex-col items-center justify-center rounded-md border transition-all hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    RISK_LEVEL_META[lvl].cell,
                    n === 0 && "opacity-55",
                    isSel && "ring-2 ring-foreground",
                  )}
                >
                  <span className="text-lg font-semibold tabular-nums">{n || ""}</span>
                  <span className="absolute right-1 bottom-0.5 text-[9px] text-muted-foreground tabular-nums">{score}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-muted-foreground">
        {(["low", "medium", "high", "critical"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm border", RISK_LEVEL_META[k].cell)} /> {RISK_LEVEL_META[k].label}
          </span>
        ))}
        <span className="ml-auto">Score = L × I · Low 1–5 · Medium 6–11 · High 12–19 · Critical 20–25</span>
      </div>
    </div>
  );
}
