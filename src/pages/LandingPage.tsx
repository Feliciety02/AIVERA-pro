import * as React from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Bot,
  CircleCheck,
  ClipboardCheck,
  FileLock2,
  FileText,
  Fingerprint,
  KeyRound,
  Lock,
  Radar as RadarIcon,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Target,
  UserCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/sessionStore";
import { useShallow } from "zustand/react/shallow";
import { useDataStore } from "@/stores/dataStore";
import { useDocumentTitle } from "@/hooks";
import { IS_API } from "@/services";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Public landing page. Uses the app's theme tokens plus the logo's cyan to
 * blue palette, so it works in light and dark mode. Every claim is something
 * AIVERA really does. Copy avoids hyphens and dashes on purpose.
 * ------------------------------------------------------------------------- */

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Four small corner brackets, like a targeting frame, around any card. */
function Brackets({ className }: { className?: string }) {
  const base = "absolute size-3 border-landing-accent";
  return (
    <span className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      <span className={cn(base, "top-0 left-0 rounded-tl-md border-t-2 border-l-2")} />
      <span className={cn(base, "top-0 right-0 rounded-tr-md border-t-2 border-r-2")} />
      <span className={cn(base, "bottom-0 left-0 rounded-bl-md border-b-2 border-l-2")} />
      <span className={cn(base, "right-0 bottom-0 rounded-br-md border-r-2 border-b-2")} />
    </span>
  );
}

/* --------------------------------- Radar ---------------------------------- */

const SWEEP_SECONDS = 5;
// UMERCH3.0 pages placed around the scope. Angle is clockwise from 12 o'clock.
const BLIPS: { label: string; angle: number; r: number; tone: "ok" | "warn" }[] = [
  { label: "/login", angle: 38, r: 0.55, tone: "ok" },
  { label: "/Products", angle: 108, r: 0.78, tone: "ok" },
  { label: "/api/inventory", angle: 165, r: 0.45, tone: "warn" },
  { label: "/AboutUs", angle: 232, r: 0.72, tone: "ok" },
  { label: "/", angle: 305, r: 0.5, tone: "ok" },
];
const BLIP_TONE = { ok: "bg-landing-accent", warn: "bg-warning" } as const;

