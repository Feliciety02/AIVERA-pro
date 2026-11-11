import * as React from "react";
import { Link, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { AlarmClock, ArrowRight, Pencil, CircleCheck, ClipboardCheck, FlaskConical, Loader2, Play, Plus, RotateCcw, ShieldCheck, ShieldOff, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Progress, Tabs, TabsContent, TabsList, TabsTrigger, Hint } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { Callout, KeyValue, MiniStat, SectionCard, UserChip } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { SeverityBadge, StatusBadge, ToneBadge, OriginBadge } from "@/components/security/badges";
import { RemediationForm } from "@/components/forms/RemediationForm";
import { RemediationEditDialog } from "@/components/forms/RemediationEditDialog";
import { ChartCard, StackedBars } from "@/components/charts/charts";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { REMEDIATION_STATUS, SEVERITIES, SEVERITY_META, VERIFICATION_STATUS } from "@/lib/constants";
import { daysUntil, formatDate, formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn, percent } from "@/lib/utils";
import { remediationService } from "@/services";
import type { RemediationStatus, RemediationTask, VulnerabilityFinding } from "@/types";

const ORDER: RemediationStatus[] = ["open", "in_progress", "awaiting_retest", "resolved", "accepted_risk"];
const isClosed = (s: RemediationStatus) => s === "resolved" || s === "accepted_risk";

function DueBadge({ task }: { task: RemediationTask }) {
  const d = daysUntil(task.dueDate);
  if (isClosed(task.status) || d === null) return <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>;
  if (d < 0) return <ToneBadge tone="danger"><AlarmClock className="size-3" /> Overdue {Math.abs(d)}d</ToneBadge>;
  if (d <= 7) return <ToneBadge tone="warning">Due in {d}d</ToneBadge>;
  return <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>;
}

type Action = { kind: "status"; to: RemediationStatus; title: string; description: string; requireNote: boolean } | { kind: "retest"; result: "passed" | "failed" };

function TaskDetail({ task, finding, canEdit }: { task: RemediationTask; finding?: VulnerabilityFinding; canEdit: boolean }) {
  const lookups = useLookups();
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
  const canResolve = !task.retestRequired || task.retestResult === "passed";
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
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={task.status} map={REMEDIATION_STATUS} />
        <SeverityBadge severity={task.priority} />
        <DueBadge task={task} />
        {task.retestRequired ? <ToneBadge tone="info">Retest required · {task.retestResult}</ToneBadge> : <ToneBadge tone="muted">No retest required</ToneBadge>}
      </div>
      <p className="text-sm text-foreground/85">{task.description}</p>

      {canEdit && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Workflow actions</p>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditOpen(true)}><Pencil /> Edit details</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {task.status === "open" && <Button size="sm" onClick={() => open({ kind: "status", to: "in_progress", title: "Start work", description: "Mark the fix as in progress.", requireNote: false })}><Play /> Start work</Button>}
            {task.status === "in_progress" && task.retestRequired && <Button size="sm" onClick={() => open({ kind: "status", to: "awaiting_retest", title: "Request retest", description: "The owner reports the fix is deployed. An assessor must retest manually.", requireNote: true })}><ClipboardCheck /> Request retest</Button>}
            {task.status === "awaiting_retest" && (
              <>
                <Button size="sm" variant="outline" onClick={() => open({ kind: "retest", result: "passed" })}><CircleCheck /> Record retest passed</Button>
                <Button size="sm" variant="outline" onClick={() => open({ kind: "retest", result: "failed" })}><XCircle /> Record retest failed</Button>
              </>
            )}
            {!isClosed(task.status) && (task.status === "awaiting_retest" || (task.status === "in_progress" && !task.retestRequired)) && (
              <Hint label={canResolve ? "Requires your manual approval." : "A passed retest is required before resolving."}>
                <span tabIndex={0}>
                  <Button size="sm" disabled={!canResolve} onClick={() => open({ kind: "status", to: "resolved", title: "Approve & resolve", description: "You are manually approving that this fix is complete and verified. An AI recommendation alone is never sufficient.", requireNote: true })}>
                    <ShieldCheck /> Approve & resolve
                  </Button>
                </span>
              </Hint>
            )}
            {!isClosed(task.status) && <Button size="sm" variant="ghost" onClick={() => open({ kind: "status", to: "accepted_risk", title: "Accept risk", description: "Record that the system owner accepts this risk without a fix. A justification is required.", requireNote: true })}><ShieldOff /> Accept risk</Button>}
            {isClosed(task.status) && <Button size="sm" variant="outline" onClick={() => open({ kind: "status", to: "open", title: "Reopen task", description: "Reopen this task (e.g. regression observed).", requireNote: true })}><RotateCcw /> Reopen</Button>}
          </div>
        </div>
      )}

      <section>
        <p className="mb-1.5 text-xs font-semibold">Remediation recommendation</p>
        <p className="rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">{task.recommendation}</p>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold">Before / after assessment</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-sev-critical/25 bg-sev-critical/[0.04] p-3">
            <p className="mb-1 text-[10.5px] font-semibold text-sev-critical">Before</p>
            <p>{finding ? VERIFICATION_STATUS[finding.verificationStatus].label : "—"} · {finding && SEVERITY_META[finding.severity].label}</p>
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
        <KeyValue label="Related finding">{finding ? <Link className="font-mono text-xs hover:text-primary" to={`/findings/${finding.id}`}>{finding.code}</Link> : "—"}</KeyValue>
        <KeyValue label="Created">{formatDate(task.createdAt)}</KeyValue>
        <KeyValue label="Due">{formatDate(task.dueDate)}</KeyValue>
      </dl>

      <section>
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
            <DialogDescription>{action?.kind === "status" ? action.description : "Describe how you retested within the authorized scope. In this demo, no traffic is sent — this records your manual result."}</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes / justification" aria-label="Notes" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button onClick={run} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RemediationEditDialog task={task} open={editOpen} onOpenChange={setEditOpen} />
    </SheetBody>
  );
}

