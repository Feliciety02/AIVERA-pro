import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Bot, Hand, Save, ShieldAlert } from "lucide-react";
import { ManualFindingDialog } from "@/components/forms/ManualFindingDialog";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard, Callout, KeyValue } from "@/components/shared/display";
import { NotFoundState, EmptyState } from "@/components/shared/states";
import { StatusBadge, ToneBadge, ToolBadge } from "@/components/security/badges";
import { FindingRow } from "@/components/dashboard/widgets";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { ASSESSMENT_STATUS, CATEGORY_BY_ID } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn, percent } from "@/lib/utils";
import { assessmentService } from "@/services";
import type { AssessmentCategoryId, AssessmentStatus, ChecklistItem, ChecklistResult } from "@/types";

const RESULTS: Record<ChecklistResult, { label: string; tone: string }> = {
  not_tested: { label: "Not tested", tone: "text-muted-foreground" },
  pass: { label: "Pass", tone: "text-primary" },
  fail: { label: "Fail — issue observed", tone: "text-sev-critical" },
  not_applicable: { label: "Not applicable", tone: "text-muted-foreground" },
};

function ChecklistRow({ item, assessmentId, readOnly, onRecord }: { item: ChecklistItem; assessmentId: string; readOnly: boolean; onRecord: (item: ChecklistItem) => void }) {
  const [obs, setObs] = React.useState(item.observation);
  const [ev, setEv] = React.useState(item.evidenceNote);
  React.useEffect(() => {
    setObs(item.observation);
    setEv(item.evidenceNote);
  }, [item.observation, item.evidenceNote]);
  const dirty = obs !== item.observation || ev !== item.evidenceNote;
  return (
    <li className="rounded-lg border border-border p-3.5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{item.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {item.kind === "automated" ? <ToneBadge tone="cyan"><Bot className="size-3" /> Automated</ToneBadge> : <ToneBadge tone="info"><Hand className="size-3" /> Manual</ToneBadge>}
            {item.tool && <ToolBadge tool={item.tool} />}
            {item.updatedAt && <span className="text-[10.5px] text-muted-foreground">updated {formatRelative(item.updatedAt)}</span>}
          </div>
        </div>
        <Select value={item.result} disabled={readOnly} onValueChange={(v) => { assessmentService.updateItem(assessmentId, item.id, { result: v as ChecklistResult }); toast.success("Checklist result saved"); }}>
          <SelectTrigger className={cn("h-8 w-full text-xs md:w-52", RESULTS[item.result].tone)} aria-label={`Result for ${item.title}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RESULTS) as ChecklistResult[]).map((r) => (
              <SelectItem key={r} value={r}>{RESULTS[r].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Textarea aria-label="Observation" placeholder="Observation (what you tested and what happened)" rows={2} value={obs} disabled={readOnly} onChange={(e) => setObs(e.target.value)} className="text-xs" />
        <Textarea aria-label="Evidence note" placeholder="Evidence reference (e.g. request ID, screenshot name, finding code)" rows={2} value={ev} disabled={readOnly} onChange={(e) => setEv(e.target.value)} className="text-xs" />
      </div>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {(item.result === "fail" || item.kind === "manual") && (
            <Button size="sm" variant={item.result === "fail" ? "subtle" : "ghost"} onClick={() => onRecord(item)}>
              <ShieldAlert /> Record finding
            </Button>
          )}
          {dirty && (
            <>
          <Button size="sm" variant="ghost" onClick={() => { setObs(item.observation); setEv(item.evidenceNote); }}>Discard</Button>
          <Button size="sm" onClick={() => { assessmentService.updateItem(assessmentId, item.id, { observation: obs, evidenceNote: ev }); toast.success("Observation saved"); }}>
            <Save /> Save notes
          </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function AssessmentDetailPage() {
  const { categoryId } = useParams();
  const [params] = useSearchParams();
  const user = useCurrentUser();
  const readOnly = !can(user?.role, "verify_findings");
  const lookups = useLookups();
  const meta = CATEGORY_BY_ID[categoryId as AssessmentCategoryId];
  useDocumentTitle(meta?.name ?? "Assessment");
  const { projects, assessments, findings } = useDataStore(useShallow((s) => ({ projects: s.projects, assessments: s.assessments, findings: s.findings })));
  const projectId = params.get("project") ?? projects.find((p) => p.status !== "archived")?.id ?? "";
  const project = lookups.projects[projectId];
  const assessment = assessments.find((a) => a.projectId === projectId && a.category === categoryId);
  const [recordFor, setRecordFor] = React.useState<ChecklistItem | null>(null);

  if (!meta || !project)
    return (
      <ContentContainer>
        <NotFoundState entity="Assessment category" backTo="/assessments" backLabel="Back to assessments" />
      </ContentContainer>
    );

  const related = findings.filter((f) => f.projectId === projectId && f.category === meta.id);
  const assessors = Object.values(lookups.users).filter((u) => u.role !== "viewer");

  return (
    <ContentContainer>
      <PageHeader
        eyebrow={<><Link to={`/projects/${project.id}`} className="font-mono hover:text-foreground">{project.code}</Link><span>·</span><span>{meta.owasp}</span></>}
        title={meta.name}
        description={meta.description}
        meta={assessment ? <StatusBadge status={assessment.status} map={ASSESSMENT_STATUS} /> : <ToneBadge tone="muted">Not started</ToneBadge>}
      />
      {!assessment ? (
        <EmptyState
          title="This category assessment has not been started"
          description={readOnly ? "Your demo role cannot start assessments." : "Start the guided checklist to document automated results and manual testing for this category."}
          action={!readOnly && <Button size="sm" onClick={() => { assessmentService.ensure(project.id, meta.id); toast.success("Assessment started"); }}>Start guided checklist</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {(["automated", "manual"] as const).map((kind) => {
              const items = assessment.checklist.filter((i) => i.kind === kind);
              if (!items.length) return null;
              return (
                <SectionCard key={kind} title={kind === "automated" ? "Automated checks" : "Manual testing"} icon={kind === "automated" ? Bot : Hand} description={kind === "automated" ? "Tool-backed checks. In this phase, record results from imported or simulated output." : "Performed by the assessor within the authorized scope. Document observations and evidence."}>
                  <ul className="space-y-3">
                    {items.map((i) => <ChecklistRow key={i.id} item={i} assessmentId={assessment.id} readOnly={readOnly} onRecord={setRecordFor} />)}
                  </ul>
                </SectionCard>
              );
            })}
          </div>
          <div className="space-y-4">
            <SectionCard title="Assessment details">
              <dl className="space-y-4">
                <KeyValue label="Status">
                  <Select value={assessment.status} disabled={readOnly} onValueChange={(v) => { assessmentService.update(assessment.id, { status: v as AssessmentStatus }); toast.success("Status updated"); }}>
                    <SelectTrigger className="h-8 text-xs" aria-label="Assessment status"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(ASSESSMENT_STATUS) as AssessmentStatus[]).map((s) => <SelectItem key={s} value={s}>{ASSESSMENT_STATUS[s].label}</SelectItem>)}</SelectContent>
                  </Select>
                </KeyValue>
                <KeyValue label="Assigned assessor">
                  <Select value={assessment.assessorId} disabled={readOnly} onValueChange={(v) => { assessmentService.update(assessment.id, { assessorId: v }); toast.success("Assessor updated"); }}>
                    <SelectTrigger className="h-8 text-xs" aria-label="Assigned assessor"><SelectValue /></SelectTrigger>
                    <SelectContent>{assessors.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </KeyValue>
                <KeyValue label="Progress">
                  {(() => {
                    const done = assessment.checklist.filter((c) => c.result !== "not_tested").length;
                    return (
                      <>
                        <Progress value={percent(done, assessment.checklist.length)} />
                        <span className="mt-1 block text-[11px] text-muted-foreground">{done}/{assessment.checklist.length} recorded · {assessment.checklist.filter((c) => c.result === "fail").length} issues observed</span>
                      </>
                    );
                  })()}
                </KeyValue>
                <KeyValue label="Scope">{meta.scope}</KeyValue>
                <KeyValue label="Related tools"><span className="flex flex-wrap gap-1">{meta.tools.length ? meta.tools.map((t) => <ToolBadge key={t} tool={t} />) : <ToolBadge tool="manual" />}</span></KeyValue>
                <KeyValue label="Last updated">{formatRelative(assessment.updatedAt)}</KeyValue>
              </dl>
            </SectionCard>
            <SectionCard title={`Related findings (${related.length})`}>
              {related.length ? <div className="-mx-2">{related.map((f) => <FindingRow key={f.id} finding={f} target={lookups.targets[f.targetId]?.name} />)}</div> : <p className="text-xs text-muted-foreground">No findings in this category yet.</p>}
            </SectionCard>
            <Callout>A failed checklist item does not create a finding automatically. Use <strong>Record finding</strong> on the item to document it with evidence; it then enters the verification queue as Pending Verification.</Callout>
          </div>
        </div>
      )}
      {assessment && <ManualFindingDialog open={!!recordFor} onOpenChange={(o) => !o && setRecordFor(null)} defaults={{ projectId: project.id, category: meta.id, title: recordFor?.title, checklistRef: recordFor ? { assessmentId: assessment.id, itemId: recordFor.id } : undefined }} />}
    </ContentContainer>
  );
}
