import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormSection, ChoiceCard } from "./fields";
import { ASSESSMENT_TYPES, PROJECT_STATUS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { toInputDate } from "@/lib/format";
import type { AssessmentType, Project, ProjectStatus, User } from "@/types";

const assessmentTypes = Object.keys(ASSESSMENT_TYPES) as [AssessmentType, ...AssessmentType[]];
const statuses = (Object.keys(PROJECT_STATUS) as ProjectStatus[]).filter((s) => s !== "archived") as [ProjectStatus, ...ProjectStatus[]];

export const projectSchema = z
  .object({
    name: z.string().trim().min(3, "Project name must be at least 3 characters").max(120, "Keep the name under 120 characters"),
    description: z.string().trim().min(10, "Describe the engagement in at least 10 characters").max(600),
    assessmentType: z.enum(assessmentTypes, { error: "Select an assessment type" }),
    ownerId: z.string().min(1, "Select a project owner"),
    leadId: z.string().optional(),
    remediationOwnerId: z.string().optional(),
    memberIds: z.array(z.string()),
    status: z.enum(statuses),
    startDate: z.string().min(1, "Start date is required"),
    dueDate: z.string().min(1, "Expected completion date is required"),
    objectives: z.string().trim().min(10, "List the assessment objectives (min. 10 characters)").max(2000),
    notes: z.string().max(2000),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, { path: ["dueDate"], message: "Completion date must be on or after the start date" });

export type ProjectFormValues = z.infer<typeof projectSchema>;

export function ProjectForm({ initial, users, onSubmit, onCancel, submitLabel }: { initial?: Project; users: User[]; onSubmit: (v: ProjectFormValues) => Promise<void>; onCancel: () => void; submitLabel: string }) {
  const active = users.filter((u) => u.status === "active");
  const assessors = active.filter((u) => can(u.role, "verify_findings"));
  const leads = active.filter((u) => can(u.role, "signoff_findings"));
  const fixers = active.filter((u) => u.role === "remediation_owner");
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      assessmentType: initial?.assessmentType ?? "web_application",
      ownerId: initial?.ownerId ?? "",
      leadId: initial?.leadId,
      remediationOwnerId: initial?.remediationOwnerId,
      memberIds: initial?.memberIds ?? [],
      status: initial && initial.status !== "archived" ? initial.status : "draft",
      startDate: toInputDate(initial?.startDate),
      dueDate: toInputDate(initial?.dueDate),
      objectives: initial?.objectives ?? "",
      notes: initial?.notes ?? "",
    },
  });
  const members = watch("memberIds");
  const ownerId = watch("ownerId");
  const leadId = watch("leadId");
  const fixerId = watch("remediationOwnerId");

  // The owner, lead and remediation owner are always on the team.
  React.useEffect(() => {
    const missing = [ownerId, leadId, fixerId].filter((id): id is string => !!id && !members.includes(id));
    if (missing.length) setValue("memberIds", [...members, ...missing], { shouldDirty: true });
  }, [ownerId, leadId, fixerId, members, setValue]);

  const err = (k: keyof ProjectFormValues) => errors[k]?.message as string | undefined;
  const aria = (k: keyof ProjectFormValues) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardContent className="pt-6">
          <FormSection title="Project details" description="A clear name and description help reviewers understand the engagement at a glance.">
            <Field id="name" label="Project name" required error={err("name")}>
              <Input id="name" placeholder="e.g. UMERCH3.0 Checkout Retest" {...register("name")} {...aria("name")} />
            </Field>
            <Field id="description" label="Description" required error={err("description")}>
              <Textarea id="description" rows={3} placeholder="Scope summary, environment, and purpose of the assessment" {...register("description")} {...aria("description")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="assessmentType" label="Assessment type" required error={err("assessmentType")}>
                <Controller
                  control={control}
                  name="assessmentType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="assessmentType" {...aria("assessmentType")}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {assessmentTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {ASSESSMENT_TYPES[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field id="status" label="Status" required>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {PROJECT_STATUS[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Ownership & team" description="The lead approves the project's critical findings, fixes and reports. New findings go to the assessor on the team with the fewest open reviews, and fixes go to the remediation owner.">
            <Field id="ownerId" label="Project owner" required error={err("ownerId")}>
              <Controller
                control={control}
                name="ownerId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ownerId" {...aria("ownerId")}>
                      <SelectValue placeholder="Select an assessor" />
                    </SelectTrigger>
                    <SelectContent>
                      {assessors.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} · {u.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="leadId" label="Security lead" hint="Signs off critical and high findings and approves fixes and reports.">
                <Controller
                  control={control}
                  name="leadId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger id="leadId"><SelectValue placeholder={leads.length ? "Pick a lead" : "No leads yet"} /></SelectTrigger>
                      <SelectContent>{leads.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.title}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field id="remediationOwnerId" label="Remediation owner" hint="The developer who gets fix tasks automatically.">
                <Controller
                  control={control}
                  name="remediationOwnerId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger id="remediationOwnerId"><SelectValue placeholder={fixers.length ? "Pick a developer" : "No developers yet"} /></SelectTrigger>
                      <SelectContent>{fixers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.title}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Assigned members</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {users
                  .filter((u) => u.status !== "suspended")
                  .map((u) => (
                    <ChoiceCard
                      key={u.id}
                      checked={members.includes(u.id)}
                      disabled={u.id === ownerId || u.id === leadId || u.id === fixerId}
                      onToggle={() => setValue("memberIds", members.includes(u.id) ? members.filter((m) => m !== u.id) : [...members, u.id], { shouldDirty: true })}
                      title={u.name}
                      description={`${u.title}${u.id === ownerId ? " · owner" : u.id === leadId ? " · lead" : u.id === fixerId ? " · fixes" : ""}`}
                    />
                  ))}
              </div>
            </div>
          </FormSection>

          <FormSection title="Schedule" description="Planned testing window. Targets must also be within their own authorization period.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="startDate" label="Start date" required error={err("startDate")}>
                <Input id="startDate" type="date" className="[color-scheme:light] dark:[color-scheme:dark]" {...register("startDate")} {...aria("startDate")} />
              </Field>
              <Field id="dueDate" label="Expected completion" required error={err("dueDate")}>
                <Input id="dueDate" type="date" className="[color-scheme:light] dark:[color-scheme:dark]" {...register("dueDate")} {...aria("dueDate")} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Objectives & notes" description="What the assessment must establish, plus any rules of engagement worth recording.">
            <Field id="objectives" label="Assessment objectives" required error={err("objectives")}>
              <Textarea id="objectives" rows={4} placeholder="e.g. Verify authorization between customer and admin roles; review session handling…" {...register("objectives")} {...aria("objectives")} />
            </Field>
            <Field id="notes" label="Notes" hint="Do not store credentials or secrets here, this demo keeps data in browser storage.">
              <Textarea id="notes" rows={3} {...register("notes")} />
            </Field>
          </FormSection>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-end gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {isDirty && <span className="mr-auto text-[11px] text-muted-foreground">Unsaved changes</span>}
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
