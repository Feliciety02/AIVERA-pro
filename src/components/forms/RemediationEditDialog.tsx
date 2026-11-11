import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./fields";
import { useDataStore } from "@/stores/dataStore";
import { SEVERITIES, SEVERITY_META } from "@/lib/constants";
import { toInputDate } from "@/lib/format";
import { remediationService } from "@/services";
import type { RemediationTask, Severity } from "@/types";

/** Edits task details. Status changes stay in the workflow actions so they keep their approval rules. */
export function RemediationEditDialog({ task, open, onOpenChange }: { task: RemediationTask; open: boolean; onOpenChange: (o: boolean) => void }) {
  const users = useDataStore((s) => s.users);
  const [draft, setDraft] = React.useState({ title: task.title, description: task.description, recommendation: task.recommendation, ownerId: task.ownerId, priority: task.priority, dueDate: toInputDate(task.dueDate), retestRequired: task.retestRequired });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft({ title: task.title, description: task.description, recommendation: task.recommendation, ownerId: task.ownerId, priority: task.priority, dueDate: toInputDate(task.dueDate), retestRequired: task.retestRequired });
      setErr(null);
    }
  }, [open, task]);

  const closedTask = task.status === "resolved" || task.status === "accepted_risk";

  const save = async () => {
    if (draft.title.trim().length < 5) return setErr("Title must be at least 5 characters.");
    if (draft.description.trim().length < 5) return setErr("Description is required.");
    if (!draft.dueDate) return setErr("Due date is required.");
    setBusy(true);
    await remediationService.update(task.id, { ...draft, title: draft.title.trim(), description: draft.description.trim(), recommendation: draft.recommendation.trim(), dueDate: new Date(`${draft.dueDate}T00:00:00Z`).toISOString() });
    setBusy(false);
    toast.success(`${task.code} updated`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {task.code}</DialogTitle>
          <DialogDescription>Status changes are made with the workflow actions so approval and retest rules always apply.</DialogDescription>
        </DialogHeader>
        <DialogGuide guideKey="remediationEdit" steps={DIALOG_GUIDES.remediationEdit} />
        <div className="grid gap-4">
          <Field id="re-title" label="Title" required><Input id="re-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field id="re-desc" label="Description" required><Textarea id="re-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field id="re-rec" label="Recommendation"><Textarea id="re-rec" rows={3} value={draft.recommendation} onChange={(e) => setDraft({ ...draft, recommendation: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="re-owner" label="Owner">
              <Select value={draft.ownerId} onValueChange={(v) => setDraft({ ...draft, ownerId: v })}>
                <SelectTrigger id="re-owner"><SelectValue /></SelectTrigger>
                <SelectContent>{users.filter((u) => u.status === "active").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id="re-pri" label="Priority">
              <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as Severity })}>
                <SelectTrigger id="re-pri"><SelectValue /></SelectTrigger>
                <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_META[s].label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id="re-due" label="Due date" required><Input id="re-due" type="date" className="[color-scheme:light] dark:[color-scheme:dark]" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span>
              <span className="block text-sm font-medium">Require retest before resolution</span>
              <span className="block text-[11px] text-muted-foreground">{closedTask ? "Locked: task is already closed." : "Turning this off removes the retest gate; manual approval is still required."}</span>
            </span>
            <Switch checked={draft.retestRequired} disabled={closedTask} onCheckedChange={(v) => setDraft({ ...draft, retestRequired: v })} aria-label="Require retest" />
          </label>
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