/** Full radar: rings, crosshair, degree ticks, a rotating sweep and blips that light up as it passes. */
function Radar() {
  const reduced = useReducedMotion();
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]" role="img" aria-label="Animated radar showing UMERCH3.0 pages inside the approved scope">
      <div className="landing-radar-face absolute inset-0 rounded-full border border-landing-accent/30" />
      <svg viewBox="0 0 400 400" className="absolute inset-0 size-full text-landing-accent" aria-hidden>
        {[45, 90, 135, 180].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="currentColor" strokeOpacity={r === 180 ? 0.4 : 0.2} strokeDasharray={r === 180 ? undefined : "3 5"} />
        ))}
        <line x1="20" y1="200" x2="380" y2="200" stroke="currentColor" strokeOpacity="0.2" />
        <line x1="200" y1="20" x2="200" y2="380" stroke="currentColor" strokeOpacity="0.2" />
        <line x1="73" y1="73" x2="327" y2="327" stroke="currentColor" strokeOpacity="0.08" />
        <line x1="327" y1="73" x2="73" y2="327" stroke="currentColor" strokeOpacity="0.08" />
        {ticks.map((deg) => {
          const long = deg % 30 === 0;
          const a = ((deg - 90) * Math.PI) / 180;
          const r2 = long ? 170 : 175;
          return <line key={deg} x1={200 + 180 * Math.cos(a)} y1={200 + 180 * Math.sin(a)} x2={200 + r2 * Math.cos(a)} y2={200 + r2 * Math.sin(a)} stroke="currentColor" strokeOpacity={long ? 0.55 : 0.25} />;
        })}
        {[0, 90, 180, 270].map((deg) => {
          const a = ((deg - 90) * Math.PI) / 180;
          return (
            <text key={deg} x={200 + 158 * Math.cos(a)} y={200 + 158 * Math.sin(a) + 3} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize="9">
              {String(deg).padStart(3, "0")}
            </text>
          );
        })}
      </svg>

      <div className={cn("absolute inset-[5%] rounded-full", !reduced && "landing-radar-sweep")} style={{ animationDuration: `${SWEEP_SECONDS}s` }} aria-hidden>
        <div className="landing-radar-wedge absolute inset-0 rounded-full" />
        <div className="absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-landing-accent to-transparent" />
      </div>

      {BLIPS.map((b) => {
        const a = ((b.angle - 90) * Math.PI) / 180;
        const x = 50 + 45 * b.r * Math.cos(a);
        const y = 50 + 45 * b.r * Math.sin(a);
        const delay = `${(b.angle / 360) * SWEEP_SECONDS - SWEEP_SECONDS}s`;
        const anim = { animationDuration: `${SWEEP_SECONDS}s`, animationDelay: delay };
        return (
          <div key={b.label} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className={cn("absolute -top-1 -left-1 size-2 rounded-full", BLIP_TONE[b.tone], !reduced && "landing-blip")} style={anim} />
            {!reduced && <span className={cn("absolute -top-1 -left-1 size-2 rounded-full", BLIP_TONE[b.tone], "landing-blip-ring")} style={anim} />}
            <span className={cn("absolute top-1.5 left-2 rounded border border-border bg-card/90 px-1.5 py-px font-mono text-[10px] whitespace-nowrap text-foreground/80 backdrop-blur", !reduced && "landing-blip-label")} style={anim}>
              {b.label}
            </span>
          </div>
        );
      })}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className={cn("block size-3 rounded-full bg-landing-accent", !reduced && "landing-pulse")} />
      </div>
      <span className="absolute bottom-[13%] left-1/2 -translate-x-1/2 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">127.0.0.1:8000</span>
    </div>
  );
}

/** Small cards that float beside the radar. Values are real for the local UMERCH3.0 target. */
function FloatingCard({ icon: Icon, title, value, className, delay = "0s" }: { icon: LucideIcon; title: string; value: string; className?: string; delay?: string }) {
  return (
    <div className={cn("landing-float absolute z-10 hidden items-center gap-3 rounded-xl border border-border bg-card/95 px-3.5 py-2.5 shadow-lg shadow-black/5 backdrop-blur sm:flex", className)} style={{ animationDelay: delay }}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-landing-accent/12 text-landing-accent">
        <Icon className="size-4" aria-hidden />
      </span>
      <span>
        <span className="block text-[11px] text-muted-foreground">{title}</span>
        <span className="block font-mono text-xs font-medium">{value}</span>
      </span>
    </div>
  );
}

/* -------------------------------- Terminal -------------------------------- */

type Line = { t: "cmd" | "ok" | "info" | "warn" | "ai" | "hold"; text: string };

// An illustrative run against the local UMERCH3.0 copy, mirroring AIVERA's real workflow.
const SESSION: Line[] = [
  { t: "cmd", text: "aivera target register http://127.0.0.1:8000" },
  { t: "ok", text: "permission confirmed · record saved" },
  { t: "cmd", text: "aivera scope detect" },
  { t: "info", text: "GET /robots.txt → 200 · 0 blocked paths" },
  { t: "info", text: "GET /sitemap.xml → 404 · none published" },
  { t: "ok", text: "scope locked: 127.0.0.1:8000 /*" },
  { t: "cmd", text: "aivera scan baseline zap" },
  { t: "info", text: "spider stays inside scope · exclusions enforced" },
  { t: "warn", text: "3 potential findings · status: PENDING" },
  { t: "cmd", text: "aivera ai explain redact" },
  { t: "info", text: "secrets removed before sending: 2" },
  { t: "ai", text: "suggestions ready, not a verdict" },
  { t: "hold", text: "awaiting human verification ▸ assessor" },
];
const LINE_STYLE: Record<Line["t"], string> = {
  cmd: "text-slate-100",
  ok: "text-emerald-400",
  info: "text-slate-400",
  warn: "text-amber-300",
  ai: "text-cyan-300",
  hold: "text-sky-300",
};
const LINE_PREFIX: Record<Line["t"], string> = { cmd: "$", ok: "✓", info: "·", warn: "!", ai: "◆", hold: "⏸" };

