import * as React from "react";
import { Link, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Bot, CircleStop, Pause, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { KeyValue, CodeBlock } from "@/components/shared/display";
import { Collapsible, ContentCard, DetailLayout, FactList, SidePanel } from "@/components/shared/DetailLayout";
import { NotFoundState, EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/security/badges";
import { ScanProgress } from "@/components/security/ScanProgress";
import { FindingRow } from "@/components/dashboard/widgets";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { CATEGORY_BY_ID, DATA_ORIGIN, SCAN_PROFILES, SCAN_STATUS, TOOL_META } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { IS_API, scanService } from "@/services";
import { refresh } from "@/services/api/sync";

export default function ScanDetailPage() {
  const { scanId } = useParams();
  const user = useCurrentUser();
  const lookups = useLookups();
  const scan = useDataStore((s) => s.scans.find((x) => x.id === scanId));
  useDocumentTitle(scan?.code ?? "Scan");
  const { results, findings } = useDataStore(useShallow((s) => ({ results: s.scanResults, findings: s.findings })));
  const [cancelOpen, setCancelOpen] = React.useState(false);
  React.useEffect(() => {
    if (!IS_API || !scan || (scan.status !== "queued" && scan.status !== "running")) return;
    const timer = setInterval(() => { void refresh().catch(() => undefined); }, 3000);
    return () => clearInterval(timer);
  }, [scan?.id, scan?.status]);

  if (!scan)
    return (
      <ContentContainer>
        <NotFoundState entity="Scan" backTo="/scans" backLabel="Back to Scans" />
      </ContentContainer>
    );

  const target = lookups.targets[scan.targetId];
  const scanResults = results.filter((r) => r.scanId === scan.id);
  const scanFindings = findings.filter((f) => f.scanId === scan.id);
  const running = scan.status === "running" || scan.status === "queued";

  const canDemo = scan.dataOrigin === "simulated" && can(user?.role, "run_demo_scans");

  return (
    <ContentContainer wide>
      <PageHeader
        eyebrow={
          <>
            <Link to="/scans" className="hover:text-foreground">Scans</Link>
            <span>/</span>
            <span className="font-mono">{scan.code}</span>
          </>
        }
        title={scan.name}
        meta={
          <>
            <StatusBadge status={scan.status} map={SCAN_STATUS} />
            <span className="text-xs text-muted-foreground">
              on <Link to={`/targets/${scan.targetId}`} className="font-medium text-foreground hover:text-primary">{target?.name}</Link>
            </span>
          </>
        }
      />

      <DetailLayout
        aside={
          <>
            <SidePanel tone="primary" title="Status">
              <ScanProgress scan={scan} stages={false} />
              {scan.errorMessage && <p className="rounded-md border border-sev-critical/30 bg-sev-critical/5 px-3 py-2 text-xs text-sev-critical">{scan.errorMessage}</p>}
              <div className="space-y-2">
                {scanFindings.length > 0 && (
                  <Button className="w-full" asChild>
                    <Link to={`/findings?scan=${scan.id}`}>
                      <ShieldAlert /> Review {scanFindings.length} finding{scanFindings.length === 1 ? "" : "s"}
                    </Link>
                  </Button>
                )}
                {/* Demo simulations run step by step in the browser, so they can be paused, continued or stopped. */}
                {canDemo && !IS_API && scan.status === "paused" && (
                  <Button className="w-full" onClick={() => void scanService.resume(scan.id, (count) => toast.success(`Simulation ${scan.code} finished`, { description: `${count} SIMULATED finding(s) await human verification.` })).then(() => toast("Simulation continued"))}>
                    <Play /> Continue
                  </Button>
                )}
                {canDemo && (running || scan.status === "paused") && (
                  <div className="flex gap-2">
                    {!IS_API && scan.status === "running" && (
                      <Button variant="warning-outline" size="sm" className="flex-1" onClick={() => void scanService.pause(scan.id).then(() => toast("Simulation paused", { description: `Stopped at ${scan.progress}%. Continue whenever you're ready.` }))}>
                        <Pause /> Pause
                      </Button>
                    )}
                    <Button variant="destructive-outline" size="sm" className="flex-1" onClick={() => setCancelOpen(true)}>
                      <CircleStop /> Stop
                    </Button>
                  </div>
                )}
                {scan.status === "completed" && can(user?.role, "use_ai") && (
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to={`/ai-analyst?scan=${scan.id}&mode=scan_interpretation`}>
                      <Bot /> Explain these results with AI
                    </Link>
                  </Button>
                )}
              </div>
            </SidePanel>
            <SidePanel title="Details">
              <FactList
                items={[
                  { label: "Website", value: target ? <Link to={`/targets/${target.id}`} className="hover:text-primary">{target.name}</Link> : "N/A" },
                  { label: "Project", value: <Link to={`/projects/${scan.projectId}`} className="hover:text-primary">{lookups.projects[scan.projectId]?.code ?? "N/A"}</Link> },
                  { label: "Profile", value: SCAN_PROFILES[scan.config.profile].label },
                  { label: "Tools", value: scan.config.tools.map((t) => TOOL_META[t].label).join(", ") },
                  { label: "Speed", value: `${scan.config.requestsPerSecond} req/s, max ${scan.config.timeLimitMinutes} min` },
                  { label: "Data", value: DATA_ORIGIN[scan.dataOrigin].label },
                  { label: "Started by", value: lookups.users[scan.createdBy]?.name ?? "N/A" },
                  { label: "Started", value: formatDateTime(scan.startedAt) },
                  scan.completedAt ? { label: "Finished", value: formatDateTime(scan.completedAt) } : null,
                ]}
              />
            </SidePanel>
          </>
        }
        main={
          <>
            {scan.dataOrigin === "simulated" && (running || scan.status === "paused") && (
              <ContentCard title="Progress">
                <ScanProgress scan={scan} />
              </ContentCard>
            )}

            <ContentCard title="Findings" count={scanFindings.length} action={scanFindings.length > 0 && <span className="text-xs text-muted-foreground">Unverified until a person decides</span>}>
              {scanFindings.length ? (
                <div className="-mx-2 space-y-0.5">{scanFindings.map((f) => <FindingRow key={f.id} finding={f} target={target?.name} />)}</div>
              ) : (
                <EmptyState compact title={running ? "Scan in progress…" : "No findings recorded"} description={running ? "Findings appear here when the scan completes." : undefined} />
              )}
            </ContentCard>

            <Collapsible title={`Tool output (${scanResults.length})`} hint="Raw output from each tool">
              <div className="space-y-4">
                {scanResults.length === 0 && <EmptyState compact title="No tool output yet" />}
                {scanResults.map((r) => (
                  <div key={r.id}>
                    <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{TOOL_META[r.tool].label}</span>
                      <span className="text-xs text-muted-foreground">{r.itemsFound} items · {formatDateTime(r.recordedAt)}</span>
                    </p>
                    {r.summary && <p className="mb-2 text-xs text-muted-foreground">{r.summary}</p>}
                    <CodeBlock label={`${TOOL_META[r.tool].label} output`}>{r.rawOutput}</CodeBlock>
                  </div>
                ))}
              </div>
            </Collapsible>

            <Collapsible title="Scan settings" hint="Categories, limits and scope">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KeyValue label="Address" mono>{target?.url}</KeyValue>
                <KeyValue label="Categories">{scan.config.categories.map((c) => CATEGORY_BY_ID[c].short).join(", ")}</KeyValue>
                <KeyValue label="Concurrency">{scan.config.maxConcurrency}</KeyValue>
                <KeyValue label="Output format">{scan.config.outputFormat.toUpperCase()}</KeyValue>
                <KeyValue label="Exclusions enforced">{scan.config.respectExclusions ? "Yes" : "No"}</KeyValue>
                <KeyValue label="Scope confirmed">{scan.config.scopeConfirmed ? "Yes" : "No"}</KeyValue>
                <KeyValue label="Excluded paths" mono className="sm:col-span-2 lg:col-span-3">{target?.scope.excludedPaths.join(", ") || "none"}</KeyValue>
              </dl>
            </Collapsible>
          </>
        }
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Stop this simulation?"
        description="The simulated run ends here and no findings will be generated. To clear all practice data, use Reset simulated data on the Scans page."
        confirmLabel="Stop simulation"
        destructive
        onConfirm={async () => {
          await scanService.cancel(scan.id);
          toast("Simulation stopped");
        }}
      />
    </ContentContainer>
  );
}
