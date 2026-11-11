import * as React from "react";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/sessionStore";
import { cn } from "@/lib/utils";

export interface GuideStep {
  /** CSS selector, looked up inside this popup only. Optional for intro steps. */
  target?: string;
  title: string;
  body: string;
}

/**
 * Step-by-step guide shown inside a popup (dialog or side panel) the first time it opens.
 * It lives inside the popup, so it works with the popup's focus trap, and highlights each
 * field with an outline instead of dimming the page. "Show guide" replays it later.
 */
export function DialogGuide({ guideKey, steps, inSheet }: { guideKey: string; steps: GuideStep[]; inSheet?: boolean }) {
  const key = `guide:${guideKey}`;
  const enabled = useUIStore((s) => s.tutorialsEnabled);
  const seen = useUIStore((s) => s.seenTours.includes(key));
  const finishTour = useUIStore((s) => s.finishTour);
  const setTutorialsEnabled = useUIStore((s) => s.setTutorialsEnabled);
  const [active, setActive] = React.useState(() => enabled && !seen);
  const [index, setIndex] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const step = steps[index];

  // Outline the field this step talks about and bring it into view.
  React.useEffect(() => {
    if (!active || !step?.target) return;
    const root = ref.current?.closest("[role=dialog]") ?? document;
    const el = root.querySelector<HTMLElement>(step.target);
    if (!el) return;
    el.setAttribute("data-guide-active", "");
    const t = setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    return () => {
      clearTimeout(t);
      el.removeAttribute("data-guide-active");
    };
  }, [active, step]);

  const close = () => {
    setActive(false);
    setIndex(0);
    finishTour(key);
  };

  if (!active)
    return (
      <div className="-mb-2 flex justify-end">
        <button type="button" onClick={() => setActive(true)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <CircleHelp className="size-3.5" /> Show guide
        </button>
      </div>
    );

  if (!step) return null;
  const last = index === steps.length - 1;
  return (
    <div ref={ref} role="region" aria-label="Guide" aria-live="polite" className={cn("sticky z-20 rounded-lg border border-primary/30 bg-popover p-4 shadow-md", inSheet ? "-top-4" : "-top-6 -mx-2")}>
      <div className="pointer-events-none absolute inset-0 rounded-lg bg-primary/[0.06]" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Quick guide · Step {index + 1} of {steps.length}
          </p>
          <button type="button" onClick={close} aria-label="Close guide" className="-mt-1 -mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
        <p className="mt-1 text-sm font-medium">{step.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/80">{step.body}</p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => {
              setTutorialsEnabled(false);
              close();
            }}
          >
            Don't show tutorials again
          </button>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