/** Terminal that types the example session line by line, then loops. Dark in both themes. */
function TerminalDemo() {
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(reduced ? SESSION.length : 0);
  React.useEffect(() => {
    if (reduced) return setShown(SESSION.length);
    const delay = shown >= SESSION.length ? 4200 : SESSION[shown]?.t === "cmd" ? 900 : 420;
    const t = setTimeout(() => setShown((n) => (n >= SESSION.length ? 0 : n + 1)), delay);
    return () => clearTimeout(t);
  }, [shown, reduced]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#0a1020] shadow-2xl shadow-landing-accent/15">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-rose-400/80" />
        <span className="size-2.5 rounded-full bg-amber-300/80" />
        <span className="size-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-3 font-mono text-[11px] text-slate-400">aivera · umerch3.0 (local)</span>
        <span className="ml-auto rounded border border-white/10 px-1.5 py-px font-mono text-[10px] tracking-wider text-slate-500 uppercase">example</span>
      </div>
      <div className="relative h-[330px] overflow-hidden px-4 py-3 font-mono text-[12.5px] leading-6 sm:text-[13px]" aria-label="Example AIVERA session" role="img">
        {SESSION.slice(0, shown).map((l, i) => (
          <div key={i} className={cn("flex gap-2 whitespace-pre-wrap", LINE_STYLE[l.t], !reduced && "landing-line-in")}>
            <span className="w-3 shrink-0 text-slate-600 select-none">{LINE_PREFIX[l.t]}</span>
            <span className="min-w-0 break-words">{l.text}</span>
          </div>
        ))}
        {!reduced && <span className="landing-cursor ml-5 inline-block h-4 w-2 translate-y-0.5 bg-cyan-400" aria-hidden />}
        {!reduced && <div className="landing-scanline pointer-events-none absolute inset-0" aria-hidden />}
      </div>
    </div>
  );
}

/* ---------------------------- Workspace preview --------------------------- */

