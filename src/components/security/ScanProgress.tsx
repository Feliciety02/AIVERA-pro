import { FlaskConical, Loader2, CircleCheck, CircleX, Ban, Clock } from "lucide-react";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { SIMULATION_STAGES } from "@/features/simulation/generator";
import type { Scan } from "@/types";

export function ScanProgress({ scan, compact }: { scan: Scan; compact?: boolean }) {
  const Icon = scan.status === "running" ? Loader2 : scan.status === "completed" ? CircleCheck : scan.status === "failed" ? CircleX : scan.status === "cancelled" ? Ban : Clock;
  const color = scan.status === "failed" ? "bg-sev-critical" : scan.status === "cancelled" ? "bg-muted-foreground" : scan.status === "completed" ? "bg-primary" : "bg-cyan";
  if (compact)
    return (
      <div className="flex min-w-32 items-center gap-2">
        <Progress value={scan.progress} className="h-1.5 flex-1" indicatorClassName={color} />
        <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{scan.progress}%</span>
      </div>
    );
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon className={cn("size-4", scan.status === "running" && "animate-spin text-cyan", scan.status === "completed" && "text-primary", scan.status === "failed" && "text-sev-critical")} />
          {scan.stage ?? scan.status}
        </p>
        <span className="font-mono text-sm tabular-nums">{scan.progress}%</span>
      </div>
      <Progress value={scan.progress} className="h-2" indicatorClassName={color} aria-label="Scan progress" />
      {scan.dataOrigin === "simulated" && (
        <ol className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
          {SIMULATION_STAGES.map((s, i) => {
            const next = SIMULATION_STAGES[i + 1]?.at ?? 101;
            const done = scan.progress >= next || scan.status === "completed";
            const current = !done && scan.progress >= s.at && scan.status === "running";
            return (
              <li key={s.label} className={cn("rounded-md border px-2 py-1.5 text-[10.5px] leading-snug", done ? "border-primary/30 text-foreground" : current ? "border-cyan/40 bg-cyan/5 text-cyan" : "border-border text-muted-foreground")}>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
      {scan.dataOrigin === "simulated" && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-sev-medium">
          <FlaskConical className="size-3.5" /> SIMULATED run — progress and results are generated in your browser. No traffic is sent to the target.
        </p>
      )}
    </div>
  );
}
