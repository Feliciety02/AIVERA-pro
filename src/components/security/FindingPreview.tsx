import { Check, FileSearch, Globe, Layers, ShieldAlert, ShieldCheck, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { StatusBadge, ToolBadge, OriginBadge } from "@/components/security/badges";
import { CATEGORY_BY_ID, SEVERITY_META, VERIFICATION_STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { RemediationTask, VulnerabilityFinding } from "@/types";

/** Where a finding is on its way from "found" to "fixed", for the little tracker. */
function stage(f: VulnerabilityFinding, task?: RemediationTask): number {
  if (f.verificationStatus !== "confirmed") return 1;
  if (!task || task.status === "open" || task.status === "in_progress") return 2;
  if (task.status === "awaiting_retest" || task.status === "pending_approval") return 3;
  return 4;
}
const STEPS = ["Found", "Verify", "Fix", "Retest", "Closed"];

/** Numbered steps with the current one ringed. Shared by the finding and fix quick views. */
export function StepTracker({ steps, at, allDone }: { steps: string[]; at: number; /** Every step finished (e.g. a closed fix). */ allDone?: boolean }) {
  return (
    <ol className="flex items-start" aria-label="Progress">
      {steps.map((label, i) => {
        const done = allDone || i < at;
        const current = !allDone && i === at;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5">
            {i > 0 && <span className={cn("absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2", allDone || i <= at ? "bg-primary" : "bg-border")} aria-hidden />}
            <span
              className={cn(
                "relative z-10 flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary bg-card text-primary ring-4 ring-[color-mix(in_srgb,var(--primary)_15%,transparent)]",
                !done && !current && "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("text-center text-[11px]", current ? "font-semibold text-primary" : "text-muted-foreground")}>{label}</span>
            {current && <span className="sr-only">(current step)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Tracker({ finding, task }: { finding: VulnerabilityFinding; task?: RemediationTask }) {
  if (finding.verificationStatus === "rejected")
    return (
      <div className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3 text-sm">
        <X className="size-4 text-muted-foreground" aria-hidden /> Marked not a problem. Nothing to fix.
      </div>
    );
  return <StepTracker steps={STEPS} at={stage(finding, task)} />;
}

export function Tile({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-xl border border-border bg-card p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <div className="mt-0.5 text-sm leading-snug font-medium break-words">{children}</div>
      </div>
    </div>
  );
}

/** The body of the finding quick view: severity banner, progress, key facts and impact. */
export function FindingPreview({ finding, task, website, evidence }: { finding: VulnerabilityFinding; task?: RemediationTask; website?: string; evidence: number }) {
  const sev = SEVERITY_META[finding.severity];
  const impactUnknown = !finding.impact || /not stated by the tool/i.test(finding.impact);
  return (
    <div className="space-y-5">
      <div
        className="flex items-center gap-4 rounded-2xl p-4"
        style={{ background: `color-mix(in srgb, ${sev.color} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${sev.color} 35%, transparent)` }}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: sev.color }}>
          <ShieldAlert className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-semibold">{sev.label} severity</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusBadge status={finding.verificationStatus} map={VERIFICATION_STATUS} />
            <ToolBadge tool={finding.sourceTool} />
            <OriginBadge origin={finding.dataOrigin} />
          </div>
        </div>
      </div>

      <Tracker finding={finding} task={task} />

      <section>
        <h3 className="mb-1.5 text-sm font-semibold">What was found</h3>
        <p className="text-sm leading-relaxed text-foreground/85">{finding.description}</p>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <Tile icon={Globe} label="Website">{website ?? "Unknown"}</Tile>
        <Tile icon={Layers} label="Category">{CATEGORY_BY_ID[finding.category]?.name}</Tile>
        <Tile icon={ShieldCheck} label="Standards">
          <span className="font-mono text-xs">{[finding.cwe, finding.owasp].filter(Boolean).join(" · ") || "Not mapped"}</span>
        </Tile>
        <Tile icon={FileSearch} label="Evidence">{evidence ? `${evidence} item${evidence === 1 ? "" : "s"} attached` : "None yet"}</Tile>
      </div>

      <section className={cn("flex gap-3 rounded-xl p-4", impactUnknown ? "bg-muted" : "bg-[color-mix(in_srgb,var(--sev-high)_10%,transparent)]")}>
        <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", impactUnknown ? "text-muted-foreground" : "text-sev-high")} aria-hidden />
        <div>
          <h3 className="text-sm font-semibold">Why it matters</h3>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">{impactUnknown ? "The tool didn't say. Judge the impact when you verify it." : finding.impact}</p>
        </div>
      </section>

      {finding.dataOrigin === "simulated" && (
        <p className="rounded-xl border border-dashed border-sev-medium px-4 py-2.5 text-xs text-foreground/80">Practice result from the demo. Not real evidence.</p>
      )}
    </div>
  );
}
