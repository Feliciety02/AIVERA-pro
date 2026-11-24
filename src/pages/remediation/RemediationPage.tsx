import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { Link, useSearchParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { AlarmClock,  Pencil, CircleCheck, ClipboardCheck,  Loader2, Play, Plus, RotateCcw, ShieldCheck, ShieldOff,  XCircle } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { NoteChips } from "@/components/forms/choices";
import { Progress } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import {  KeyValue,  UserChip } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { SeverityBadge, StatusBadge, ToneBadge, OriginBadge } from "@/components/security/badges";
import { RemediationForm } from "@/components/forms/RemediationForm";
import { RemediationEditDialog } from "@/components/forms/RemediationEditDialog";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle,  useLookups } from "@/hooks";
import { REMEDIATION_STATUS, SEVERITIES, SEVERITY_META, VERIFICATION_STATUS } from "@/lib/constants";
import { daysUntil, formatDate, formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn, percent } from "@/lib/utils";
import { remediationService } from "@/services";
import type { RemediationStatus, RemediationTask, VulnerabilityFinding } from "@/types";

const ORDER: RemediationStatus[] = ["open", "in_progress", "awaiting_retest", "pending_approval", "resolved", "accepted_risk"];
const isClosed = (s: RemediationStatus) => s === "resolved" || s === "accepted_risk";

function DueBadge({ task }: { task: RemediationTask }) {
  const d = daysUntil(task.dueDate);
  if (isClosed(task.status) || d === null) return <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>;
  if (d < 0) return <ToneBadge tone="danger"><AlarmClock className="size-3" /> Overdue {Math.abs(d)}d</ToneBadge>;
  if (d <= 7) return <ToneBadge tone="warning">Due in {d}d</ToneBadge>;
  return <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>;
}

/** Ready-made notes per action, so most decisions are one tap. They describe the choice; they never claim a test that did not happen. */
const noteOptions = (a: Action | null): string[] => {
  if (!a) return [];
  if (a.kind === "retest") return a.result === "passed" ? ["Retested in scope; the issue no longer reproduces.", "Retested with the original steps; fixed."] : ["Retested in scope; the issue still reproduces.", "Partly fixed; one path still works."];
  switch (a.to) {
    case "resolved": return ["Fix checked and retest passed.", "Fix confirmed by code review and retest."];
    case "in_progress": return a.title === "Send back" ? ["Retest still fails; please fix again.", "Fix incomplete; see retest notes."] : ["Started work on the fix."];
    case "accepted_risk": return ["Owner accepts the risk; low impact.", "Compensating control in place.", "Fix planned in a later release."];
    case "awaiting_retest": return ["Fix deployed to the test environment; ready for retest.", "Code changed and merged; please retest."];
    case "pending_approval": return ["Fix deployed and checked by the developer.", "Configuration changed; please approve."];
    case "open": return ["Issue came back after the fix."];
    default: return [];
  }
};

type Action = { kind: "status"; to: RemediationStatus; title: string; description: string; requireNote: boolean } | { kind: "retest"; result: "passed" | "failed" };

