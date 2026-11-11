import { Link } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ArrowRight, Check, FileText, Globe, ScanLine, ShieldAlert, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/stores/dataStore";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  label: string;
  icon: LucideIcon;
  done: boolean;
  /** What the user should do now, in plain words, and where the button goes. */
  title: string;
  body: string;
  action: { label: string; to: string };
}

/**
 * "What to do next": shows where the assessment stands and one button for the next step.
 * Only real results count; simulated practice data is ignored.
 */
export function NextStepCard() {
  const { targets, scans, findings, remediation, reports } = useDataStore(
    useShallow((s) => ({ targets: s.targets, scans: s.scans, findings: s.findings, remediation: s.remediation, reports: s.reports })),
  );

  const ready = targets.find((t) => t.authorizationStatus === "authorized" && t.authorizationConfirmed && t.projectId);
  const anyTarget = targets[0];
  const realScans = scans.filter((s) => s.dataOrigin !== "simulated" && s.status === "completed");
  const realFindings = findings.filter((f) => f.dataOrigin !== "simulated");
  const toReview = realFindings.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review");
  const confirmed = realFindings.filter((f) => f.verificationStatus === "confirmed");
  const withoutFix = confirmed.filter((f) => !remediation.some((t) => t.findingId === f.id));
  const reviewDone = realFindings.length > 0 && toReview.length === 0;

  const steps: Step[] = [
    {
      key: "website",
      label: "Add website",
      icon: Globe,
      done: !!ready,
      title: anyTarget ? "Finish setting up your website" : "Add the website you'll test",
      body: anyTarget
        ? `${anyTarget.name} needs confirmed permission and a project before it can be scanned.`
        : "Paste its address and confirm you have the owner's permission. AIVERA works out what may be tested.",
      action: anyTarget ? { label: "Open the website", to: `/targets/${anyTarget.id}` } : { label: "Add a website", to: "/targets/new" },
    },
    {
      key: "scan",
      label: "Scan",
      icon: ScanLine,
      done: realScans.length > 0,
      title: `Scan ${ready?.name ?? "the website"}`,
      body: "One click runs the security tools inside the approved scope. It takes about two minutes, and AI explains the results.",
      action: { label: "Scan the website", to: ready ? `/targets/${ready.id}` : "/targets" },
    },
    {
      key: "review",
      label: "Review findings",
      icon: ShieldAlert,
      done: reviewDone,
      title: toReview.length ? `Review ${toReview.length} finding${toReview.length === 1 ? "" : "s"}` : "Wait for findings",
      body: toReview.length
        ? "For each one, look at the evidence and decide: is it a real problem, or a false alarm? Only your decision counts."
        : "The scans haven't produced any findings yet. Run another scan, or record something you found by hand.",
      action: toReview.length ? { label: "Start reviewing", to: "/findings?status=unverified" } : { label: "Open findings", to: "/findings" },
    },
    {
      key: "fix",
      label: "Plan fixes",
      icon: Wrench,
      done: reviewDone && withoutFix.length === 0,
      title: `Plan fixes for ${withoutFix.length} confirmed problem${withoutFix.length === 1 ? "" : "s"}`,
      body: "Open each confirmed finding and create a fix task: who fixes it, by when, and how it will be retested.",
      action: { label: "See confirmed findings", to: "/findings?status=confirmed" },
    },
    {
      key: "report",
      label: "Report",
      icon: FileText,
      done: reports.length > 0,
      title: "Create the report",
      body: "Turn the confirmed findings, evidence and fixes into a PDF you can hand in or share with the owner.",
      action: { label: "Create the report", to: "/reports/new" },
    },
  ];

  const current = steps.findIndex((s) => !s.done);
  const step = current === -1 ? null : steps[current]!;

  return (
    <section data-tour="next-step" aria-label="What to do next" className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.07] to-transparent p-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" aria-label="Assessment progress">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-[11px] font-medium",
                s.done ? "border-success bg-success text-white dark:text-slate-950" : i === current ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
              )}
              aria-hidden
            >
              {s.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(i === current ? "font-medium text-foreground" : "text-muted-foreground", s.done && "text-foreground/70")}>
              {s.label}
              <span className="sr-only">{s.done ? " (done)" : i === current ? " (current step)" : " (not yet)"}</span>
            </span>
            {i < steps.length - 1 && <span className="mx-1 hidden h-px w-6 bg-border sm:block" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            {step ? <step.icon className="size-5" aria-hidden /> : <Check className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary">{step ? `Next step · ${current + 1} of ${steps.length}` : "All steps done"}</p>
            <h2 className="mt-0.5 text-lg font-normal">{step ? step.title : "Your assessment is complete"}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {step ? step.body : "Every finding has a decision, every confirmed problem has a fix plan, and a report exists. Retest fixes as they're deployed."}
            </p>
          </div>
        </div>
        <Button asChild className="rounded-full">
          <Link to={step ? step.action.to : "/reports"}>
            {step ? step.action.label : "View reports"} <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
