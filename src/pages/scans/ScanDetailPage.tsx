import * as React from "react";
import { Link, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Bot, CircleStop, Pause, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { SectionCard, KeyValue, CodeBlock, Callout } from "@/components/shared/display";
import { NotFoundState, EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge, OriginBadge, ToolBadge, ToneBadge } from "@/components/security/badges";
import { ScanProgress } from "@/components/security/ScanProgress";
import { FindingRow } from "@/components/dashboard/widgets";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { CATEGORY_BY_ID, SCAN_PROFILES, SCAN_STATUS, TOOL_META } from "@/lib/constants";
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
        <NotFoundState entity="Scan" backTo="/scans" backLabel="Back to Scan Center" />
      </ContentContainer>
    );

  const target = lookups.targets[scan.targetId];
  const scanResults = results.filter((r) => r.scanId === scan.id);
  const scanFindings = findings.filter((f) => f.scanId === scan.id);
  const running = scan.status === "running" || scan.status === "queued";

  return (
    <ContentContainer>
      <PageHeader
        eyebrow={<><span className="font-mono">{scan.code}</span><span>·</span><Link className="hover:text-foreground" to={`/projects/${scan.projectId}`}>{lookups.projects[scan.projectId]?.code}</Link></>}
        title={scan.name}
        meta={
          <>
            <StatusBadge status={scan.status} map={SCAN_STATUS} />
            <OriginBadge origin={scan.dataOrigin} />
            {scan.config.tools.map((t) => <ToolBadge key={t} tool={t} />)}
          </>
        }
        actions={
          <>
            {/* Demo simulations run step by step in the browser, so they can be paused, continued or stopped. */}
            {scan.dataOrigin === "simulated" && !IS_API && can(user?.role, "run_demo_scans") && scan.status === "running" && (
              <Button variant="outline" size="sm" onClick={() => void scanService.pause(scan.id).then(() => toast("Simulation paused", { description: `Stopped at ${scan.progress}%. Continue whenever you're ready.` }))}>
                <Pause /> Pause
              </Button>
            )}
            {scan.dataOrigin === "simulated" && !IS_API && can(user?.role, "run_demo_scans") && scan.status === "paused" && (
              <Button size="sm" onClick={() => void scanService.resume(scan.id, (count) => toast.success(`Simulation ${scan.code} finished`, { description: `${count} SIMULATED finding(s) await human verification.` })).then(() => toast("Simulation continued"))}>
                <Play /> Continue
              </Button>
            )}
            {(running || scan.status === "paused") && scan.dataOrigin === "simulated" && can(user?.role, "run_demo_scans") && (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                <CircleStop /> Stop
              </Button>
            )}
            {scan.status === "completed" && can(user?.role, "use_ai") && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/ai-analyst?scan=${scan.id}&mode=scan_interpretation`}>
                  <Bot /> Interpret results with AI
                </Link>
              </Button>
            )}
            {scanFindings.length > 0 && (
              <Button size="sm" asChild>
                <Link to={`/findings?scan=${scan.id}`}>
                  <ShieldAlert /> Review {scanFindings.length} finding(s)
                </Link>
              </Button>
            )}
          </>
        }
      />

      {scan.dataOrigin === "simulated" && (
        <Callout tone="demo" title="SIMULATED scan">
          This record was produced by the in-browser demo simulation. Its results and findings are synthetic, are labelled SIMULATED everywhere, and are never converted into real evidence. Each finding still requires human verification.
        </Callout>
      )}

      <SectionCard title="Progress">
        <ScanProgress scan={scan} />
        {scan.errorMessage && <p className="mt-3 rounded-md border border-sev-critical/30 bg-sev-critical/5 px-3 py-2 text-xs text-sev-critical">{scan.errorMessage}</p>}
      </SectionCard>

      <Tabs defaultValue={scanFindings.length ? "findings" : "config"}>
        <TabsList>
          <TabsTrigger value="findings">Findings ({scanFindings.length})</TabsTrigger>
          <TabsTrigger value="results">Tool output ({scanResults.length})</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>
        <TabsContent value="findings">
          <SectionCard title="Findings from this scan" description="All are unverified until an assessor records a decision.">
            {scanFindings.length ? (
              <div className="-mx-2 space-y-0.5">{scanFindings.map((f) => <FindingRow key={f.id} finding={f} target={target?.name} />)}</div>
            ) : (
              <EmptyState compact title={running ? "Assessment in progress…" : "No findings recorded"} description={running ? "Findings will appear when the assessment completes." : undefined} />
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="results" className="space-y-4">
          {scanResults.length === 0 && <EmptyState title="No tool output yet" />}
          {scanResults.map((r) => (
            <SectionCard key={r.id} title={TOOL_META[r.tool].label} description={r.summary} actions={<><OriginBadge origin={r.dataOrigin} /><ToneBadge tone="muted">{r.itemsFound} items</ToneBadge></>}>
              <CodeBlock label={`${TOOL_META[r.tool].label} output`}>{r.rawOutput}</CodeBlock>
              <p className="mt-2 text-[11px] text-muted-foreground">Recorded {formatDateTime(r.recordedAt)}</p>
            </SectionCard>
          ))}
        </TabsContent>
        <TabsContent value="config">
          <SectionCard title="Configuration & scope snapshot">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KeyValue label="Target">{target?.name}<span className="block font-mono text-[11px] text-muted-foreground">{target?.url}</span></KeyValue>
              <KeyValue label="Profile">{SCAN_PROFILES[scan.config.profile].label}</KeyValue>
              <KeyValue label="Categories">{scan.config.categories.map((c) => CATEGORY_BY_ID[c].short).join(", ")}</KeyValue>
              <KeyValue label="Rate limit">{scan.config.requestsPerSecond} req/s</KeyValue>
              <KeyValue label="Time limit">{scan.config.timeLimitMinutes} min</KeyValue>
              <KeyValue label="Concurrency">{scan.config.maxConcurrency}</KeyValue>
              <KeyValue label="Output format">{scan.config.outputFormat.toUpperCase()}</KeyValue>
              <KeyValue label="Exclusions enforced">{scan.config.respectExclusions ? "Yes" : "No"}</KeyValue>
              <KeyValue label="Scope confirmed">{scan.config.scopeConfirmed ? "Yes" : "No"}</KeyValue>
              <KeyValue label="Created by">{lookups.users[scan.createdBy]?.name}</KeyValue>
              <KeyValue label="Started">{formatDateTime(scan.startedAt)}</KeyValue>
              <KeyValue label="Completed">{formatDateTime(scan.completedAt)}</KeyValue>
              <KeyValue label="Excluded paths" mono className="sm:col-span-2 lg:col-span-3">{target?.scope.excludedPaths.join(", ") || "none"}</KeyValue>
            </dl>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Stop this simulation?"
        description="The simulated run ends here and no findings will be generated. To clear all practice data, use Reset simulated data on the Scan Center page."
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
