import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ArrowRight, Bot, BrainCircuit, FileText, History, ListChecks, Loader2, Scale, ScanSearch, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout, SectionCard, IconChip } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { AIAnalysisPanel } from "@/components/security/AIAnalysisPanel";
import { AINotice } from "@/components/security/AINotice";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { AI_MODES } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { can, deniedReason } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { analysisService } from "@/services";
import type { AIMode } from "@/types";

/** The six modes as plain questions. */
const ASK: Record<AIMode, string> = {
  scan_interpretation: "Explain scan results",
  vulnerability_explanation: "Explain a finding",
  risk_prioritization: "How urgent is it?",
  remediation: "How do we fix it?",
  test_recommendations: "What should I test?",
  assessment_summary: "Write a summary",
};

/** Each question's icon, used on its tile and in the history list. */
const MODE_ICON: Record<AIMode, LucideIcon> = {
  scan_interpretation: ScanSearch,
  vulnerability_explanation: BrainCircuit,
  risk_prioritization: Scale,
  remediation: Wrench,
  test_recommendations: ListChecks,
  assessment_summary: FileText,
};
/** The icon chip every list row in the app uses (Integrations, Websites). */

const SCAN_KIND: Record<string, string> = { simulated: "Practice scan", real: "Real scan", imported: "Imported" };

