import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { useNavigate } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Hand, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout } from "@/components/shared/display";
import { Field } from "./fields";
import { useDataStore } from "@/stores/dataStore";
import { CATEGORIES, SEVERITIES, SEVERITY_META } from "@/lib/constants";
import { findingService } from "@/services";
import type { AssessmentCategoryId, Severity } from "@/types";

const schema = z.object({
  targetId: z.string().min(1, "Select the affected target"),
  title: z.string().trim().min(5, "Title must be at least 5 characters").max(160),
  category: z.enum(CATEGORIES.map((c) => c.id) as [AssessmentCategoryId, ...AssessmentCategoryId[]]),
  severity: z.enum(SEVERITIES as [Severity, ...Severity[]]),
  affectedAsset: z.string().trim().min(1, "Describe the affected URL, endpoint or service"),
  parameter: z.string().max(100),
  cwe: z.string().trim().regex(/^(CWE-\d+)?$/, "Use the format CWE-79 or leave empty"),
  description: z.string().trim().min(10, "Describe what you observed (min. 10 characters)"),
  impact: z.string().trim().min(5, "Describe the potential impact"),
  remediation: z.string().trim().min(5, "Suggest a remediation"),
  evidenceTitle: z.string().trim().min(3, "Name the evidence item"),
  evidenceContent: z.string().trim().min(10, "Record the evidence (steps, request/response excerpt, observation)"),
});
type Values = z.infer<typeof schema>;

export interface ManualFindingDefaults {
  projectId?: string;
  targetId?: string;
  category?: AssessmentCategoryId;
  title?: string;
  checklistRef?: { assessmentId: string; itemId: string };
}

/** Records a finding observed during manual testing. It always starts as Pending Verification. */
export function ManualFindingDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: ManualFindingDefaults }) {
  const navigate = useNavigate();
  const allTargets = useDataStore((s) => s.targets);
  const targets = allTargets.filter((t) => !!t.projectId && t.authorizationStatus === "authorized" && t.authorizationConfirmed && (!defaults?.projectId || t.projectId === defaults.projectId));
  const firstTarget = defaults?.targetId ?? (targets.length === 1 ? targets[0]!.id : "");
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  React.useEffect(() => {
    if (open)
      reset({
        targetId: firstTarget,
        title: defaults?.title ?? "",
        category: defaults?.category ?? "authentication",
        severity: "medium",
        affectedAsset: allTargets.find((t) => t.id === firstTarget)?.url ?? "",
        parameter: "",
        cwe: "",
        description: "",
        impact: "",
        remediation: "",
        evidenceTitle: "Manual test notes",
        evidenceContent: "",
      });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetId = watch("targetId");
  const target = allTargets.find((t) => t.id === targetId);
  const allowed = target?.scope.allowedCategories ?? [];

  const submit = async (v: Values) => {
    if (!allowed.includes(v.category)) {
      toast.error("That category is not permitted by the target's approved scope.");
      return;
    }
    const f = await findingService.createManual({ ...v, checklistRef: defaults?.checklistRef });
    toast.success(`Recorded ${f.code}`, { description: "Added as Pending Verification. A separate verification decision is still required." });
    onOpenChange(false);
    navigate(`/findings/${f.id}?tab=evidence`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Hand className="size-4" /> Record manual finding</DialogTitle>
          <DialogDescription>Document an issue you observed during manual testing within the authorized scope.</DialogDescription>
        </DialogHeader>
        <DialogGuide guideKey="manualFinding" steps={DIALOG_GUIDES.manualFinding} />
        <Callout>Recording a finding does not confirm it. It enters the verification queue as <strong>Pending Verification</strong>; confirming is a separate, explicit decision.</Callout>
        <form id="manual-finding" onSubmit={handleSubmit(submit)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="mf-target" label="Target" required error={errors.targetId?.message}>
              <Controller control={control} name="targetId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="mf-target"><SelectValue placeholder="Authorized target" /></SelectTrigger>
                  <SelectContent>{targets.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field id="mf-title" label="Title" required error={errors.title?.message}>
              <Input id="mf-title" {...register("title")} aria-invalid={!!errors.title} />
            </Field>
            <Field id="mf-cat" label="Category" required hint={target ? undefined : "Select a target to see permitted categories"}>
              <Controller control={control} name="category" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="mf-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id} disabled={!!target && !allowed.includes(c.id)}>{c.name}{target && !allowed.includes(c.id) ? " (not in scope)" : ""}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field id="mf-sev" label="Initial severity" required hint="Your initial rating; can be revisited at verification.">
              <Controller control={control} name="severity" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="mf-sev"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_META[s].label}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field id="mf-asset" label="Affected asset" required error={errors.affectedAsset?.message} className="sm:col-span-2">
              <Input id="mf-asset" className="font-mono text-xs" {...register("affectedAsset")} />
            </Field>
            <Field id="mf-param" label="Parameter">
              <Input id="mf-param" className="font-mono text-xs" {...register("parameter")} />
            </Field>
            <Field id="mf-cwe" label="CWE" error={errors.cwe?.message}>
              <Input id="mf-cwe" placeholder="CWE-79" {...register("cwe")} />
            </Field>
          </div>
          <Field id="mf-desc" label="Technical description" required error={errors.description?.message}>
            <Textarea id="mf-desc" rows={3} {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="mf-impact" label="Potential impact" required error={errors.impact?.message}>
              <Textarea id="mf-impact" rows={2} {...register("impact")} />
            </Field>
            <Field id="mf-rem" label="Remediation recommendation" required error={errors.remediation?.message}>
              <Textarea id="mf-rem" rows={2} {...register("remediation")} />
            </Field>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold">Evidence (required)</p>
            <div className="grid gap-3">
              <Field id="mf-ev-title" label="Evidence title" required error={errors.evidenceTitle?.message}>
                <Input id="mf-ev-title" {...register("evidenceTitle")} />
              </Field>
              <Field id="mf-ev" label="Evidence" required error={errors.evidenceContent?.message} hint="Steps, redacted request/response excerpts, observations. Never paste real credentials or personal data.">
                <Textarea id="mf-ev" rows={4} className="font-mono text-[11.5px]" {...register("evidenceContent")} />
              </Field>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="manual-finding" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} Record finding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