export default function RemediationPage() {
  useDocumentTitle("Remediation Tracking");
  const loading = useInitialLoading();
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
  const bySeverity = SEVERITIES.map((s) => ({ name: SEVERITY_META[s].label, open: tasks.filter((t) => t.priority === s && !isClosed(t.status)).length, closed: tasks.filter((t) => t.priority === s && isClosed(t.status)).length }));
  const byOwner = Object.values(lookups.users).map((u) => ({ name: u.name.split(" ")[0]!, open: tasks.filter((t) => t.ownerId === u.id && !isClosed(t.status)).length, closed: tasks.filter((t) => t.ownerId === u.id && isClosed(t.status)).length })).filter((r) => r.open + r.closed > 0);

  const openTask = (id: string | null) => {
    const n = new URLSearchParams(params);
    if (id) n.set("task", id);
    else n.delete("task");
    setParams(n, { replace: true });
  };

  const columns: ColumnDef<RemediationTask, unknown>[] = [
    { accessorKey: "code", header: "Task", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "title", header: "Title", cell: ({ row }) => <div className="min-w-56"><p className="truncate font-medium">{row.original.title}</p><p className="font-mono text-[11px] text-muted-foreground">{findingById[row.original.findingId]?.code}</p></div> },
    { id: "priority", header: "Severity", accessorFn: (t) => SEVERITY_META[t.priority].rank, cell: ({ row }) => <SeverityBadge severity={row.original.priority} /> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} map={REMEDIATION_STATUS} /> },
    { id: "owner", header: "Owner", accessorFn: (t) => lookups.users[t.ownerId]?.name ?? "", cell: ({ row }) => <UserChip user={lookups.users[row.original.ownerId]} /> },
    { accessorKey: "dueDate", header: "Due", cell: ({ row }) => <DueBadge task={row.original} /> },
    { id: "retest", header: "Retest", accessorFn: (t) => t.retestResult, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.retestRequired ? row.original.retestResult : "n/a"}</span> },
  ];

  return (
    <ContentContainer wide>
      <PageHeader
        title="Remediation Tracking"
        description="Turn confirmed vulnerabilities into owned, dated fixes — resolved only through manual approval and, where required, a passed retest."
        actions={canEdit && <Button size="sm" onClick={() => setPickOpen(true)}><Plus /> New task</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat label="Total tasks" value={tasks.length} />
        <MiniStat label="Open / in progress" value={tasks.filter((t) => t.status === "open" || t.status === "in_progress").length} tone="text-sev-medium" />
        <MiniStat label="Awaiting retest" value={tasks.filter((t) => t.status === "awaiting_retest").length} tone="text-sev-low" />
        <MiniStat label="Overdue" value={overdue} tone={overdue ? "text-sev-critical" : undefined} />
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Progress</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{percent(closed, tasks.length)}%</p>
          <Progress value={percent(closed, tasks.length)} className="mt-1" />
        </div>
      </div>
      <Callout icon={FlaskConical} tone="demo">A task never becomes “Resolved” because an AI recommended a fix. Resolution requires an assessor's manual approval, and a passed manual retest when retesting is required.</Callout>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <FilterBar active={status !== ALL || sev !== ALL || owner !== ALL || overdueOnly || !!q} onReset={() => { setStatus(ALL); setSev(ALL); setOwner(ALL); setOverdueOnly(false); setQ(""); }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search tasks" />
          <FilterSelect label="Statuses" value={status} onChange={setStatus} options={ORDER.map((s) => ({ value: s, label: REMEDIATION_STATUS[s].label }))} />
          <FilterSelect label="Severities" value={sev} onChange={setSev} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label }))} />
          <FilterSelect label="Owners" value={owner} onChange={setOwner} options={Object.values(lookups.users).map((u) => ({ value: u.id, label: u.name }))} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="accent-[var(--primary)]" /> Overdue only
          </label>
        </FilterBar>
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board by status</TabsTrigger>
          <TabsTrigger value="list">Task list</TabsTrigger>
          <TabsTrigger value="insights">By severity & owner</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
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
                      <button key={t.id} type="button" onClick={() => openTask(t.id)} className="w-full rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
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
        </TabsContent>
        <TabsContent value="list">
          <Card>
            <DataTable data={rows} columns={columns} getRowId={(t) => t.id} loading={loading} onRowClick={(t) => openTask(t.id)} initialSorting={[{ id: "dueDate", desc: false }]} caption="Remediation tasks" empty={<EmptyState icon={Wrench} title="No remediation tasks" description="Create tasks from confirmed findings." />} />
          </Card>
        </TabsContent>
        <TabsContent value="insights" className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Tasks by severity" summary={bySeverity.map((r) => `${r.name}: ${r.open} open, ${r.closed} closed`).join("; ")}>
            <StackedBars data={bySeverity} xKey="name" series={[{ key: "open", name: "Open", color: "var(--sev-medium)", stack: "a" }, { key: "closed", name: "Closed", color: "var(--primary)", stack: "a" }]} />
          </ChartCard>
          <ChartCard title="Tasks by assigned owner" summary={byOwner.map((r) => `${r.name}: ${r.open} open, ${r.closed} closed`).join("; ")}>
            <StackedBars data={byOwner} xKey="name" series={[{ key: "open", name: "Open", color: "var(--sev-medium)", stack: "a" }, { key: "closed", name: "Closed", color: "var(--primary)", stack: "a" }]} />
          </ChartCard>
        </TabsContent>
        <TabsContent value="timeline">
          <SectionCard title="Due-date timeline" description="Tasks ordered by due date">
            <ol className="space-y-2">
              {[...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/50">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatDate(t.dueDate)}</span>
                    <span className={cn("size-2.5 shrink-0 rounded-full", isClosed(t.status) ? "bg-primary" : (daysUntil(t.dueDate) ?? 0) < 0 ? "bg-sev-critical" : "bg-sev-medium")} />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <StatusBadge status={t.status} map={REMEDIATION_STATUS} />
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ol>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Sheet open={!!selected} onOpenChange={(o) => !o && openTask(null)}>
        <SheetContent className="sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription className="font-mono">{selected.code}</SheetDescription>
              </SheetHeader>
              <TaskDetail task={selected} finding={findingById[selected.findingId]} canEdit={canEdit} />
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
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
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