/** A browser window showing the real AIVERA workspace numbers for UMERCH3.0. */
function WorkspacePreview() {
  const counts = useDataStore(
    useShallow((s) => ({ targets: s.targets.length, scans: s.scans.length, findings: s.findings.length, confirmed: s.findings.filter((f) => f.verificationStatus === "confirmed").length })),
  );
  const signedIn = !!useSessionStore((s) => s.userId);
  // Signed out in full stack mode, the browser has no live data yet, so don't show stale numbers.
  const firstTarget = useDataStore((s) => s.targets[0]);
  const target = IS_API && !signedIn ? undefined : firstTarget;
  const tiles: [string, number][] = [
    ["Targets", counts.targets],
    ["Scans", counts.scans],
    ["Findings", counts.findings],
    ["Confirmed", counts.confirmed],
  ];
  return (
    <div className="relative rounded-2xl border border-border bg-card shadow-2xl shadow-landing-accent/10">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="mx-auto flex items-center gap-2 rounded-full bg-muted px-4 py-1 font-mono text-[11px] text-muted-foreground">
          <Lock className="size-3" aria-hidden /> aivera / dashboard
        </div>
      </div>
      <div className={cn("grid gap-4 p-5", !target && "pointer-events-none blur-[3px] select-none")} aria-hidden={!target}>
        <div className="flex items-center gap-3">
          <BrandMark className="size-8" />
          <div>
            <p className="text-sm font-medium">UMERCH3.0 Security Assessment</p>
            <p className="text-xs text-muted-foreground">Your workspace right now</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([label, n]) => (
            <div key={label} className="rounded-xl border border-border px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-xl tabular-nums">{n}</p>
            </div>
          ))}
        </div>
        {target && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
            <Target className="size-4 text-landing-accent" aria-hidden />
            <span className="font-medium">{target.name}</span>
            <span className="font-mono text-muted-foreground">{target.url}</span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-success">
              <CircleCheck className="size-3" aria-hidden /> Authorized
            </span>
          </div>
        )}
      </div>
      {!target && (
        <div className="absolute inset-0 top-12 flex items-center justify-center">
          <Link to="/login" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-lg hover:border-landing-accent/50">
            <Lock className="size-4 text-landing-accent" aria-hidden /> Sign in to see live numbers
          </Link>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Content -------------------------------- */

const WORKFLOW: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: FileLock2, title: "Scope", body: "Register UMERCH3.0, confirm permission, and lock exactly which hosts and paths may be touched." },
  { icon: RadarIcon, title: "Recon", body: "Read robots.txt and sitemap.xml, resolve DNS, and map hosts, ports and pages." },
  { icon: ScanSearch, title: "Scan or import", body: "Run bounded Nmap or OWASP ZAP jobs, or import their reports. Anything outside the scope is dropped." },
  { icon: Bot, title: "AI analysis", body: "Gemini explains findings, ranks urgency and drafts fixes, after secrets are removed." },
  { icon: UserCheck, title: "Human verification", body: "An assessor reviews the evidence and confirms or rejects every finding." },
  { icon: Wrench, title: "Fix and report", body: "Track fixes until a retest passes, then export a PDF report built from verified findings." },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Target, title: "Scope that can't be bypassed", body: "Every scan, import and finding is checked again on the server against the approved hosts, paths and exclusions." },
  { icon: Fingerprint, title: "Evidence first", body: "Requests, responses and tool output stay attached to each finding, each marked reviewed or not." },
  { icon: Bot, title: "AI that shows its work", body: "See exactly what was sent to the model and how many secrets were removed first." },
  { icon: Siren, title: "Risk you can rank", body: "Likelihood times impact on a five by five matrix, so the most dangerous issues are fixed first." },
  { icon: ClipboardCheck, title: "Checklists per category", body: "Login, access control, injection, sessions, exposed files and HTTPS, with automated and manual checks together." },
  { icon: FileText, title: "Reports from verified data", body: "Technical, executive or remediation templates. Unverified items only appear in a labelled appendix." },
];

const GUARDS = [
  "Only targets with confirmed written permission can be scanned",
  "Live scanning stays off until the server admin allowlists the exact host",
  "Passwords, tokens, cookies and keys are removed before AI sees anything",
  "Three roles: administrator, security assessor and viewer",
  "Every action is written to an activity log that can't be edited",
  "API keys stay on the server, never in the browser",
];

function SectionHeading({ title, body, align = "center" }: { title: string; body?: string; align?: "center" | "left" }) {
  return (
    <div className={cn("sr-rise max-w-2xl", align === "center" && "mx-auto text-center")}>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  );
}

