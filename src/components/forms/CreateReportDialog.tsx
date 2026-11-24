import * as React from "react";
import { useNavigate } from "react-router";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./fields";
import { ChoiceChips } from "./choices";
import { useReportSource } from "@/features/reports/useReport";
import { REPORT_TEMPLATES } from "@/lib/constants";
import { formatDate, nowISO, toInputDate } from "@/lib/format";
import { IS_API, analysisService, reportService } from "@/services";
import type { ReportSectionKey } from "@/types";

const toISO = (d: string) => new Date(`${d}T00:00:00Z`).toISOString();
const TYPE_LABEL: Record<string, string> = { technical: "Technical", executive: "Executive", remediation: "Fix progress" };

/**
 * One screen: pick the project and the kind of report, then create. Websites, dates and the summary
 * are filled in from the project; "Adjust" reveals them for the rare case they need changing.
 */
export function CreateReportDialog({ open, onOpenChange, initialProjectId }: { open: boolean; onOpenChange: (o: boolean) => void; initialProjectId?: string }) {
  const src = useReportSource();
  const navigate = useNavigate();
  const projects = src.projects.filter((p) => p.status !== "archived");
  const [projectId, setProjectId] = React.useState("");
  const [templateId, setTemplateId] = React.useState(src.settings.reports.defaultTemplate);
  const [title, setTitle] = React.useState("");
  const [targetIds, setTargetIds] = React.useState<string[]>([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [includeUnverified, setIncludeUnverified] = React.useState(src.settings.reports.includeUnverifiedAppendix);
  const [adjust, setAdjust] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Pick a project on open: the one asked for, else the one with the most confirmed findings.
  React.useEffect(() => {
    if (!open) return;
    const confirmedIn = (id: string) => src.findings.filter((f) => f.projectId === id && f.verificationStatus === "confirmed").length;
    const best = [...projects].sort((a, b) => confirmedIn(b.id) - confirmedIn(a.id))[0];
    setProjectId(initialProjectId && projects.some((p) => p.id === initialProjectId) ? initialProjectId : (best?.id ?? ""));
    setAdjust(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const project = projects.find((p) => p.id === projectId);
  const projectTargets = src.targets.filter((t) => t.projectId === projectId);

  // Defaults follow the project: all its websites, and a period that covers every finding.
  React.useEffect(() => {
    if (!project) return;
    setTargetIds(projectTargets.map((t) => t.id));
    const dates = src.findings.filter((f) => f.projectId === project.id).map((f) => f.discoveredAt).sort();
    const start = dates[0] && dates[0] < project.startDate ? dates[0] : project.startDate;
    const end = dates.at(-1) && dates.at(-1)!.slice(0, 10) > toInputDate(nowISO()) ? dates.at(-1)! : nowISO();
    setFrom(toInputDate(start));
    setTo(toInputDate(end));
    setTitle(/assessment$/i.test(project.name.trim()) ? `${project.name.trim()} Report` : `${project.name.trim()} Security Assessment`);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const inPeriod = (d: string) => (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to);
  const scoped = src.findings.filter((f) => targetIds.includes(f.targetId) && inPeriod(f.discoveredAt));
  const confirmed = scoped.filter((f) => f.verificationStatus === "confirmed");
  const unverified = scoped.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review");
  const template = REPORT_TEMPLATES.find((t) => t.id === templateId) ?? REPORT_TEMPLATES[0]!;

  const error = !project ? "Choose a project." : !targetIds.length ? "Choose at least one website." : !from || !to || from > to ? "Check the dates." : !title.trim() ? "Add a title." : null;

  const create = async () => {
    if (error || !project) return;
    setSaving(true);
    try {
      // Draft the executive summary from the findings so the report never starts blank.
      let summary = "";
      try {
        const a = await analysisService.analyze({ mode: "assessment_summary", project, evidence: [], projectFindings: scoped });
        summary = `${a.explanation}\n\n[${IS_API ? "Drafted by AI from the findings. Review before sharing." : "Drafted with Sample AI Analysis, Demo Mode. Review before sharing."}]`;
      } catch {
        /* the report can still be created; the summary section says none was provided */
      }
      const sections: ReportSectionKey[] = includeUnverified ? [...new Set([...template.sections, "unverified_observations" as ReportSectionKey])] : template.sections.filter((s) => s !== "unverified_observations");
      const r = await reportService.create({
        title: title.trim(),
        projectId,
        targetIds,
        templateId: template.id,
        periodStart: toISO(from),
        periodEnd: toISO(to),
        findingIds: confirmed.map((f) => f.id),
        includeUnverified,
        sections,
        executiveSummary: summary,
        status: "draft",
      });
      toast.success(`Created ${r.code}`);
      onOpenChange(false);
      navigate(`/reports/${r.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="size-4" /> Create report</DialogTitle>
          <DialogDescription>Built from the findings people confirmed. You can download it right after.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {projects.length > 1 && (
            <Field id="cr-project" label="Project">
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="cr-project"><SelectValue placeholder="Choose a project" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field id="cr-type" label="Type of report" hint={template.description}>
            <ChoiceChips label="Type of report" value={templateId} options={REPORT_TEMPLATES.map((t) => ({ value: t.id, label: TYPE_LABEL[t.id] ?? t.name }))} onChange={setTemplateId} />
          </Field>

          <section className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p>
                <span className="font-medium">{confirmed.length} confirmed finding{confirmed.length === 1 ? "" : "s"}</span>
                <span className="text-muted-foreground"> from {targetIds.length} website{targetIds.length === 1 ? "" : "s"}, {from ? formatDate(toISO(from)) : "…"} to {to ? formatDate(toISO(to)) : "…"}</span>
              </p>
              <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline" onClick={() => setAdjust((v) => !v)}>{adjust ? "Done" : "Adjust"}</button>
            </div>
            {confirmed.length === 0 && project && <p className="mt-1 text-xs text-muted-foreground">The report will state that no vulnerabilities were confirmed.</p>}
            {adjust && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <Input aria-label="Report title" value={title} onChange={(e) => setTitle(e.target.value)} />
                {projectTargets.length > 1 && (
                  <div className="space-y-1.5">
                    {projectTargets.map((t) => (
                      <label key={t.id} className="flex items-center gap-2.5 text-sm">
                        <Checkbox checked={targetIds.includes(t.id)} onCheckedChange={(v) => setTargetIds(v ? [...targetIds, t.id] : targetIds.filter((x) => x !== t.id))} />
                        {t.name}
                      </label>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
                  <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
                </div>
              </div>
            )}
          </section>

          {unverified.length > 0 && (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={includeUnverified} onCheckedChange={(v) => setIncludeUnverified(v === true)} />
              Add {unverified.length} unchecked finding{unverified.length === 1 ? "" : "s"} as an appendix
            </label>
          )}
          {error && project && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving || !!error}>
            {saving && <Loader2 className="animate-spin" />} {saving ? "Writing summary…" : "Create report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
