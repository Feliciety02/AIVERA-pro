import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./fields";
import { ChoiceChips, DateShortcuts } from "./choices";
import { PRIORITY_OPTIONS } from "./RemediationForm";
import { useDataStore } from "@/stores/dataStore";
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
          <DialogDescription>Details only. Status moves with the buttons on the task.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field id="re-title" label="Title" required><Input id="re-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field id="re-desc" label="Description" required><Textarea id="re-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field id="re-rec" label="Recommendation"><Textarea id="re-rec" rows={3} value={draft.recommendation} onChange={(e) => setDraft({ ...draft, recommendation: e.target.value })} /></Field>
          <Field id="re-owner" label="Owner">
            <Select value={draft.ownerId} onValueChange={(v) => setDraft({ ...draft, ownerId: v })}>
              <SelectTrigger id="re-owner"><SelectValue /></SelectTrigger>
              <SelectContent>{users.filter((u) => u.status === "active").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="re-pri" label="Priority"><ChoiceChips label="Priority" value={draft.priority} options={PRIORITY_OPTIONS} onChange={(v) => setDraft({ ...draft, priority: v as Severity })} /></Field>
          <Field id="re-due" label="Due" required><DateShortcuts id="re-due" value={draft.dueDate} onChange={(v) => setDraft({ ...draft, dueDate: v })} /></Field>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox checked={draft.retestRequired} disabled={closedTask} onCheckedChange={(v) => setDraft({ ...draft, retestRequired: v === true })} />
            Retest before it can be closed {closedTask && <span className="text-xs text-muted-foreground">(locked, task is closed)</span>}
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
