import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./fields";
import { ChoiceChips, DateShortcuts } from "./choices";
import { useDataStore } from "@/stores/dataStore";
import { SEVERITIES, SEVERITY_META } from "@/lib/constants";
import { remediationService } from "@/services";
import type { Severity, VulnerabilityFinding } from "@/types";

const schema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters").max(140),
  description: z.string().trim().min(5, "Describe the work required").max(1000),
  recommendation: z.string().trim().min(5).max(2000),
  ownerId: z.string().min(1, "Assign an owner"),
  priority: z.enum(SEVERITIES as [Severity, ...Severity[]]),
  dueDate: z.string().min(1, "Due date is required"),
  retestRequired: z.boolean(),
});
type Values = z.infer<typeof schema>;

export const PRIORITY_OPTIONS = SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label, color: SEVERITY_META[s].color }));

/**
 * Everything is filled in from the finding: wording, owner, priority and a due date that matches the
 * severity. The person checks the owner and date; the wording is one click away if it needs changing.
 */
export function RemediationForm({ finding, open, onOpenChange, onCreated }: { finding: VulnerabilityFinding; open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const users = useDataStore((s) => s.users);
  const [editText, setEditText] = React.useState(false);
  const days = finding.severity === "critical" ? 7 : finding.severity === "high" ? 14 : finding.severity === "medium" ? 30 : 60;
  const due = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      title: `Fix: ${finding.title}`.slice(0, 140),
      description: `Remediate ${finding.code} on ${finding.affectedAsset}.`,
      recommendation: finding.remediation,
      ownerId: finding.assignedAssessorId,
      priority: finding.severity,
      dueDate: due,
      retestRequired: true,
    },
  });
  React.useEffect(() => {
    if (open) setEditText(false);
  }, [open]);

  const submit = async (v: Values) => {
    const task = await remediationService.create({ ...v, findingId: finding.id, dueDate: new Date(`${v.dueDate}T00:00:00Z`).toISOString() });
    toast.success(`Created ${task.code}`, { description: "Track progress on the Fixes page." });
    onOpenChange(false);
    onCreated?.(task.id);
  };
  const textError = errors.title?.message ?? errors.description?.message ?? errors.recommendation?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wrench className="size-4" /> Create fix task</DialogTitle>
          <DialogDescription>For <span className="font-mono">{finding.code}</span>. Check the owner and date, then create.</DialogDescription>
        </DialogHeader>
        <form id="rem-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <section className="rounded-xl bg-muted/50 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5 text-primary" aria-hidden /> Filled in from the finding</p>
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setEditText((v) => !v)}>{editText ? "Done" : "Edit"}</button>
            </div>
            {editText ? (
              <div className="mt-2 space-y-2">
                <Input aria-label="Title" {...register("title")} />
                <Textarea aria-label="What needs doing" rows={2} {...register("description")} />
                <Textarea aria-label="How to fix" rows={3} {...register("recommendation")} />
              </div>
            ) : (
              <>
                <p className="mt-1.5 text-sm font-medium">{watch("title")}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{watch("recommendation")}</p>
              </>
            )}
            {textError && <p role="alert" className="mt-1.5 text-xs text-destructive">{textError}</p>}
          </section>

          <Field id="r-owner" label="Owner" required error={errors.ownerId?.message}>
            <Controller control={control} name="ownerId" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="r-owner"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{users.filter((u) => u.status === "active").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </Field>
          <Field id="r-priority" label="Priority">
            <Controller control={control} name="priority" render={({ field }) => <ChoiceChips label="Priority" value={field.value} options={PRIORITY_OPTIONS} onChange={field.onChange} />} />
          </Field>
          <Field id="r-due" label="Due" error={errors.dueDate?.message}>
            <Controller control={control} name="dueDate" render={({ field }) => <DateShortcuts id="r-due" value={field.value} onChange={field.onChange} />} />
          </Field>
          <Controller control={control} name="retestRequired" render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              Retest before it can be closed <span className="text-xs text-muted-foreground">(recommended)</span>
            </label>
          )} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="rem-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />} Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
