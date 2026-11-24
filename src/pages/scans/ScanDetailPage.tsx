import * as React from "react";
import { Link, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Bot, CircleStop, Pause, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { toastLink } from "@/lib/toastLink";
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
import type { DataOrigin } from "@/types";
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
                  <Button className="w-full" onClick={() => void scanService.resume(scan.id, (count) => toast.success(`Practice scan ${scan.code} finished`, { description: `${count} practice finding${count === 1 ? "" : "s"} to review.`, action: toastLink(`/findings?scan=${scan.id}`, "Review") })).then(() => toast("Simulation continued"))}>
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
                  { label: "Project", value: <Link to={`/projects/${scan.projectId}`} className="hover:text-primary">{lookups.projects[scan.projectId]?.name ?? "N/A"}</Link> },
                  { label: "Type", value: SCAN_KIND[scan.dataOrigin] ?? DATA_ORIGIN[scan.dataOrigin].label },
                  { label: "Depth", value: <span title={SCAN_PROFILES[scan.config.profile].description}>{SCAN_PROFILES[scan.config.profile].label}</span> },
                  { label: "Tools", value: scan.config.tools.map((t) => TOOL_META[t].label).join(", ") },
                  { label: "Run by", value: lookups.users[scan.createdBy]?.name ?? "N/A" },
                  { label: "When", value: formatDateTime(scan.startedAt) },
                  scan.completedAt ? { label: "Took", value: tookText(scan.startedAt, scan.completedAt) } : null,
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
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium">{TOOL_META[r.tool].label}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(r.recordedAt)}</span>
                    </div>
                    <ResultStats summary={r.summary} itemsFound={r.itemsFound} />
                    <CodeBlock label={`${TOOL_META[r.tool].label} output`}>{r.rawOutput}</CodeBlock>
                  </div>
                ))}
              </div>
            </Collapsible>

            <Collapsible title="Scan settings" hint="Categories, limits and scope">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KeyValue label="Address" mono>{target?.url}</KeyValue>
                <KeyValue label="Categories">{scan.config.categories.map((c) => CATEGORY_BY_ID[c].short).join(", ")}</KeyValue>
                <KeyValue label="Speed limit">{scan.config.requestsPerSecond} requests a second, stops after {scan.config.timeLimitMinutes} min</KeyValue>
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

/**
 * Tool summaries are stored as one machine-written sentence ("Automated …: 0 host(s), 0 port(s),
 * 3 finding(s); 1 item(s) skipped by scope; 3 new, 0 previously recorded finding(s)"). Shown as a
 * few plain counts instead, leaving out the zeros.
 */
function ResultStats({ summary, itemsFound }: { summary: string; itemsFound: number }) {
  const n = (re: RegExp) => Number(re.exec(summary)?.[1] ?? 0);
  const parsed = /host\(s\)/.test(summary);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const stats = parsed
    ? [
        { v: n(/(\d+) finding\(s\);/), label: (c: number) => plural(c, "finding") },
        { v: n(/(\d+) new/), label: (c: number) => `${c} new` },
        { v: n(/(\d+) previously recorded/), label: (c: number) => `${c} seen before` },
        { v: n(/(\d+) host\(s\)/), label: (c: number) => plural(c, "host") },
        { v: n(/(\d+) port\(s\)/), label: (c: number) => plural(c, "open port") },
        { v: n(/(\d+) item\(s\) skipped/), label: (c: number) => `${c} out of scope, skipped` },
      ].filter((x) => x.v > 0)
    : [];
  const practice = /(\d+) sample finding/.exec(summary);
  const items = stats.length ? stats.map((x) => x.label(x.v)) : parsed ? ["Nothing found"] : practice ? [plural(Number(practice[1]), "practice finding")] : [plural(itemsFound, "item")];
  return (
    <ul className="mb-2.5 flex flex-wrap gap-1.5" aria-label="Result summary">
      {items.map((t) => (
        <li key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {t}
        </li>
      ))}
    </ul>
  );
}

/** What kind of run this was, in plain words. */
const SCAN_KIND: Partial<Record<DataOrigin, string>> = { real: "Real scan", simulated: "Practice run (not real)", imported: "Imported results", synthetic: "Sample data" };

/** "under a minute", "3 min", "1 h 5 min". */
function tookText(start?: string, end?: string) {
  if (!start || !end) return "N/A";
  const min = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (min < 1) return "Under a minute";
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
