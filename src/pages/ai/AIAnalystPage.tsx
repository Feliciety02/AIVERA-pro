import * as React from "react";
import { useSearchParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Bot, BrainCircuit, FileSearch, FileText, ListChecks, Loader2, ScanSearch, Sparkles, Scale, Wrench, History, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout, CodeBlock } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { AIAnalysisPanel } from "@/components/security/AIAnalysisPanel";
import { OriginBadge, SeverityBadge, StatusBadge, ToolBadge } from "@/components/security/badges";
import { AINotice } from "@/components/security/AINotice";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { AI_MODES, TOOL_META, VERIFICATION_STATUS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { can, deniedReason } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { analysisService } from "@/services";
import type { AIMode } from "@/types";

const MODE_ICONS: Record<AIMode, LucideIcon> = {
  scan_interpretation: ScanSearch,
  vulnerability_explanation: BrainCircuit,
  risk_prioritization: Scale,
  remediation: Wrench,
  test_recommendations: ListChecks,
  assessment_summary: FileText,
};

const NONE = "__none__";

function PickerRow({ label, value, onChange, options, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs" aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function AIAnalystPage() {
  useDocumentTitle("AI Security Analyst");
  const user = useCurrentUser();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const data = useDataStore(useShallow((s) => ({ projects: s.projects, targets: s.targets, scans: s.scans, findings: s.findings, evidence: s.evidence, results: s.scanResults, analyses: s.aiAnalyses })));
  const aiIntegration = useDataStore((s) => s.integrations.find((i) => i.id === "ai_service"));

  // Selection is derived from the URL so deep links from findings/scans work.
  const initialFinding = data.findings.find((f) => f.id === params.get("finding"));
  const initialScan = data.scans.find((s) => s.id === (params.get("scan") ?? initialFinding?.scanId));
  const [projectId, setProjectId] = React.useState(initialFinding?.projectId ?? initialScan?.projectId ?? data.projects.find((p) => p.status === "in_progress")?.id ?? "");
  const [targetId, setTargetId] = React.useState(initialFinding?.targetId ?? initialScan?.targetId ?? "");
  const [scanId, setScanId] = React.useState(initialScan?.id ?? "");
  const [findingId, setFindingId] = React.useState(initialFinding?.id ?? "");
  const [mode, setMode] = React.useState<AIMode>((params.get("mode") as AIMode) ?? (initialFinding ? "vulnerability_explanation" : initialScan ? "scan_interpretation" : "vulnerability_explanation"));
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (findingId) next.set("finding", findingId);
    if (scanId) next.set("scan", scanId);
    next.set("mode", mode);
    setParams(next, { replace: true });
  }, [findingId, scanId, mode, setParams]);

  const project = lookups.projects[projectId];
  const targets = data.targets.filter((t) => t.projectId === projectId);
  const scans = data.scans.filter((s) => s.projectId === projectId && (!targetId || s.targetId === targetId) && s.status === "completed");
  const findings = data.findings.filter((f) => f.projectId === projectId && (!targetId || f.targetId === targetId) && (!scanId || f.scanId === scanId));
  const finding = data.findings.find((f) => f.id === findingId);
  const scan = data.scans.find((s) => s.id === scanId);
  const evidence = finding ? data.evidence.filter((e) => e.findingId === finding.id) : [];
  const scanResults = scan ? data.results.filter((r) => r.scanId === scan.id) : [];
  const modeMeta = AI_MODES.find((m) => m.id === mode)!;

  const ready = modeMeta.needs === "finding" ? !!finding : modeMeta.needs === "scan" ? !!scan || !!finding : !!project;
  const hint = modeMeta.needs === "finding" ? "Select a finding" : modeMeta.needs === "scan" ? "Select a completed scan" : "Select a project";

  const history = data.analyses.filter((a) => a.projectId === projectId);
  const current = data.analyses.find((a) => a.id === currentId) ?? (finding ? data.analyses.find((a) => a.findingId === finding.id && a.mode === mode) : scan && mode === "scan_interpretation" ? data.analyses.find((a) => a.scanId === scan.id && a.mode === mode && !a.findingId) : undefined);

  const run = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const res = await analysisService.analyze({
        mode,
        project,
        finding: mode === "scan_interpretation" && scan ? undefined : finding,
        scan,
        scanResults,
        evidence: mode === "scan_interpretation" && scan ? [] : evidence,
        projectFindings: data.findings.filter((f) => f.projectId === project.id),
      });
      setCurrentId(res.id);
      toast.success("Sample analysis generated", { description: "Demo adapter — predefined content, requires human verification." });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!can(user?.role, "use_ai"))
    return (
      <ContentContainer>
        <PageHeader title="AI Security Analyst" />
        <Callout tone="warning" title="Not available for this demo role">{deniedReason(user?.role)}</Callout>
      </ContentContainer>
    );

  return (
    <ContentContainer wide>
      <PageHeader
        title="AI Security Analyst"
        description="An analysis workspace where AI assists interpretation and remediation planning. The assessor always makes the final call."
        meta={<span className="text-xs text-muted-foreground">Adapter: {aiIntegration?.status === "connected" ? aiIntegration.integrationType : analysisService.adapterLabel}</span>}
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" role="radiogroup" aria-label="Analysis mode">
        {AI_MODES.map((m) => {
          const Icon = MODE_ICONS[m.id];
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { setMode(m.id); setCurrentId(null); }}
              className={cn("rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none", active ? "border-primary bg-primary/8 ring-1 ring-primary" : "border-border bg-card hover:bg-accent/50")}
            >
              <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
              <p className="mt-2 text-xs font-semibold">{m.label}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{m.description}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Left: context & evidence */}
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="size-4 text-muted-foreground" /> Analysis context</p>
            <PickerRow label="Project" value={projectId} onChange={(v) => { setProjectId(v); setTargetId(""); setScanId(""); setFindingId(""); setCurrentId(null); }} placeholder="Select project" options={data.projects.filter((p) => p.status !== "archived").map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
            <PickerRow label="Target" value={targetId} disabled={!projectId} onChange={(v) => { setTargetId(v); setScanId(""); setFindingId(""); setCurrentId(null); }} placeholder="All targets" options={targets.map((t) => ({ value: t.id, label: t.name }))} />
            <PickerRow label="Scan" value={scanId} disabled={!projectId} onChange={(v) => { setScanId(v); setFindingId(""); setCurrentId(null); }} placeholder="All scans" options={scans.map((s) => ({ value: s.id, label: `${s.code} · ${s.dataOrigin === "simulated" ? "SIMULATED" : "imported"} · ${s.name}` }))} />
            <PickerRow label="Finding" value={findingId} disabled={!projectId} onChange={(v) => { setFindingId(v); setCurrentId(null); }} placeholder="Select finding" options={findings.map((f) => ({ value: f.id, label: `${f.code} · ${f.title}` }))} />
            {finding && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium">{finding.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <SeverityBadge severity={finding.severity} />
                  <StatusBadge status={finding.verificationStatus} map={VERIFICATION_STATUS} />
                  <ToolBadge tool={finding.sourceTool} />
                  <OriginBadge origin={finding.dataOrigin} />
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{finding.affectedAsset}</p>
              </div>
            )}
            <Button className="w-full" disabled={!ready || busy} onClick={run}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {ready ? `Run ${modeMeta.label}` : hint}
            </Button>
          </Card>

          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Technical evidence</p>
            {!finding ? (
              <p className="text-xs text-muted-foreground">Select a finding to view its evidence.</p>
            ) : evidence.length === 0 ? (
              <p className="text-xs text-muted-foreground">No evidence attached.</p>
            ) : (
              <ul className="space-y-2">
                {evidence.map((e) => (
                  <li key={e.id}>
                    <details className="rounded-lg border border-border">
                      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                        <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{e.id}</span>
                      </summary>
                      <div className="border-t border-border p-2"><CodeBlock className="max-h-48 text-[10.5px]">{e.content}</CodeBlock></div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Scan output</p>
            {!scan ? (
              <p className="text-xs text-muted-foreground">Select a scan to view raw tool output.</p>
            ) : (
              <div className="space-y-2">
                {scanResults.map((r) => (
                  <details key={r.id} className="rounded-lg border border-border">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs">
                      <ToolBadge tool={r.tool} />
                      <span className="min-w-0 flex-1 truncate">{r.summary}</span>
                    </summary>
                    <div className="border-t border-border p-2"><CodeBlock className="max-h-48 text-[10.5px]">{r.rawOutput}</CodeBlock></div>
                  </details>
                ))}
                {scanResults.length === 0 && <p className="text-xs text-muted-foreground">No output for {TOOL_META[scan.config.tools[0]!]?.label}.</p>}
              </div>
            )}
          </Card>
        </div>

        {/* Right: AI output */}
        <div className="space-y-4">
          <AINotice />
          {busy ? (
            <Card className="space-y-3 p-5" aria-busy="true">
              <div className="flex items-center gap-2 text-sm text-primary"><Loader2 className="size-4 animate-spin" /> Preparing sample analysis…</div>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </Card>
          ) : current ? (
            <AIAnalysisPanel analysis={current} finding={data.findings.find((f) => f.id === current.findingId)} />
          ) : (
            <EmptyState icon={Bot} title="No analysis selected" description={`Choose a mode and ${hint.toLowerCase()} on the left, then run the analysis. Previous analyses appear in the history below.`} />
          )}

          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-muted-foreground" /> Analysis history {project && <span className="font-normal text-muted-foreground">· {project.code}</span>}</p>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No analyses for this project yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((a) => {
                  const Icon = MODE_ICONS[a.mode];
                  return (
                    <li key={a.id}>
                      <button type="button" onClick={() => { setCurrentId(a.id); setMode(a.mode); if (a.findingId) setFindingId(a.findingId); }} className={cn("flex w-full items-center gap-3 py-2 text-left hover:text-primary", current?.id === a.id && "text-primary")}>
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-xs">{a.title}</span>
                        <span className="text-[10.5px] text-muted-foreground">{a.status === "sent_to_verification" ? "in queue · " : ""}{formatRelative(a.generatedAt)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </ContentContainer>
  );
}
