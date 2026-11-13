import * as React from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, Bot, Download, FileCheck2, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { Callout } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { SeverityBadge, OriginBadge, ToneBadge } from "@/components/security/badges";
import { ReportDocument } from "@/components/reports/ReportDocument";
import { ChoiceCard, Field, Steps } from "./fields";
import { buildReportModel } from "@/features/reports/reportModel";
import { useReportSource, usePdfExport } from "@/features/reports/useReport";
import { REPORT_SECTIONS, REPORT_TEMPLATES } from "@/lib/constants";
import { nowISO, toInputDate } from "@/lib/format";
import { IS_API, analysisService, reportService } from "@/services";
import type { Report, ReportSectionKey } from "@/types";

const STEPS = ["Project", "Targets", "Assessment period", "Verified findings", "Report sections", "Preview", "Export"];
const toISO = (d: string) => new Date(`${d}T00:00:00Z`).toISOString();

export function ReportWizard({ initialProjectId, initialTemplate, userId, onCancel }: { initialProjectId?: string; initialTemplate?: string; userId: string; onCancel: () => void }) {
  const src = useReportSource();
  const { exportPdf, busy: exporting } = usePdfExport();
  const template = REPORT_TEMPLATES.find((t) => t.id === (initialTemplate ?? src.settings.reports.defaultTemplate)) ?? REPORT_TEMPLATES[0]!;
  const [step, setStep] = React.useState(initialProjectId ? 1 : 0);
  const [projectId, setProjectId] = React.useState(initialProjectId ?? "");
  const project = src.projects.find((p) => p.id === projectId);
  const projectTargets = src.targets.filter((t) => t.projectId === projectId);
  const [targetIds, setTargetIds] = React.useState<string[]>([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState(toInputDate(nowISO()));
  const [findingIds, setFindingIds] = React.useState<string[] | null>(null);
  const [includeUnverified, setIncludeUnverified] = React.useState(src.settings.reports.includeUnverifiedAppendix);
  const [templateId, setTemplateId] = React.useState(template.id);
  const [sections, setSections] = React.useState<ReportSectionKey[]>(template.sections);
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [final, setFinal] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [created, setCreated] = React.useState<Report | null>(null);

  React.useEffect(() => {
    if (!project) return;
    setTargetIds(src.targets.filter((t) => t.projectId === project.id).map((t) => t.id));
    // Start at the earlier of the planned start and the first finding, so early findings aren't silently excluded.
    const firstFinding = src.findings.filter((f) => f.projectId === project.id).map((f) => f.discoveredAt).sort()[0];
    setFrom(toInputDate(firstFinding && firstFinding < project.startDate ? firstFinding : project.startDate));
    const lastFinding = src.findings.filter((f) => f.projectId === project.id).map((f) => f.discoveredAt).sort().pop();
    if (lastFinding && lastFinding.slice(0, 10) > to) setTo(toInputDate(lastFinding));
    setTitle(`${project.name}, Security Assessment Report`);
    setFindingIds(null);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const inPeriod = (d: string) => (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to);
  const confirmed = src.findings.filter((f) => targetIds.includes(f.targetId) && f.verificationStatus === "confirmed" && inPeriod(f.discoveredAt));
  const unverifiedCount = src.findings.filter((f) => targetIds.includes(f.targetId) && (f.verificationStatus === "pending" || f.verificationStatus === "needs_review") && inPeriod(f.discoveredAt)).length;
  const selected = findingIds ?? confirmed.map((f) => f.id);

  const draft: Report | null = project
    ? {
        id: created?.id ?? "preview",
        code: created?.code ?? "RPT-PREVIEW",
        title,
        projectId,
        targetIds,
        templateId,
        periodStart: from ? toISO(from) : project.startDate,
        periodEnd: to ? toISO(to) : nowISO(),
        findingIds: selected.filter((id) => confirmed.some((f) => f.id === id)),
        includeUnverified,
        sections: includeUnverified ? [...new Set([...sections, "unverified_observations" as ReportSectionKey])] : sections.filter((s) => s !== "unverified_observations"),
        executiveSummary: summary,
        // With the server, a report is always saved as a draft and a lead approves it.
        status: final && !IS_API ? "final" : "draft",
        createdBy: userId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        generatedFrom: "demonstration_data",
      }
    : null;
  const model = React.useMemo(() => (draft && step >= 5 ? buildReportModel(draft, src) : null), [step, JSON.stringify(draft), src]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors: Record<number, string | null> = {
    0: projectId ? null : "Select a project.",
    1: targetIds.length ? null : "Select at least one target.",
    2: !from || !to ? "Select a start and end date." : from > to ? "Start date must be before end date." : null,
    3: null,
    4: !title.trim() ? "Enter a report title." : sections.length < 3 ? "Select at least the required sections." : null,
    5: null,
    6: null,
  };

  const draftSummary = async () => {
    if (!project) return;
    setDrafting(true);
    try {
      const a = await analysisService.analyze({ mode: "assessment_summary", project, evidence: [], projectFindings: src.findings.filter((f) => f.projectId === project.id && targetIds.includes(f.targetId) && inPeriod(f.discoveredAt)) });
      setSummary(`${a.explanation}\n\n[Drafted with Sample AI Analysis, Demo Mode. Reviewed and edited by the assessor before use.]`);
      toast.success("Sample summary drafted", { description: "Review and edit before generating the report." });
    } finally {
      setDrafting(false);
    }
  };

  const generate = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await reportService.create({
        title: draft.title,
        projectId: draft.projectId,
        targetIds: draft.targetIds,
        templateId: draft.templateId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        findingIds: draft.findingIds,
        includeUnverified: draft.includeUnverified,
        sections: draft.sections,
        executiveSummary: draft.executiveSummary,
        status: draft.status,
      });
      setCreated(r);
      toast.success(`Generated ${r.code}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Steps steps={STEPS} current={step} onSelect={created ? undefined : setStep} />
      {step < 5 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {step === 0 && (
              <>
                <h2 className="text-sm font-semibold">Step 1 · Select project</h2>
                <div className="grid gap-2 md:grid-cols-2">
                  {src.projects.filter((p) => p.status !== "archived").map((p) => (
                    <ChoiceCard key={p.id} checked={projectId === p.id} onToggle={() => setProjectId(p.id)} title={p.name} description={`${p.code} · ${src.findings.filter((f) => f.projectId === p.id && f.verificationStatus === "confirmed").length} confirmed findings`} />
                  ))}
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <h2 className="text-sm font-semibold">Step 2 · Select targets</h2>
                {projectTargets.length === 0 ? <EmptyState compact title="This project has no targets" /> : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {projectTargets.map((t) => (
                      <ChoiceCard key={t.id} checked={targetIds.includes(t.id)} onToggle={() => { setTargetIds(targetIds.includes(t.id) ? targetIds.filter((x) => x !== t.id) : [...targetIds, t.id]); setFindingIds(null); }} title={t.name} description={t.url} />
                    ))}
                  </div>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="text-sm font-semibold">Step 3 · Assessment period</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="rp-from" label="Start" required><Input id="rp-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setFindingIds(null); }} className="[color-scheme:light] dark:[color-scheme:dark]" /></Field>
                  <Field id="rp-to" label="End" required><Input id="rp-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setFindingIds(null); }} className="[color-scheme:light] dark:[color-scheme:dark]" /></Field>
                </div>
                <p className="text-xs text-muted-foreground">{confirmed.length} confirmed finding(s) and {unverifiedCount} unverified observation(s) fall in this period.</p>
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="text-sm font-semibold">Step 4 · Select verified findings</h2>
                <p className="text-xs text-muted-foreground">Only findings a human assessor has <strong>Confirmed</strong> can appear in the verified sections.</p>
                {confirmed.length === 0 ? (
                  <EmptyState compact title="No confirmed findings in this scope/period" description="You can still generate a report; it will state that no vulnerabilities were verified." />
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {confirmed.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Checkbox id={`rf-${f.id}`} checked={selected.includes(f.id)} onCheckedChange={(v) => setFindingIds(v ? [...selected, f.id] : selected.filter((x) => x !== f.id))} />
                        <Label htmlFor={`rf-${f.id}`} className="min-w-0 flex-1 cursor-pointer text-sm font-normal">
                          <span className="block truncate">{f.title}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{f.code}</span>
                        </Label>
                        <SeverityBadge severity={f.severity} />
                        <OriginBadge origin={f.dataOrigin} />
                      </li>
                    ))}
                  </ul>
                )}
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <span>
                    <span className="block text-sm font-medium">Include unverified observations appendix</span>
                    <span className="block text-[11px] text-muted-foreground">{unverifiedCount} observation(s). Clearly separated and labelled as NOT verified.</span>
                  </span>
                  <Switch checked={includeUnverified} onCheckedChange={setIncludeUnverified} aria-label="Include unverified appendix" />
                </label>
              </>
            )}
            {step === 4 && (
              <>
                <h2 className="text-sm font-semibold">Step 5 · Configure report sections</h2>
                <Field id="rp-title" label="Report title" required><Input id="rp-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <div className="flex flex-wrap gap-2">
                  {REPORT_TEMPLATES.map((t) => (
                    <Button key={t.id} size="sm" variant={templateId === t.id ? "subtle" : "outline"} onClick={() => { setTemplateId(t.id); setSections(t.sections); }}>{t.name}</Button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {REPORT_SECTIONS.filter((s) => s.key !== "unverified_observations").map((s) => (
                    <ChoiceCard key={s.key} checked={sections.includes(s.key)} disabled={s.required} onToggle={() => setSections(sections.includes(s.key) ? sections.filter((x) => x !== s.key) : [...sections, s.key])} title={s.label} badge={s.required ? <ToneBadge tone="muted">Required</ToneBadge> : undefined} />
                  ))}
                </div>
                <Field id="rp-sum" label="Executive summary" hint="Write your own, or draft one from the sample AI adapter and edit it.">
                  <Textarea id="rp-sum" rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} />
                </Field>
                <Button variant="outline" size="sm" onClick={draftSummary} disabled={drafting}>
                  {drafting ? <Loader2 className="animate-spin" /> : <Bot />} Draft summary (Sample AI, Demo Mode)
                </Button>
                {IS_API ? (
                  <p className="text-xs text-muted-foreground">Saved as a draft. Submit it from the report page and a Security Lead approves it as final.</p>
                ) : (
                  <label className="flex items-center gap-3 text-sm">
                    <Switch checked={final} onCheckedChange={setFinal} aria-label="Mark as final" /> Mark as final (visible to Viewers)
                  </label>
                )}
              </>
            )}
            {errors[step] && <p className="text-xs text-sev-medium">{errors[step]}</p>}
          </CardContent>
        </Card>
      )}

      {step === 5 && model && (
        <div className="space-y-3">
          <Callout tone="demo">Preview of the demonstration report. The PDF export uses the same data.</Callout>
          <div className="rounded-lg bg-muted/40 p-3 sm:p-6"><ReportDocument model={model} /></div>
        </div>
      )}

      {step === 6 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-sm font-semibold">Step 7 · Generate & export</h2>
            {!created ? (
              <>
                <p className="text-sm text-muted-foreground">Generate the report to save it to report history, then download it as a PDF or print it.</p>
                <Button onClick={generate} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <FileCheck2 />} Generate demonstration report</Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm"><span className="font-mono">{created.code}</span> generated and saved to report history.</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => exportPdf(created)} disabled={exporting}>{exporting ? <Loader2 className="animate-spin" /> : <Download />} Download PDF</Button>
                  <Button variant="outline" asChild><Link to={`/reports/${created.id}`}><Printer /> Open report / print</Link></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!created && (
        <div className="no-print flex items-center justify-between">
          <Button variant="ghost" onClick={step === 0 ? onCancel : () => setStep(step - 1)}><ArrowLeft /> {step === 0 ? "Cancel" : "Back"}</Button>
          {step < 6 && <Button onClick={() => setStep(step + 1)} disabled={!!errors[step]}>Continue <ArrowRight /></Button>}
        </div>
      )}
    </div>
  );
}
