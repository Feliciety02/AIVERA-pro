import * as React from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { CircleAlert, Loader2, ScanLine, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useDataStore } from "@/stores/dataStore";
import { IS_API, scanService } from "@/services";
import { formatRelative } from "@/lib/format";
import { TOOL_ACTIVITY, toolPermitted, type LiveTool } from "@/features/scanPermissions";
import { awaitsReview } from "@/features/scanLifecycle";
import { useCurrentUser } from "@/hooks";
import { can } from "@/lib/permissions";
import type { Target } from "@/types";

const TOOL_NAME: Record<LiveTool, string> = { nmap: "Nmap", owasp_zap: "OWASP ZAP", http_inspector: "the header and TLS check" };

/**
 * One-click scan for non-technical users: safe defaults (Nmap + ZAP passive, baseline profile,
 * inside the approved scope), a confirmation, and a plain explanation when it isn't possible yet.
 */
export function QuickScanCard({ target, onEditScope, showTargetName, embedded, eyebrow }: { target: Target; onEditScope?: () => void; showTargetName?: boolean; /** Drawn inside another card (no own border). */ embedded?: boolean; eyebrow?: string }) {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const canRun = can(user?.role, "run_demo_scans");
  const tools = (["nmap", "owasp_zap", "http_inspector"] as const).filter((t) => toolPermitted(t, target.scope.allowedActivities));
  const [liveAvailable, setLiveAvailable] = React.useState(false);
  React.useEffect(() => {
    if (IS_API) void scanService.automatedCapabilities().then((c) => setLiveAvailable(c.enabled)).catch(() => setLiveAvailable(false));
  }, []);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const lastScan = useDataStore((s) =>
    s.scans.filter((x) => x.targetId === target.id && x.dataOrigin !== "simulated" && x.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0],
  );
  const lastScanFindings = useDataStore((s) => (lastScan ? s.findings.filter((f) => f.scanId === lastScan.id).length : 0));
  const pendingCount = useDataStore((s) => s.findings.filter((f) => f.targetId === target.id && awaitsReview(f)).length);
  const activeCount = useDataStore((s) => s.scans.filter((scan) => scan.targetId === target.id && ["queued", "running", "paused"].includes(scan.status)).length);

  const authorized = target.authorizationStatus === "authorized" && target.authorizationConfirmed;
  // Why a scan can't start yet, in plain words, with a way to fix it where there is one.
  let blocker: { text: string; fix?: React.ReactNode } | null = null;
  if (!canRun) blocker = { text: "Your role can't start scans. Ask an administrator or a security assessor." };
  else if (!authorized) blocker = { text: "The owner's permission for this website isn't confirmed yet." };
  else if (!target.projectId) blocker = { text: "Add this website to a project first (see the box above)." };
  else if (activeCount) blocker = { text: "A scan is already in progress for this website." };
  else if (pendingCount) blocker = { text: `Review ${pendingCount} pending finding${pendingCount === 1 ? "" : "s"} before scanning again.`, fix: <Button size="sm" variant="outline" asChild><Link to={`/findings?target=${target.id}&status=unverified`}>Open review queue</Link></Button> };
  else if (!IS_API) blocker = { text: "Real scans need the full app with the AIVERA server (npm run dev:full). Demo mode can only run a practice simulation." };
  else if (!liveAvailable) blocker = { text: "Live scanning is turned off on the AIVERA server. An administrator can turn it on in server/.env." };
  else if (!tools.length)
    blocker = {
      text: `The scope doesn't allow any scanning tool yet. Allow "${TOOL_ACTIVITY.nmap}" for Nmap and "${TOOL_ACTIVITY.owasp_zap}" for ZAP.`,
      fix: onEditScope ? (
        <Button size="sm" variant="outline" className="h-7 bg-card" onClick={onEditScope}>
          Edit scope
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="h-7 bg-card" asChild>
          <Link to={`/targets/${target.id}`}>Open the website</Link>
        </Button>
      ),
    };

  const start = async () => {
    setStarting(true);
    try {
      const scan = await scanService.startRealAssessment({
        name: `${target.name} scan`,
        projectId: target.projectId!,
        targetId: target.id,
        config: { tools, categories: target.scope.allowedCategories, profile: "baseline", timeLimitMinutes: 10, requestsPerSecond: 2, maxConcurrency: 1, outputFormat: "json", respectExclusions: true, scopeConfirmed: true },
      });
      toast.success(`Scan ${scan.code} started`, { description: "Results usually arrive in about two minutes. AI explains them automatically." });
      navigate(`/scans/${scan.id}`);
    } catch (e) {
      toast.error("Could not start the scan", { description: (e as Error).message });
    } finally {
      setStarting(false);
    }
  };

  return (
    <section data-tour="quick-scan" aria-label="Scan this website" className={embedded ? "" : "rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.07] to-transparent p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <ScanLine className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-medium text-primary">{eyebrow}</p>}
            <h2 className="text-lg font-semibold tracking-tight">{showTargetName ? `Scan ${target.name}` : "Scan this website"}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Runs {tools.length ? tools.map((t) => TOOL_NAME[t]).join(", ").replace(/, ([^,]*)$/, " and $1") : "the security tools"} only inside the approved scope, with gentle settings. It takes about two minutes. Then AI explains
              what was found, and every result waits for your review.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {lastScan ? (
                <>
                  Last scanned {formatRelative(lastScan.completedAt ?? lastScan.createdAt)} ·{" "}
                  <Link to={`/scans/${lastScan.id}`} className="text-primary hover:underline">
                    {lastScan.code}, {lastScanFindings} finding{lastScanFindings === 1 ? "" : "s"}
                  </Link>
                </>
              ) : (
                "Not scanned yet."
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/scans/new?project=${target.projectId ?? ""}&target=${target.id}`}>
              <Settings2 /> Advanced options
            </Link>
          </Button>
          <Button className="rounded-full" disabled={!!blocker || starting} onClick={() => setConfirmOpen(true)}>
            {starting ? <Loader2 className="animate-spin" /> : <ScanLine />} {lastScan ? "Scan again" : "Scan this website"}
          </Button>
        </div>
      </div>
      {blocker && (
        <p role="note" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-sev-medium/12 px-3 py-2 text-sm">
          <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1">{blocker.text}</span>
          {blocker.fix}
        </p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Scan ${target.name}?`}
        description={`AIVERA will send real, gentle requests to ${target.url} and only to the approved hosts and paths. Only continue if you have the owner's permission and it's okay to test now.`}
        confirmLabel="Start scan"
        onConfirm={start}
      />
    </section>
  );
}