function TaskDetail({ task, finding }: { task: RemediationTask; finding?: VulnerabilityFinding }) {
  const lookups = useLookups();
  const user = useCurrentUser();
  // Who may do what with this fix (the server checks the same rules).
  const isOwner = task.ownerId === user?.id;
  const canManage = can(user?.role, "manage_remediation");
  const canWork = isOwner || canManage;
  const canRetest = canManage && !isOwner;
  const canApprove = can(user?.role, "approve_remediation") && !isOwner;
  const evidence = useDataStore((s) => s.evidence);
  // `action` is kept after closing so the dialog text doesn't change during its exit animation.
  const [action, setActionState] = React.useState<Action | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const setAction = (a: Action | null) => {
    if (a) setActionState(a);
    setDialogOpen(!!a);
  };
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  const run = async () => {
    if (!action || !dialogOpen) return;
    if ((action.kind === "retest" || action.requireNote) && note.trim().length < 5) return toast.error("Add a note (min. 5 characters).");
    setBusy(true);
    try {
      if (action.kind === "status") await remediationService.setStatus(task.id, action.to, note.trim());
      else await remediationService.recordRetest(task.id, action.result, note.trim());
      toast.success(action.kind === "status" ? `${task.code} → ${REMEDIATION_STATUS[action.to].label}` : `Retest ${action.result} recorded`);
      setAction(null);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = (a: Action) => {
    setNote("");
    setAction(a);
  };

  const findingEvidence = finding ? evidence.filter((e) => e.findingId === finding.id) : [];

  return (
    <SheetBody className="space-y-5">
      <DialogGuide guideKey="remediationTask" steps={DIALOG_GUIDES.remediationTask} inSheet />
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={task.status} map={REMEDIATION_STATUS} />
        <SeverityBadge severity={task.priority} />
        <DueBadge task={task} />
        {task.retestRequired ? <ToneBadge tone="info">Retest required · {task.retestResult}</ToneBadge> : <ToneBadge tone="muted">No retest required</ToneBadge>}
      </div>
      <p className="text-sm text-foreground/85">{task.description}</p>

      {(canWork || canApprove) && (
        <div className="space-y-2 rounded-xl border border-border p-3" data-guide="rem-actions">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">{isOwner ? "Your fix" : "Workflow actions"}</p>
            {canManage && !isClosed(task.status) && <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditOpen(true)}><Pencil /> Edit details</Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canWork && task.status === "open" && <Button size="sm" onClick={() => open({ kind: "status", to: "in_progress", title: "Start work", description: "Mark the fix as in progress.", requireNote: false })}><Play /> Start work</Button>}
            {canWork && task.status === "in_progress" && (task.retestRequired
              ? <Button size="sm" onClick={() => open({ kind: "status", to: "awaiting_retest", title: "Ready for retest", description: "Say what you changed and where it is deployed. The assessor who confirmed the finding is asked to retest it.", requireNote: true })}><ClipboardCheck /> Ready for retest</Button>
              : <Button size="sm" onClick={() => open({ kind: "status", to: "pending_approval", title: "Send for approval", description: "Say what you changed. A Security Lead approves closing the fix.", requireNote: true })}><ClipboardCheck /> Send for approval</Button>)}
            {task.status === "awaiting_retest" && (canRetest ? (
              <>
                <Button size="sm" variant="success-outline" onClick={() => open({ kind: "retest", result: "passed" })}><CircleCheck /> Retest passed</Button>
                <Button size="sm" variant="destructive-outline" onClick={() => open({ kind: "retest", result: "failed" })}><XCircle /> Retest failed</Button>
              </>
            ) : <p className="text-xs text-muted-foreground">Waiting for {lookups.users[task.retestAssigneeId ?? ""]?.name ?? "an assessor"} to retest.</p>)}
            {task.status === "pending_approval" && (canApprove ? (
              <>
                <Button size="sm" variant="success" onClick={() => open({ kind: "status", to: "resolved", title: "Approve and close", description: "You are approving that this fix is complete and checked. An AI recommendation alone is never enough.", requireNote: true })}><ShieldCheck /> Approve and close</Button>
                <Button size="sm" variant="warning-outline" onClick={() => open({ kind: "status", to: "in_progress", title: "Send back", description: "Return the fix to its owner with what still needs doing.", requireNote: true })}><RotateCcw /> Send back</Button>
              </>
            ) : <p className="text-xs text-muted-foreground">Waiting for a Security Lead to approve closing it.</p>)}
            {canApprove && !isClosed(task.status) && <Button size="sm" variant="warning-outline" onClick={() => open({ kind: "status", to: "accepted_risk", title: "Accept risk", description: "Record that the system owner accepts this risk without a fix. A justification is required.", requireNote: true })}><ShieldOff /> Accept risk</Button>}
            {canApprove && isClosed(task.status) && <Button size="sm" variant="outline" onClick={() => open({ kind: "status", to: "open", title: "Reopen task", description: "Reopen this task (for example, the issue came back).", requireNote: true })}><RotateCcw /> Reopen</Button>}
          </div>
        </div>
      )}

      <section data-guide="rem-recommendation">
        <p className="mb-1.5 text-xs font-semibold">Remediation recommendation</p>
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed">{task.recommendation}</p>
      </section>

      <section data-guide="rem-before-after">
        <p className="mb-2 text-xs font-semibold">Before / after assessment</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-sev-critical/25 bg-sev-critical/[0.04] p-3">
            <p className="mb-1 text-[10.5px] font-semibold text-sev-critical">Before</p>
            <p>{finding ? VERIFICATION_STATUS[finding.verificationStatus].label : "N/A"} · {finding && SEVERITY_META[finding.severity].label}</p>
            <p className="mt-1 text-muted-foreground">{findingEvidence.length} evidence item(s) at discovery ({finding && formatDate(finding.discoveredAt)})</p>
          </div>
          <div className={cn("rounded-md border p-3", task.retestResult === "passed" ? "border-primary/30 bg-primary/[0.05]" : task.retestResult === "failed" ? "border-sev-critical/25" : "border-border")}>
            <p className="mb-1 text-[10.5px] font-semibold text-muted-foreground">After (retest)</p>
            <p>{task.retestResult === "passed" ? "Issue no longer reproduced" : task.retestResult === "failed" ? "Issue still reproduced" : task.retestResult === "not_required" ? "Retest not required" : "Retest pending"}</p>
            {task.approvedBy && <p className="mt-1 text-muted-foreground">Approved by {lookups.users[task.approvedBy]?.name} · {formatDate(task.approvedAt)}</p>}
          </div>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-4">
        <KeyValue label="Owner"><UserChip user={lookups.users[task.ownerId]} /></KeyValue>
        {task.retestAssigneeId && <KeyValue label="Retest by"><UserChip user={lookups.users[task.retestAssigneeId]} /></KeyValue>}
        <KeyValue label="Related finding">{finding ? <Link className="font-mono text-xs hover:text-primary" to={`/findings/${finding.id}`}>{finding.code}</Link> : "N/A"}</KeyValue>
        <KeyValue label="Created">{formatDate(task.createdAt)}</KeyValue>
        <KeyValue label="Due">{formatDate(task.dueDate)}</KeyValue>
      </dl>

      <section data-guide="rem-timeline">
        <p className="mb-2 text-xs font-semibold">Timeline</p>
        <ol className="relative space-y-3 border-l border-border pl-4">
          {[...task.history].reverse().map((h, i) => (
            <li key={i} className="relative">
              <span className="absolute top-1 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" />
              <p className="text-xs"><span className="font-medium">{REMEDIATION_STATUS[h.to].label}</span> <span className="text-muted-foreground">by {lookups.users[h.by]?.name ?? h.by}</span></p>
              <p className="text-[11px] text-muted-foreground">{h.note}</p>
              <p className="text-[10px] text-muted-foreground/70">{formatDateTime(h.at)}</p>
            </li>
          ))}
        </ol>
      </section>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.kind === "status" ? action.title : `Record manual retest: ${action?.kind === "retest" ? action.result : ""}`}</DialogTitle>
            <DialogDescription>{action?.kind === "status" ? action.description : "Describe how you retested within the authorized scope. In this demo, no traffic is sent, this records your manual result."}</DialogDescription>
          </DialogHeader>
          <NoteChips options={noteOptions(action)} value={note} onPick={setNote} />
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Or write your own note" aria-label="Notes" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button
              variant={action?.kind === "retest" ? (action.result === "passed" ? "success" : "destructive") : action?.to === "resolved" ? "success" : (action?.to === "in_progress" && action.title === "Send back") || action?.to === "accepted_risk" ? "warning" : "default"}
              onClick={run}
              disabled={busy}
            >
              {busy && <Loader2 className="animate-spin" />} {action?.kind === "status" ? action.title : action?.kind === "retest" ? `Save: retest ${action.result}` : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RemediationEditDialog task={task} open={editOpen} onOpenChange={setEditOpen} />
    </SheetBody>
  );
}

export default function RemediationPage() {
  useDocumentTitle("Fixes");
  const user = useCurrentUser();
  const canEdit = can(user?.role, "manage_remediation");
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const { tasks, findings } = useDataStore(useShallow((s) => ({ tasks: s.remediation, findings: s.findings })));
  const findingById = React.useMemo(() => Object.fromEntries(findings.map((f) => [f.id, f])), [findings]);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(ALL);
  const [sev, setSev] = React.useState(ALL);
  const [owner, setOwner] = React.useState(ALL);
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [pickOpen, setPickOpen] = React.useState(false);
  const [formFinding, setFormFinding] = React.useState<VulnerabilityFinding | null>(null);
  const selectedId = params.get("task");
  const selected = tasks.find((t) => t.id === selectedId);

  const rows = React.useMemo(
    () =>
      tasks.filter((t) => {
        const d = daysUntil(t.dueDate);
        return (
          (status === ALL || t.status === status) &&
          (sev === ALL || t.priority === sev) &&
          (owner === ALL || t.ownerId === owner) &&
          (!overdueOnly || (!isClosed(t.status) && d !== null && d < 0)) &&
          (!q || [t.title, t.code].some((x) => x.toLowerCase().includes(q.toLowerCase())))
        );
      }),
    [tasks, status, sev, owner, overdueOnly, q],
  );

  const overdue = tasks.filter((t) => !isClosed(t.status) && (daysUntil(t.dueDate) ?? 0) < 0).length;
  const closed = tasks.filter((t) => isClosed(t.status)).length;
  const eligible = findings.filter((f) => f.verificationStatus === "confirmed" && !tasks.some((t) => t.findingId === f.id && !isClosed(t.status)));

  const openTask = (id: string | null) => {
    const n = new URLSearchParams(params);
    if (id) n.set("task", id);
    else n.delete("task");
    setParams(n, { replace: true });
  };


  return (
    <ContentContainer wide>
      <PageHeader
        title="Fixes"
        actions={canEdit && <Button size="sm" onClick={() => setPickOpen(true)}><Plus /> New task</Button>}
      />
      {/* One line instead of six counters. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span><span className="font-semibold tabular-nums">{tasks.length - closed}</span> open</span>
        <span className={cn(overdue > 0 && "text-sev-critical")}><span className="font-semibold tabular-nums">{overdue}</span> overdue</span>
        <span className="flex min-w-40 flex-1 items-center gap-3">
          <Progress value={percent(closed, tasks.length)} className="flex-1" />
          <span className="font-semibold tabular-nums text-primary">{percent(closed, tasks.length)}% closed</span>
        </span>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <FilterBar active={sev !== ALL || owner !== ALL || overdueOnly || !!q} onReset={() => { setStatus(ALL); setSev(ALL); setOwner(ALL); setOverdueOnly(false); setQ(""); }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search tasks" />
          <FilterSelect label="Severities" value={sev} onChange={setSev} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label }))} />
          <FilterSelect label="Owners" value={owner} onChange={setOwner} options={Object.values(lookups.users).map((u) => ({ value: u.id, label: u.name }))} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="accent-[var(--primary)]" /> Overdue only
          </label>
        </FilterBar>
      </div>

      {/* The board is the whole page: one column per step, click a card to work on it. */}
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {ORDER.map((s) => {
              const col = rows.filter((t) => t.status === s);
              return (
                <div key={s} className="flex min-h-40 flex-col rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <StatusBadge status={s} map={REMEDIATION_STATUS} />
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">{col.length}</span>
                  </div>
                  <div className="flex-1 space-y-2 p-2">
                    {col.length === 0 && <p className="py-6 text-center text-[11px] text-muted-foreground">No tasks</p>}
                    {col.map((t) => (
                      <button key={t.id} type="button" onClick={() => openTask(t.id)} className="w-full rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10.5px] text-muted-foreground">{t.code}</span>
                          <SeverityBadge severity={t.priority} />
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs font-medium">{t.title}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-muted-foreground">{lookups.users[t.ownerId]?.name}</span>
                          <DueBadge task={t} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && openTask(null)}>
        <SheetContent className="sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription className="font-mono">{selected.code}</SheetDescription>
              </SheetHeader>
              <TaskDetail task={selected} finding={findingById[selected.findingId]} />
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create remediation task</DialogTitle>
            <DialogDescription>Choose a confirmed finding without an open task.</DialogDescription>
          </DialogHeader>
          {eligible.length === 0 ? (
            <EmptyState compact title="No eligible findings" description="Confirm a finding first, or close its existing task." />
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {eligible.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => { setPickOpen(false); setFormFinding(f); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50">
                    <SeverityBadge severity={f.severity} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{f.title}</span><span className="font-mono text-[11px] text-muted-foreground">{f.code} · {lookups.targets[f.targetId]?.name}</span></span>
                    <OriginBadge origin={f.dataOrigin} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      {formFinding && <RemediationForm finding={formFinding} open={!!formFinding} onOpenChange={(o) => !o && setFormFinding(null)} onCreated={(id) => openTask(id)} />}
    </ContentContainer>
  );
}
