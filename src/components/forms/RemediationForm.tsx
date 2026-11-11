import { Controller, useForm } from "react-hook-form";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

export function RemediationForm({ finding, open, onOpenChange, onCreated }: { finding: VulnerabilityFinding; open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const users = useDataStore((s) => s.users);
  const days = finding.severity === "critical" ? 7 : finding.severity === "high" ? 14 : finding.severity === "medium" ? 30 : 60;
  const due = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  const {
    register,
    control,
    handleSubmit,
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

  const submit = async (v: Values) => {
    const task = await remediationService.create({ ...v, findingId: finding.id, dueDate: new Date(`${v.dueDate}T00:00:00Z`).toISOString() });
    toast.success(`Created ${task.code}`, { description: "Track progress in Remediation Tracking." });
    onOpenChange(false);
    onCreated?.(task.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create remediation task</DialogTitle>
          <DialogDescription>
            From <span className="font-mono">{finding.code}</span>. Tasks can only be resolved through manual approval (and a passed retest when required).
          </DialogDescription>
        </DialogHeader>
        <DialogGuide guideKey="remediationCreate" steps={DIALOG_GUIDES.remediationCreate} />
        <form id="rem-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <Field id="r-title" label="Title" required error={errors.title?.message}>
            <Input id="r-title" {...register("title")} aria-invalid={!!errors.title} />
          </Field>
          <Field id="r-desc" label="Description" required error={errors.description?.message}>
            <Textarea id="r-desc" rows={2} {...register("description")} aria-invalid={!!errors.description} />
          </Field>
          <Field id="r-rec" label="Remediation recommendation" required error={errors.recommendation?.message}>
            <Textarea id="r-rec" rows={3} {...register("recommendation")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="r-owner" label="Owner" required error={errors.ownerId?.message}>
              <Controller control={control} name="ownerId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="r-owner"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{users.filter((u) => u.status === "active").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field id="r-priority" label="Priority" required>
              <Controller control={control} name="priority" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="r-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_META[s].label}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field id="r-due" label="Due date" required error={errors.dueDate?.message}>
              <Input id="r-due" type="date" className="[color-scheme:light] dark:[color-scheme:dark]" {...register("dueDate")} />
            </Field>
          </div>
          <Controller control={control} name="retestRequired" render={({ field }) => (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Require retest before resolution</span>
                <span className="block text-[11px] text-muted-foreground">Recommended. The task cannot be resolved until a manual retest passes.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Require retest" />
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
