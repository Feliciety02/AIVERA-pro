import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save, ShieldAlert } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/shared/display";
import { Field, FormSection } from "./fields";
import { ScopeEditor } from "./ScopeEditor";
import { ASSET_TYPES, AUTHORIZATION_STATUS, CATEGORIES, ENVIRONMENTS, RESTRICTED_ACTIVITY_DEFAULTS } from "@/lib/constants";
import type { AssessmentCategoryId, AssetType, AuthorizationStatus, Project, Target, TargetEnvironment } from "@/types";

const assetTypes = Object.keys(ASSET_TYPES) as [AssetType, ...AssetType[]];
const envs = Object.keys(ENVIRONMENTS) as [TargetEnvironment, ...TargetEnvironment[]];
const authStatuses = Object.keys(AUTHORIZATION_STATUS) as [AuthorizationStatus, ...AuthorizationStatus[]];

/** URL syntax validation only. The URL is never requested, resolved or crawled. */
const urlSchema = z
  .string()
  .trim()
  .min(1, "Application URL is required")
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
    } catch {
      return false;
    }
  }, "Enter a valid http:// or https:// URL (syntax check only — the URL is not contacted)");

export const targetSchema = z
  .object({
    name: z.string().trim().min(3, "Target name must be at least 3 characters").max(120),
    url: urlSchema,
    projectId: z.string().min(1, "Select the associated project"),
    description: z.string().trim().max(600),
    assetType: z.enum(assetTypes),
    environment: z.enum(envs),
    owner: z.string().trim().min(2, "Enter the system owner"),
    authorizationStatus: z.enum(authStatuses),
    authorizationReference: z.string().trim().min(3, "Provide an authorization reference (e.g. signed RoE ID)"),
    authorizationConfirmed: z.boolean(),
    testingNotes: z.string().max(2000),
    scope: z.object({
      inScopeHosts: z.array(z.string()).min(1, "Add at least one in-scope host"),
      allowedPaths: z.array(z.string()).min(1, "Add at least one allowed path"),
      excludedPaths: z.array(z.string()),
      allowedCategories: z.array(z.enum(CATEGORIES.map((c) => c.id) as [AssessmentCategoryId, ...AssessmentCategoryId[]])).min(1, "Select at least one assessment category"),
      allowedActivities: z.array(z.string()),
      restrictedActivities: z.array(z.string()),
    }),
  })
  .refine((v) => v.authorizationConfirmed, { path: ["authorizationConfirmed"], message: "You must confirm that this application is authorized for security assessment." })
  .refine(
    (v) => {
      try {
        const host = new URL(v.url).hostname;
        return v.scope.inScopeHosts.some((h) => h.split(":")[0] === host || (h.startsWith("*.") && host.endsWith(h.slice(1))));
      } catch {
        return true;
      }
    },
    { path: ["scope", "inScopeHosts"], message: "The application URL's host must be listed as an in-scope host." },
  );

export type TargetFormValues = z.infer<typeof targetSchema>;