export default function AIAnalystPage() {
  useDocumentTitle("AI analyst");
  const user = useCurrentUser();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const data = useDataStore(useShallow((s) => ({ projects: s.projects, scans: s.scans, findings: s.findings, evidence: s.evidence, results: s.scanResults, analyses: s.aiAnalyses })));

  // Deep links from findings and scans (?finding=… / ?scan=…&mode=…) still work.
  const linkedFinding = data.findings.find((f) => f.id === params.get("finding"));
  const linkedScan = data.scans.find((s) => s.id === params.get("scan"));
  const [mode, setMode] = React.useState<AIMode>((params.get("mode") as AIMode) ?? (linkedFinding ? "vulnerability_explanation" : "scan_interpretation"));
  const [scanId, setScanId] = React.useState(linkedScan?.id ?? linkedFinding?.scanId ?? "");
  const [findingId, setFindingId] = React.useState(linkedFinding?.id ?? "");
  const [projectId, setProjectId] = React.useState(linkedFinding?.projectId ?? linkedScan?.projectId ?? data.projects.find((p) => p.status === "in_progress")?.id ?? data.projects[0]?.id ?? "");
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const needs = AI_MODES.find((m) => m.id === mode)!.needs;
  const scan = data.scans.find((s) => s.id === scanId);
  const finding = data.findings.find((f) => f.id === findingId);
  // The project follows whatever is being asked about; only the summary asks for it directly.
  const project = lookups.projects[needs === "scan" ? (scan?.projectId ?? "") : needs === "finding" ? (finding?.projectId ?? "") : projectId];

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (needs === "finding" && findingId) next.set("finding", findingId);
    if (needs === "scan" && scanId) next.set("scan", scanId);
    next.set("mode", mode);
    setParams(next, { replace: true });
  }, [needs, findingId, scanId, mode, setParams]);

  const completedScans = data.scans.filter((s) => s.status === "completed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sortedFindings = [...data.findings].sort((a, b) => a.code.localeCompare(b.code));
  const ready = needs === "scan" ? !!scan : needs === "finding" ? !!finding : !!project;

  const current =
    data.analyses.find((a) => a.id === currentId) ??
    (needs === "finding" && finding
      ? data.analyses.find((a) => a.findingId === finding.id && a.mode === mode)
      : needs === "scan" && scan
        ? data.analyses.find((a) => a.scanId === scan.id && a.mode === mode && !a.findingId)
        : undefined);
  const history = data.analyses.filter((a) => !project || a.projectId === project.id).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, 6);

  const run = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const res = await analysisService.analyze({
        mode,
        project,
        finding: needs === "finding" ? finding : undefined,
        scan: needs === "scan" ? scan : undefined,
        scanResults: needs === "scan" && scan ? data.results.filter((r) => r.scanId === scan.id) : [],
        evidence: needs === "finding" && finding ? data.evidence.filter((e) => e.findingId === finding.id) : [],
        projectFindings: data.findings.filter((f) => f.projectId === project.id),
      });
      setCurrentId(res.id);
      toast.success("Analysis ready", { description: "Advisory only. A person still makes the decision.", action: { label: "View", onClick: () => document.getElementById("ai-answer")?.scrollIntoView({ behavior: "smooth", block: "start" }) } });
    } catch (e) {
      toast.error("Could not run the analysis", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!can(user?.role, "use_ai"))
    return (
      <ContentContainer>
        <PageHeader title="AI analyst" />
        <Callout tone="warning" title="Not available for your role">{deniedReason(user?.role)}</Callout>
      </ContentContainer>
    );

  const source = needs === "scan" && scan ? { to: `/scans/${scan.id}`, label: "Open scan" } : needs === "finding" && finding ? { to: `/findings/${finding.id}`, label: "Open finding" } : null;

  return (
    <ContentContainer wide>
      <PageHeader title="AI analyst" />

      <SectionCard title="Ask the AI" icon={Sparkles} contentClassName="space-y-5">
        <div className="space-y-2.5">
          <p className="text-sm text-muted-foreground">What do you want to know?</p>
          <div role="radiogroup" aria-label="Question" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {AI_MODES.map((m) => {
              const Icon = MODE_ICON[m.id];
              const on = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={m.description}
                  onClick={() => {
                    setMode(m.id);
                    setCurrentId(null);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    on ? "border-primary bg-primary/8 font-medium ring-1 ring-primary" : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <IconChip icon={Icon} />
                  <span className="leading-tight">{ASK[m.id]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium">{needs === "scan" ? "Which scan?" : needs === "finding" ? "Which finding?" : "Which project?"}</p>
            {needs === "scan" ? (
              <Picker value={scanId} onChange={(v) => { setScanId(v); setCurrentId(null); }} placeholder="Choose a scan" options={completedScans.map((s) => ({ value: s.id, label: `${s.code} · ${SCAN_KIND[s.dataOrigin] ?? s.name} · ${lookups.targets[s.targetId]?.name ?? ""}` }))} />
            ) : needs === "finding" ? (
              <Picker value={findingId} onChange={(v) => { setFindingId(v); setCurrentId(null); }} placeholder="Choose a finding" options={sortedFindings.map((f) => ({ value: f.id, label: `${f.code} · ${f.title}` }))} />
            ) : (
              <Picker value={projectId} onChange={(v) => { setProjectId(v); setCurrentId(null); }} placeholder="Choose a project" options={data.projects.filter((p) => p.status !== "archived").map((p) => ({ value: p.id, label: p.name }))} />
            )}
          </div>
          <Button className="rounded-full sm:w-44" disabled={!ready || busy} onClick={run}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {current ? "Run again" : "Analyse"}
          </Button>
        </div>
        {source && (
          <Link to={source.to} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {source.label} for the full evidence <ArrowRight className="size-3" />
          </Link>
        )}
      </SectionCard>

      <AINotice />

      {busy ? (
        <Card className="space-y-3 p-5" aria-busy="true">
          <div className="flex items-center gap-2 text-sm text-primary"><Loader2 className="size-4 animate-spin" /> Analysing…</div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </Card>
      ) : current ? (
        <div id="ai-answer" className="scroll-mt-20">
          <AIAnalysisPanel analysis={current} finding={data.findings.find((f) => f.id === current.findingId)} />
        </div>
      ) : (
        <EmptyState icon={Bot} title="No analysis yet" description={ready ? "Press Analyse to get one." : `Pick ${needs === "scan" ? "a scan" : needs === "finding" ? "a finding" : "a project"} above, then press Analyse.`} />
      )}

      {history.length > 0 && (
        <SectionCard title="Recent analyses" icon={History} flush>
          <ul className="divide-y divide-border">
            {history.map((a) => {
              const Icon = MODE_ICON[a.mode];
              return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setMode(a.mode);
                    if (a.findingId) setFindingId(a.findingId);
                    if (a.scanId) setScanId(a.scanId);
                    setCurrentId(a.id);
                  }}
                  className={cn("flex w-full items-center gap-3 px-6 py-3 text-left text-sm transition-colors hover:bg-accent/40", current?.id === a.id && "bg-accent/40 font-medium")}
                >
                  <IconChip icon={Icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.title}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{ASK[a.mode]}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(a.generatedAt)}</span>
                </button>
              </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </ContentContainer>
  );
}

function Picker({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nothing to choose yet.</div>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
