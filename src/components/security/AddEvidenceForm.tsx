import * as React from "react";
import { Loader2, NotebookPen, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/forms/fields";
import { findingService } from "@/services";

/** Lets an assessor attach a manual evidence note (steps, redacted excerpts, observations) to a finding. */
export function AddEvidenceForm({ findingId }: { findingId: string }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add evidence note
      </Button>
    );

  const save = async () => {
    if (title.trim().length < 3) return setErr("Give the evidence a title (min. 3 characters).");
    if (content.trim().length < 10) return setErr("Record the evidence (min. 10 characters).");
    setBusy(true);
    await findingService.addEvidence(findingId, title.trim(), content.trim());
    setBusy(false);
    toast.success("Evidence added", { description: "Marked as user-entered and not yet reviewed." });
    setTitle("");
    setContent("");
    setErr(null);
    setOpen(false);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><NotebookPen className="size-3.5" /> New manual evidence note</p>
      <Field id="ev-title" label="Title" required>
        <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Retest observation, redacted response excerpt" />
      </Field>
      <Field id="ev-content" label="Evidence" required hint="Never paste real credentials, tokens or personal data, this demo stores data in browser storage.">
        <Textarea id="ev-content" rows={5} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-[11.5px]" />
      </Field>
      {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setErr(null); }} disabled={busy}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save evidence</Button>
      </div>
    </div>
  );
}