export default function LandingPage() {
  useDocumentTitle("Security testing for UMERCH3.0");
  const signedIn = !!useSessionStore((s) => s.userId);
  const reduced = useReducedMotion();

  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <div className="landing-grid pointer-events-none fixed inset-0" aria-hidden />
      <div className="pointer-events-none fixed -top-48 left-1/2 h-[480px] w-[880px] -translate-x-1/2 rounded-full bg-landing-accent/10 blur-[120px]" aria-hidden />

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6" aria-label="Landing">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark className="size-8" />
            <span className="text-lg font-medium tracking-wide">AIVERA</span>
          </Link>
          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#workflow" className="landing-navlink hover:text-foreground">How it works</a>
            <a href="#features" className="landing-navlink hover:text-foreground">Features</a>
            <a href="#safety" className="landing-navlink hover:text-foreground">Safety</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <Button asChild className="rounded-full">
                <Link to="/dashboard">
                  Open dashboard <ArrowRight />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="rounded-full text-primary hover:text-primary">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link to="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </nav>
        <div className="sr-progress absolute inset-x-0 -bottom-px h-0.5 bg-landing-accent" aria-hidden />
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="sr-exit">
            <h1 className="text-4xl leading-[1.12] font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Find the weak spots in <span className="landing-gradient-text">UMERCH3.0</span>{" "}
              <span className="relative inline-block whitespace-nowrap">
                before anyone
                <svg className="absolute -bottom-2 left-0 h-3 w-full text-landing-accent" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden>
                  <path d="M3 9 C 60 3, 120 3, 170 6 S 260 10, 297 4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" className={cn(!reduced && "landing-draw")} />
                </svg>
              </span>{" "}
              else does.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
              AIVERA runs a controlled web security assessment of the UM Merchandise Management System, from a locked down scope, to results explained by AI, to fixes confirmed by a person.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="landing-shine rounded-full">
                <Link to={signedIn ? "/dashboard" : "/signup"}>
                  {signedIn ? "Open dashboard" : "Start an assessment"} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href="#workflow">See how it works</a>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 border-t border-border pt-6">
              {[
                ["6", "test areas"],
                ["0", "findings confirmed automatically"],
                ["100%", "of actions logged"],
              ].map(([v, l], i) => (
                <div key={l} className={cn("pr-4", i > 0 && "border-l border-border pl-4")}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-mono text-2xl">{v}</dd>
                  <dd className="mt-1 text-xs leading-snug text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="sr-parallax relative">
            <FloatingCard icon={ShieldCheck} title="Permission" value="Confirmed" className="top-6 -left-2 lg:-left-10" />
            <FloatingCard icon={KeyRound} title="Scope locked" value="127.0.0.1:8000 /*" className="right-0 bottom-16 lg:-right-6" delay="1.5s" />
            <Radar />
            <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full bg-success", !reduced && "landing-pulse-success")} /> Scanning only inside the approved scope
            </p>
          </div>
        </section>

        {/* Example run */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div className="sr-tilt">
            <TerminalDemo />
          </div>
          <div>
            <SectionHeading align="left" title="Every run follows the same rules" body="Permission first, scope locked, results held as pending until a person decides. This is what a run against the local UMERCH3.0 copy looks like." />
            <ul className="mt-6 space-y-3 text-sm">
              {["Scope comes from the site's own robots.txt and sitemap.xml", "Scanners never leave the approved host and paths", "AI suggestions are advice, never a verdict"].map((t, i) => (
                <li key={t} className="sr-slide flex items-start gap-3" style={{ "--sr-i": i } as React.CSSProperties}>
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Workflow timeline */}
        <section id="workflow" className="scroll-mt-20 border-t border-border bg-muted/30 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading title="From permission to patched in six steps" body="Each step hands off to the next, and nothing moves forward without the checks before it." />
            <div className="relative mt-12 h-px bg-border" aria-hidden>
              <div className="sr-line absolute inset-0 bg-gradient-to-r from-landing-accent to-landing-deep" />
            </div>
            <ol className="relative mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {WORKFLOW.map((s, i) => (
                <li key={s.title} style={{ "--sr-i": i % 3 } as React.CSSProperties} className="sr-rise group relative rounded-xl border border-border bg-card p-6 pt-8 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-landing-accent/50 hover:shadow-xl hover:shadow-landing-accent/10">
                  <Brackets className="opacity-0 transition-opacity group-hover:opacity-100" />
                  <span className="absolute -top-4 left-6 flex size-8 items-center justify-center rounded-full border-2 border-background bg-landing-accent font-mono text-xs font-semibold text-white shadow-md dark:text-slate-950">
                    {i + 1}
                  </span>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-landing-accent/10 text-landing-accent transition-colors group-hover:bg-landing-accent group-hover:text-white dark:group-hover:text-slate-950">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Workspace preview */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <SectionHeading align="left" title="One place for the whole assessment" body="Targets, scans, findings, risks, fixes and reports for UMERCH3.0, all linked together. These are the real numbers in this workspace right now." />
            <Button asChild variant="outline" className="mt-6 rounded-full">
              <Link to={signedIn ? "/dashboard" : "/login"}>
                {signedIn ? "Go to the dashboard" : "Sign in to see it"} <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="sr-clip relative">
            <div className="absolute -inset-4 -z-10 rotate-2 rounded-3xl bg-gradient-to-br from-landing-accent/20 to-landing-deep/10" aria-hidden />
            <WorkspacePreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-border py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading title="Built for a careful assessor" body="The parts of AIVERA that turn raw tool output into decisions you can defend." />
            <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <div key={f.title} style={{ "--sr-i": i % 3 } as React.CSSProperties} className="sr-blur group relative bg-card p-7 transition-colors hover:bg-accent/40">
                  <f.icon className="size-6 text-landing-accent transition-transform group-hover:scale-110" aria-hidden />
                  <h3 className="mt-4 text-base font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-20 border-y border-border bg-muted/30">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div>
              <span className="flex size-14 items-center justify-center rounded-2xl bg-landing-accent/12 text-landing-accent">
                <ShieldAlert className="size-7" aria-hidden />
              </span>
              <div className="mt-6">
                <SectionHeading align="left" title="It only tests what you're allowed to test" body="AIVERA is built for authorized assessment of UMERCH3.0. Testing anything without the owner's written permission is not allowed, and the system is designed to stop it." />
              </div>
            </div>
            <ul className="space-y-3">
              {GUARDS.map((g, i) => (
                <li key={g} style={{ "--sr-i": i } as React.CSSProperties} className="sr-slide flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-landing-accent/40">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 py-24 sm:px-6">
          <div className="sr-zoom relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-landing-accent/25 bg-gradient-to-br from-landing-accent/15 via-card to-landing-deep/10 px-6 py-16 sm:px-12">
            <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden />
            <BrandMark className="pointer-events-none absolute -right-10 -bottom-12 size-72 opacity-15 sm:size-96" />
            <div className="relative max-w-xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to assess UMERCH3.0?</h2>
              <p className="mt-4 text-muted-foreground">Sign in, confirm the scope, and let AIVERA do the heavy lifting. You make the final call.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="landing-shine rounded-full">
                  <Link to={signedIn ? "/dashboard" : "/signup"}>
                    {signedIn ? "Open dashboard" : "Create an account"} <ArrowRight />
                  </Link>
                </Button>
                {!signedIn && (
                  <Button asChild size="lg" variant="outline" className="rounded-full bg-card/60">
                    <Link to="/login">Sign in</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-8" />
              <span className="text-lg font-medium tracking-wide">AIVERA</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">Web security assessment for UMERCH3.0, the UM Merchandise Management System.</p>
          </div>
          <div>
            <p className="text-sm font-medium">Explore</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#workflow" className="hover:text-foreground">How it works</a></li>
              <li><a href="#features" className="hover:text-foreground">Features</a></li>
              <li><a href="#safety" className="hover:text-foreground">Safety</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">Account</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {signedIn ? (
                <li><Link to="/dashboard" className="hover:text-foreground">Dashboard</Link></li>
              ) : (
                <>
                  <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
                  <li><Link to="/signup" className="hover:text-foreground">Sign up</Link></li>
                </>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">Only test systems you are authorized to test.</p>
        </div>
      </footer>
    </div>
  );
}
