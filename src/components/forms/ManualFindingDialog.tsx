import * as React from "react";
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
import { Field } from "./fields";
import { ChoiceChips } from "./choices";
import { useDataStore } from "@/stores/dataStore";
import { CATEGORIES, SEVERITIES, SEVERITY_META } from "@/lib/constants";
import { findingService } from "@/services";
import type { AssessmentCategoryId, Severity } from "@/types";

const schema = z.object({
  targetId: z.string().min(1, "Select the affected target"),
  title: z.string().trim().min(5, "Title must be at least 5 characters").max(160),
  category: z.enum(CATEGORIES.map((c) => c.id) as [AssessmentCategoryId, ...AssessmentCategoryId[]]),
  severity: z.enum(SEVERITIES as [Severity, ...Severity[]]),
  affectedAsset: z.string().trim().max(500),
  parameter: z.string().max(100),
  cwe: z.string().trim().regex(/^(CWE-\d+)?$/, "Use the format CWE-79 or leave empty"),
  description: z.string().trim().min(10, "Say what you saw (min. 10 characters)"),
  impact: z.string().trim().max(2000),
  remediation: z.string().trim().max(2000),
  evidenceTitle: z.string().trim().min(3, "Name the evidence item"),
  evidenceContent: z.string().trim().min(10, "Add the steps or proof (min. 10 characters)"),
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
  // Preselect: the website passed in, else the one scanned most recently, else the first.
  const scans = useDataStore((s) => s.scans);
  const lastScanned = [...scans].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "")).find((sc) => targets.some((t) => t.id === sc.targetId))?.targetId;
  const firstTarget = defaults?.targetId ?? lastScanned ?? targets[0]?.id ?? "";
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    getFieldState,
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
  // The address follows the chosen website unless the person typed their own.
  React.useEffect(() => {
    if (target && !getFieldState("affectedAsset").isDirty) setValue("affectedAsset", target.url);
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (v: Values) => {
    if (!allowed.includes(v.category)) {
      toast.error("That category is not permitted by the target's approved scope.");
      return;
    }
    const f = await findingService.createManual({ ...v, affectedAsset: v.affectedAsset || target?.url || "", impact: v.impact || "Not assessed yet.", remediation: v.remediation || "To be decided after verification.", checklistRef: defaults?.checklistRef });
    toast.success(`Recorded ${f.code}`, { description: "Added as Pending Verification. A separate verification decision is still required." });
    onOpenChange(false);
    navigate(`/findings/${f.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Hand className="size-4" /> Record manual finding</DialogTitle>
          <DialogDescription>Something you found yourself. It starts as unverified until someone confirms it.</DialogDescription>
        </DialogHeader>
        <form id="manual-finding" onSubmit={handleSubmit(submit)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="mf-target" label="Website" required error={errors.targetId?.message}>
              <Controller control={control} name="targetId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="mf-target"><SelectValue placeholder="Choose a website" /></SelectTrigger>
                  <SelectContent>{targets.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field id="mf-cat" label="Type of problem" required>
              <Controller control={control} name="category" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="mf-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id} disabled={!!target && !allowed.includes(c.id)}>{c.short}{target && !allowed.includes(c.id) ? " (not in scope)" : ""}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
          </div>
          <Field id="mf-title" label="Title" required error={errors.title?.message}>
            <Input id="mf-title" placeholder="e.g. Admin page opens without login" {...register("title")} aria-invalid={!!errors.title} />
          </Field>
          <Field id="mf-sev" label="How serious?">
            <Controller control={control} name="severity" render={({ field }) => (
              <ChoiceChips label="Severity" value={field.value} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label, color: SEVERITY_META[s].color }))} onChange={field.onChange} />
            )} />
          </Field>
          <Field id="mf-desc" label="What did you see?" required error={errors.description?.message}>
            <Textarea id="mf-desc" rows={2} {...register("description")} />
          </Field>
          <Field id="mf-ev" label="Steps or proof" required error={errors.evidenceContent?.message} hint="Never paste real passwords or personal data.">
            <Textarea id="mf-ev" rows={3} className="font-mono text-[11.5px]" {...register("evidenceContent")} />
          </Field>
          <details className="group rounded-xl border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
              More details <span className="font-normal text-muted-foreground">Optional: address, parameter, CWE, impact, fix</span>
            </summary>
            <div className="grid gap-3 border-t border-border p-3.5 sm:grid-cols-2">
              <Field id="mf-asset" label="Address" hint="Defaults to the website address." className="sm:col-span-2">
                <Input id="mf-asset" className="font-mono text-xs" {...register("affectedAsset")} />
              </Field>
              <Field id="mf-param" label="Parameter"><Input id="mf-param" className="font-mono text-xs" {...register("parameter")} /></Field>
              <Field id="mf-cwe" label="CWE" error={errors.cwe?.message}><Input id="mf-cwe" placeholder="CWE-79" {...register("cwe")} /></Field>
              <Field id="mf-impact" label="Possible impact"><Textarea id="mf-impact" rows={2} {...register("impact")} /></Field>
              <Field id="mf-rem" label="How to fix"><Textarea id="mf-rem" rows={2} {...register("remediation")} /></Field>
            </div>
          </details>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" form="manual-finding" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} Record finding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
