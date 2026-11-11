import * as React from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/sessionStore";
import { resolveTarget, tourForPath, WELCOME_TOUR, type TourStep } from "@/features/tours";

const PAD = 6;
const CARD_W = 368;
const GAP = 14;
const EDGE = 16;

/** Starts first-run tutorials automatically and renders the active one. */
export function TourHost() {
  const { pathname } = useLocation();
  const { tutorialsEnabled, seenTours, activeTour, startTour } = useUIStore();

  // Navigating away mid-tour ends it without marking it as seen.
  React.useEffect(() => {
    if (activeTour && activeTour !== "welcome" && tourForPath(pathname)?.key !== activeTour) useUIStore.setState({ activeTour: null });
  }, [pathname, activeTour]);

  // Auto-start: the welcome tour once, then each page's tour the first time it's visited.
  React.useEffect(() => {
    if (!tutorialsEnabled || activeTour) return;
    const key = !seenTours.includes("welcome") ? "welcome" : tourForPath(pathname)?.key;
    if (!key || seenTours.includes(key)) return;
    const t = setTimeout(() => startTour(key), 900); // let the page finish loading
    return () => clearTimeout(t);
  }, [pathname, tutorialsEnabled, activeTour, seenTours, startTour]);

  if (!activeTour) return null;
  const steps = activeTour === "welcome" ? WELCOME_TOUR : tourForPath(pathname)?.key === activeTour ? tourForPath(pathname)!.steps : null;
  if (!steps) return null;
  return <TourOverlay key={`${activeTour}|${pathname}`} tourKey={activeTour} steps={steps} />;
}

function TourOverlay({ tourKey, steps: allSteps }: { tourKey: string; steps: TourStep[] }) {
  const finishTour = useUIStore((s) => s.finishTour);
  const setTutorialsEnabled = useUIStore((s) => s.setTutorialsEnabled);
  // Keep only steps whose target is actually on screen (role-hidden buttons, mobile layouts…).
  const [steps] = React.useState(() => allSteps.filter((s) => !s.target || s.keepIfHidden || resolveTarget(s.target)));
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = React.useState(240);
  const step = steps[index];

  // Measure the card so long explanations are placed without covering the target.
  React.useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    setCardH(el.offsetHeight);
    return () => ro.disconnect();
  }, [step]);

  const close = React.useCallback(() => finishTour(tourKey), [finishTour, tourKey]);
  const next = React.useCallback(() => (index < steps.length - 1 ? setIndex(index + 1) : close()), [index, steps.length, close]);
  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  React.useEffect(() => {
    if (!steps.length) close();
  }, [steps.length, close]);

  // Bring the target into view, then track its position while the step is shown.
  React.useEffect(() => {
    if (!step) return;
    const el = resolveTarget(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    measure();
    const settle = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(settle);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  React.useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, next, back]);

  if (!step) return null;

  // Card placement: below, above, right or left of the target — whichever fits — and
  // centred when there is no target. If nothing fits (very large targets) it docks bottom-right.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - EDGE * 2);
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - width - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), Math.max(EDGE, vh - cardH - EDGE));
  let style: React.CSSProperties = { width, left: (vw - width) / 2, top: clampY(vh / 2 - cardH / 2) };
  if (rect) {
    const t = { top: rect.top - PAD, bottom: rect.bottom + PAD, left: rect.left - PAD, right: rect.right + PAD };
    const centerX = clampX(rect.left + rect.width / 2 - width / 2);
    const centerY = clampY(rect.top + rect.height / 2 - cardH / 2);
    if (vh - t.bottom - GAP >= cardH + EDGE) style = { width, left: centerX, top: t.bottom + GAP };
    else if (t.top - GAP >= cardH + EDGE) style = { width, left: centerX, top: t.top - GAP - cardH };
    else if (vw - t.right - GAP >= width + EDGE) style = { width, left: t.right + GAP, top: centerY };
    else if (t.left - GAP >= width + EDGE) style = { width, left: t.left - GAP - width, top: centerY };
    else style = { width, left: vw - width - EDGE, top: vh - cardH - EDGE };
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Click-blocker so the page isn't changed mid-tutorial. */}
      <div className={rect ? "absolute inset-0" : "absolute inset-0 bg-black/55"} onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-200"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
        />
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute max-h-[calc(100dvh-32px)] overflow-y-auto rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl outline-none animate-in fade-in-0 zoom-in-95"
        style={style}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Step {index + 1} of {steps.length}
          </p>
          <button type="button" onClick={close} aria-label="Close tutorial" className="-mt-1 -mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-1 text-base font-medium">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{step.body}</p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={close} className="px-2 text-muted-foreground">
            Skip
          </Button>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {index < steps.length - 1 ? "Next" : "Got it"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setTutorialsEnabled(false);
            close();
          }}
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Don't show tutorials again
        </button>
      </div>
    </div>,
    document.body,
  );
}