export function TargetForm({ initial, projects, defaultProjectId, onSubmit, onCancel, submitLabel }: { initial?: Target; projects: Project[]; defaultProjectId?: string; onSubmit: (v: TargetFormValues) => Promise<void>; onCancel: () => void; submitLabel: string }) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<TargetFormValues>({
    resolver: zodResolver(targetSchema),
    defaultValues: {
      name: initial?.name ?? "",
      url: initial?.url ?? "",
      projectId: initial?.projectId ?? defaultProjectId ?? "",
      description: initial?.description ?? "",
      assetType: initial?.assetType ?? "web_application",
      environment: initial?.environment ?? "staging",
      owner: initial?.owner ?? "",
      authorizationStatus: initial?.authorizationStatus ?? "authorized",
      authorizationReference: initial?.authorizationReference ?? "",
      authorizationConfirmed: initial?.authorizationConfirmed ?? false,
      testingNotes: initial?.testingNotes ?? "",
      scope: initial?.scope ?? { inScopeHosts: [], allowedPaths: ["/"], excludedPaths: [], allowedCategories: ["authentication", "access_control", "injection", "session", "exposed_files", "config_https"], allowedActivities: ["Passive reconnaissance", "Manual verification of findings"], restrictedActivities: RESTRICTED_ACTIVITY_DEFAULTS },
    },
  });

  const url = watch("url");
  const scope = watch("scope");

  // Convenience: suggest the URL's host as in-scope. Pure string parsing — no DNS, no request.
  const suggestedHost = React.useMemo(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }, [url]);
  const hostMissing = suggestedHost && !scope.inScopeHosts.includes(suggestedHost);

  const scopeErrors = {
    inScopeHosts: errors.scope?.inScopeHosts?.message ?? errors.scope?.inScopeHosts?.root?.message,
    allowedPaths: errors.scope?.allowedPaths?.message,
    allowedCategories: errors.scope?.allowedCategories?.message,
  };

  const aria = (k: keyof TargetFormValues) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Callout tone="warning" icon={ShieldAlert} title="Only register applications you are explicitly authorized to test">
        Registering a target stores metadata only. AEGIS does not visit the URL, send HTTP requests, resolve DNS, crawl links, submit forms or scan anything from the browser. Future scans will run only through a backend that independently enforces this scope.
      </Callout>
      <Card>
        <CardContent className="pt-6">
          <FormSection title="Target application" description="Identify the web application and the project it belongs to.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Target name" required error={errors.name?.message}>
                <Input id="name" placeholder="e.g. Northwind Storefront (Staging)" {...register("name")} {...aria("name")} />
              </Field>
              <Field id="projectId" label="Associated project" required error={errors.projectId?.message}>
                <Controller
                  control={control}
                  name="projectId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="projectId" {...aria("projectId")}>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects
                          .filter((p) => p.status !== "archived")
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <Field id="url" label="Application URL" required error={errors.url?.message} hint="Use a fictional/reserved domain (.example, .test) or localhost for demonstrations.">
              <Input id="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://app.example.test" className="font-mono text-xs" {...register("url")} {...aria("url")} />
            </Field>
            <Field id="description" label="Description">
              <Textarea id="description" rows={2} {...register("description")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="assetType" label="Asset type" required>
                <Controller control={control} name="assetType" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="assetType"><SelectValue /></SelectTrigger>
                    <SelectContent>{assetTypes.map((t) => <SelectItem key={t} value={t}>{ASSET_TYPES[t]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field id="environment" label="Environment" required>
                <Controller control={control} name="environment" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="environment"><SelectValue /></SelectTrigger>
                    <SelectContent>{envs.map((t) => <SelectItem key={t} value={t}>{ENVIRONMENTS[t]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field id="owner" label="System owner" required error={errors.owner?.message}>
                <Input id="owner" placeholder="Team or person accountable" {...register("owner")} {...aria("owner")} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Authorization" description="Record the written permission that allows this assessment. Testing without authorization is prohibited.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="authorizationStatus" label="Authorization status" required>
                <Controller control={control} name="authorizationStatus" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="authorizationStatus"><SelectValue /></SelectTrigger>
                    <SelectContent>{authStatuses.map((t) => <SelectItem key={t} value={t}>{AUTHORIZATION_STATUS[t].label}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
              <Field id="authorizationReference" label="Authorization reference" required error={errors.authorizationReference?.message} hint="e.g. signed Rules of Engagement ID or ticket number">
                <Input id="authorizationReference" placeholder="RoE-2026-014" {...register("authorizationReference")} {...aria("authorizationReference")} />
              </Field>
            </div>
            <Controller
              control={control}
              name="authorizationConfirmed"
              render={({ field }) => (
                <div className={`rounded-lg border p-3.5 ${errors.authorizationConfirmed ? "border-destructive/60 bg-destructive/5" : "border-border bg-muted/30"}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox id="authorizationConfirmed" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-invalid={!!errors.authorizationConfirmed} aria-describedby="authorizationConfirmed-error" className="mt-0.5" />
                    <div className="space-y-1">
                      <Label htmlFor="authorizationConfirmed" className="text-sm leading-snug">
                        I confirm that this application is authorized for security assessment.<span className="text-destructive">*</span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground">Your demo persona and the time of confirmation are recorded in the activity log.</p>
                    </div>
                  </div>
                  {errors.authorizationConfirmed && (
                    <p id="authorizationConfirmed-error" role="alert" className="mt-2 text-[11px] text-destructive">
                      {errors.authorizationConfirmed.message}
                    </p>
                  )}
                </div>
              )}
            />
          </FormSection>

          <FormSection
            title="Scope definition"
            description="Hosts, paths and categories that testing may cover. Exclusions always take precedence."
            aside={
              hostMissing ? (
                <Button type="button" variant="subtle" size="sm" className="mt-3" onClick={() => setValue("scope", { ...getValues("scope"), inScopeHosts: [...getValues("scope").inScopeHosts, suggestedHost!] }, { shouldValidate: true })}>
                  Add {suggestedHost} to scope
                </Button>
              ) : undefined
            }
          >
            <ScopeEditor value={scope} onChange={(v) => setValue("scope", v, { shouldValidate: !!errors.scope, shouldDirty: true })} errors={scopeErrors} />
          </FormSection>

          <FormSection title="Testing notes" description="Rate limits, testing windows, test accounts (names only — never passwords).">
            <Field id="testingNotes" label="Notes" hint="Do not store credentials here.">
              <Textarea id="testingNotes" rows={3} {...register("testingNotes")} />
            </Field>
          </FormSection>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {Object.keys(errors).length > 0 && <span className="mr-auto text-[11px] text-destructive">Please fix the highlighted fields.</span>}
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
