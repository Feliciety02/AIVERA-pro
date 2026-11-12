import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleAlert, CircleCheck, CircleMinus, ChevronDown, Loader2, Save, Wand2 } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormSection } from "./fields";
import { ScopeEditor } from "./ScopeEditor";
import { ASSET_TYPES, AUTHORIZATION_STATUS, CATEGORIES, ENVIRONMENTS, RESTRICTED_ACTIVITY_DEFAULTS } from "@/lib/constants";
import { detectFromAddress, nameFromHost } from "@/features/scopeDetection";
import { nextAuthReference } from "@/stores/dataStore";
import { IS_API, targetService } from "@/services";
import { cn } from "@/lib/utils";
import type { AssessmentCategoryId, AssetType, AuthorizationStatus, Project, ScopeDetection, ScopeSuggestion, Target, TargetEnvironment, TargetScope } from "@/types";

const assetTypes = Object.keys(ASSET_TYPES) as [AssetType, ...AssetType[]];
const envs = Object.keys(ENVIRONMENTS) as [TargetEnvironment, ...TargetEnvironment[]];
const authStatuses = Object.keys(AUTHORIZATION_STATUS) as [AuthorizationStatus, ...AuthorizationStatus[]];
const NO_PROJECT = "__none";

function parseUrl(v: string): URL | null {
  try {
    const u = new URL(v.trim());
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname ? u : null;
  } catch {
    return null;
  }
}

export const targetSchema = z
  .object({
    name: z.string().trim().min(3, "Give the website a name (at least 3 characters)").max(120),
    url: z.string().trim().min(1, "Enter the website address").refine((v) => !!parseUrl(v), "Enter a full address starting with http:// or https://"),
    projectId: z.string(),
    description: z.string().trim().max(600),
    assetType: z.enum(assetTypes),
    environment: z.enum(envs),
    owner: z.string().trim().min(2, "Enter who owns this website (a team or person)"),
    authorizationStatus: z.enum(authStatuses),
    authorizationReference: z.string().trim().max(200),
    authorizationConfirmed: z.boolean(),
    testingNotes: z.string().max(2000),
    scope: z.object({
      inScopeHosts: z.array(z.string()).min(1, "Click “Detect scope” or add the website's host"),
      allowedPaths: z.array(z.string()).min(1, "Add at least one path that may be tested (e.g. /*)"),
      excludedPaths: z.array(z.string()),
      allowedCategories: z.array(z.enum(CATEGORIES.map((c) => c.id) as [AssessmentCategoryId, ...AssessmentCategoryId[]])).min(1, "Select at least one test category"),
      allowedActivities: z.array(z.string()),
      restrictedActivities: z.array(z.string()),
    }),
  })
  .refine((v) => v.authorizationConfirmed, { path: ["authorizationConfirmed"], message: "Tick this box to confirm you have permission. Testing without permission is not allowed." })
  .refine(
    (v) => {
      const u = parseUrl(v.url);
      if (!u) return true;
      return v.scope.inScopeHosts.some((h) => h.split(":")[0] === u.hostname || (h.startsWith("*.") && u.hostname.endsWith(h.slice(1))));
    },
    { path: ["scope", "inScopeHosts"], message: "The website's own host must be in scope, click “Detect scope”." },
  );

export type TargetFormValues = z.infer<typeof targetSchema>;

const DEFAULT_CATEGORIES: AssessmentCategoryId[] = ["authentication", "access_control", "injection", "session", "exposed_files", "config_https"];

export function TargetForm({
  initial,
  projects,
  existingReferences,
  defaultProjectId,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: Target;
  projects: Project[];
  existingReferences: string[];
  defaultProjectId?: string;
  onSubmit: (v: TargetFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<TargetFormValues>({
    resolver: zodResolver(targetSchema),
    defaultValues: {
      name: initial?.name ?? "",
      url: initial?.url ?? "",
      projectId: initial?.projectId ?? defaultProjectId ?? NO_PROJECT,
      description: initial?.description ?? "",
      assetType: initial?.assetType ?? "web_application",
      environment: initial?.environment ?? "staging",
      owner: initial?.owner ?? "",
      authorizationStatus: initial?.authorizationStatus ?? "authorized",
      authorizationReference: initial?.authorizationReference ?? "",
      authorizationConfirmed: initial?.authorizationConfirmed ?? false,
      testingNotes: initial?.testingNotes ?? "",
      scope: initial?.scope ?? { inScopeHosts: [], allowedPaths: [], excludedPaths: [], allowedCategories: DEFAULT_CATEGORIES, allowedActivities: ["Passive reconnaissance", "Manual verification of findings"], restrictedActivities: RESTRICTED_ACTIVITY_DEFAULTS },
    },
  });
  // The server creates a project for a brand new website when none is picked.
  const autoProject = IS_API && !initial;

  const url = watch("url");
  const scope = watch("scope");
  const confirmed = watch("authorizationConfirmed");
  const reference = watch("authorizationReference");
  const parsed = parseUrl(url);
  const [detection, setDetection] = React.useState<ScopeDetection | null>(null);
  const [detecting, setDetecting] = React.useState(false);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [showRefInput, setShowRefInput] = React.useState(!!initial?.authorizationReference && !/^AUTH-\d{4}-\d{4}$/.test(initial.authorizationReference));
  const autoRef = React.useMemo(() => nextAuthReference(existingReferences), [existingReferences]);

  // Fill name, environment, host and path straight from the typed address (no network).
  React.useEffect(() => {
    if (initial || !parsed) return;
    const t = setTimeout(() => {
      const d = detectFromAddress(parsed.href);
      if (!dirtyFields.name) setValue("name", nameFromHost(parsed.hostname));
      if (!dirtyFields.environment && d.environmentHint) setValue("environment", d.environmentHint);
      const cur = getValues("scope");
      setValue("scope", { ...cur, inScopeHosts: d.inScopeHosts.map((s) => s.value), allowedPaths: d.allowedPaths.map((s) => s.value) }, { shouldValidate: !!errors.scope });
      setDetection(null);
    }, 350);
    return () => clearTimeout(t);
  }, [parsed?.href]); // eslint-disable-line react-hooks/exhaustive-deps

  const runDetection = async () => {
    if (!parsed) return;
    setDetecting(true);
    setDetectError(null);
    try {
      const d = await targetService.detectScope(parsed.href);
      setDetection(d);
      const cur = getValues("scope");
      const merge = (a: string[], b: ScopeSuggestion[]) => [...new Set([...a, ...b.map((s) => s.value)])];
      setValue("scope", { ...cur, inScopeHosts: merge(cur.inScopeHosts, d.inScopeHosts), allowedPaths: cur.allowedPaths.length ? cur.allowedPaths : d.allowedPaths.map((s) => s.value), excludedPaths: merge(cur.excludedPaths, d.excludedPaths) }, { shouldValidate: true, shouldDirty: true });
      if (!dirtyFields.environment && d.environmentHint) setValue("environment", d.environmentHint);
    } catch (e) {
      setDetectError((e as Error).message);
    } finally {
      setDetecting(false);
    }
  };

  const scopeErrors = {
    inScopeHosts: errors.scope?.inScopeHosts?.message ?? errors.scope?.inScopeHosts?.root?.message,
    allowedPaths: errors.scope?.allowedPaths?.message,
    allowedCategories: errors.scope?.allowedCategories?.message,
  };
  const scopeError = scopeErrors.inScopeHosts ?? scopeErrors.allowedPaths ?? scopeErrors.allowedCategories;
  const aria = (k: keyof TargetFormValues) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          {/* 1, Website */}
          <FormSection title="1. Website" description="Paste the address of the website you were given permission to test. AIVERA fills in the rest from it.">
            <Field id="url" label="Website address" required error={errors.url?.message} hint="For example http://127.0.0.1:8000 for UMERCH3.0 running locally">
              <Input id="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://" className="h-11 font-mono text-sm" {...register("url")} {...aria("url")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Name" required error={errors.name?.message} hint="Filled in from the address, change it if you like.">
                <Input id="name" {...register("name")} {...aria("name")} />
              </Field>
              <Field id="environment" label="Environment" required hint="Guessed from words like “staging” or “dev” in the address.">
                <Controller control={control} name="environment" render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => setValue("environment", v as TargetEnvironment, { shouldDirty: true })}>
                    <SelectTrigger id="environment"><SelectValue /></SelectTrigger>
                    <SelectContent>{envs.map((t) => <SelectItem key={t} value={t}>{ENVIRONMENTS[t]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </Field>
            </div>
          </FormSection>

          {/* 2, Permission */}
          <FormSection title="2. Permission" description="Only test websites whose owner gave you written permission. AIVERA records who confirmed it and when.">
            <Controller
              control={control}
              name="authorizationConfirmed"
              render={({ field }) => (
                <div className={cn("rounded-xl border p-4", errors.authorizationConfirmed ? "border-destructive/60 bg-destructive/5" : field.value ? "border-primary/40 bg-primary/5" : "border-border")}>
                  <div className="flex items-start gap-3">
                    <Checkbox id="authorizationConfirmed" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-invalid={!!errors.authorizationConfirmed} aria-describedby="authorizationConfirmed-error" className="mt-0.5" />
                    <Label htmlFor="authorizationConfirmed" className="text-sm leading-snug font-normal">
                      I have written permission from the owner to test this website.<span className="text-destructive">*</span>
                    </Label>
                  </div>
                  {errors.authorizationConfirmed && (
                    <p id="authorizationConfirmed-error" role="alert" className="mt-2 text-xs text-destructive">
                      {errors.authorizationConfirmed.message}
                    </p>
                  )}
                </div>
              )}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Permission record</span>
              <span id="authorizationReference-display" className="font-mono text-xs">{reference || initial?.authorizationReference || autoRef}</span>
              {!reference && !initial && <span className="text-xs text-muted-foreground">(assigned automatically)</span>}
              {!showRefInput && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowRefInput(true)}>
                  Use my own document number
                </button>
              )}
            </div>
            {showRefInput && (
              <Field id="authorizationReference" label="Document or ticket number (optional)" hint="Leave empty to use the automatic record number.">
                <Input id="authorizationReference" placeholder="e.g. RoE-2026-014" {...register("authorizationReference")} />
              </Field>
            )}
          </FormSection>

          {/* 3, Scope */}
          <FormSection
            title="3. What can be tested"
            description="AIVERA fills this in from real sources: the address itself, and, when the AIVERA server is running, a DNS check plus the site's own robots.txt and sitemap.xml."
          >
            <div id="scope-detect" className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Detect scope automatically</p>
                  <p className="text-xs text-muted-foreground">
                    {IS_API ? "Reads only DNS, /robots.txt and /sitemap.xml, no crawling or scanning." : "Demo mode: uses the address only. Run the full app to also check DNS, robots.txt and sitemap.xml."}
                  </p>
                </div>
                <Button type="button" variant={detection ? "outline" : "default"} size="sm" onClick={runDetection} disabled={!parsed || (IS_API && !confirmed) || detecting}>
                  {detecting ? <Loader2 className="animate-spin" /> : <Wand2 />}
                  {detection ? "Check again" : "Detect scope"}
                </Button>
              </div>
              {IS_API && !confirmed && parsed && <p className="text-xs text-muted-foreground">Tick the permission box in step 2 first, detection contacts the website.</p>}
              {detectError && <p role="alert" className="text-xs text-destructive">{detectError}</p>}
              {detection && <DetectionResult d={detection} />}
            </div>

            <ScopeSummary scope={scope} detection={detection} />
            {scopeError && <p role="alert" className="text-xs text-destructive">{scopeError}</p>}

            <details className="group rounded-lg border border-border" id="scope-advanced">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40">
                Edit scope manually (hosts, paths, test categories)
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border p-4">
                <ScopeEditor value={scope} onChange={(v) => setValue("scope", v, { shouldValidate: !!errors.scope, shouldDirty: true })} errors={scopeErrors} />
              </div>
            </details>
          </FormSection>

          {/* 4, Details */}
          <FormSection title="4. Details" description="Who owns the website, and which assessment it belongs to.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="owner" label="Website owner" required error={errors.owner?.message} hint="The team or person responsible for it.">
                <Input id="owner" placeholder="e.g. UMERCH3.0 developer" {...register("owner")} {...aria("owner")} />
              </Field>
              <Field
                id="projectId"
                label="Project"
                hint={autoProject ? "Leave it as is and AIVERA makes a project just for this website. Pick one only if this site belongs to an existing assessment." : "You can add it to a project later, before testing."}
              >
                <Controller
                  control={control}
                  name="projectId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="projectId"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PROJECT}>{autoProject ? "New project for this website (automatic)" : "No project yet"}</SelectItem>
                        {projects.filter((p) => p.status !== "archived").map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <details className="group rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40">
                More options (optional)
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 border-t border-border p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="assetType" label="Type of website">
                    <Controller control={control} name="assetType" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="assetType"><SelectValue /></SelectTrigger>
                        <SelectContent>{assetTypes.map((t) => <SelectItem key={t} value={t}>{ASSET_TYPES[t]}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  </Field>
                  <Field id="authorizationStatus" label="Permission status" hint="Use Pending if the owner hasn't signed yet, testing stays blocked.">
                    <Controller control={control} name="authorizationStatus" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="authorizationStatus"><SelectValue /></SelectTrigger>
                        <SelectContent>{authStatuses.map((t) => <SelectItem key={t} value={t}>{AUTHORIZATION_STATUS[t].label}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  </Field>
                </div>
                <Field id="description" label="Description">
                  <Textarea id="description" rows={2} placeholder="What the website does" {...register("description")} />
                </Field>
                <Field id="testingNotes" label="Testing notes" hint="Testing windows, rate limits, test account names. Never store passwords here.">
                  <Textarea id="testingNotes" rows={3} {...register("testingNotes")} />
                </Field>
              </div>
            </details>
          </FormSection>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {Object.keys(errors).length > 0 && <span className="mr-auto text-xs text-destructive">Please fix the highlighted fields.</span>}
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

export const NO_PROJECT_VALUE = NO_PROJECT;

/** Plain-language summary of the scope that will be saved. */
function ScopeSummary({ scope, detection }: { scope: TargetScope; detection: ScopeDetection | null }) {
  const sourceOf = (list: ScopeSuggestion[] | undefined, v: string) => list?.find((s) => s.value === v)?.source;
  const row = (label: string, items: string[], tone: "ok" | "no", list?: ScopeSuggestion[], empty?: string) => (
    <div className="grid gap-1.5 sm:grid-cols-[150px_1fr]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-xs text-muted-foreground">{empty ?? "None"}</span>}
        {items.map((v) => {
          const src = sourceOf(list, v);
          return (
            <span key={v} className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-xs", tone === "ok" ? "bg-primary/10 text-primary" : "bg-sev-critical/10 text-sev-critical")}>
              {v}
              {src && <span className="font-sans text-[10px] text-muted-foreground">· {src}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
  return (
    <div id="scope-summary" className="space-y-2.5 rounded-lg bg-muted/50 p-4">
      <p className="text-sm font-medium">Scope that will be saved</p>
      {row("Website host", scope.inScopeHosts, "ok", detection?.inScopeHosts, "Type the address in step 1")}
      {row("May be tested", scope.allowedPaths, "ok", detection?.allowedPaths)}
      {row("Never tested", scope.excludedPaths, "no", detection?.excludedPaths, "No exclusions")}
      <div className="grid gap-1.5 sm:grid-cols-[150px_1fr]">
        <p className="text-xs text-muted-foreground">Test categories</p>
        <p className="text-xs">{scope.allowedCategories.length} of {CATEGORIES.length} selected, change them under “Edit scope manually”.</p>
      </div>
    </div>
  );
}

/** What each real source returned, so the user can see nothing was made up. */
function DetectionResult({ d }: { d: ScopeDetection }) {
  const Icon = ({ ok, warn }: { ok: boolean; warn?: boolean }) =>
    ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : warn ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> : <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
  const time = new Date(d.checkedAt).toLocaleTimeString();
  if (d.mode === "address")
    return (
      <ul className="space-y-2 text-xs">
        <li className="flex gap-2">
          <Icon ok />
          <span>
            <span className="font-medium">Web address</span>, host <span className="font-mono">{d.host}</span> and path taken from what you typed.
          </span>
        </li>
      </ul>
    );
  return (
    <ul className="space-y-2 text-xs">
      <li className="flex gap-2">
        <Icon ok={d.dns?.status === "resolved" || d.dns?.status === "skipped"} warn />
        <span>
          <span className="font-medium">DNS lookup</span>, {" "}
          {d.dns?.status === "resolved" ? (
            <>
              the host exists and points to <span className="font-mono">{d.dns.addresses.join(", ")}</span>
            </>
          ) : (
            d.dns?.message
          )}
        </span>
      </li>
      <li className="flex gap-2">
        <Icon ok={d.robots?.status === "found"} warn={d.robots?.status === "error"} />
        <span>
          <span className="font-medium">robots.txt</span>, {d.robots?.status === "found" ? d.robots.message : `not used (${d.robots?.message})`}
          {!!d.robots?.unsupportedRules.length && (
            <span className="block text-muted-foreground">
              Not added (patterns AIVERA can't represent, review them yourself): <span className="font-mono">{d.robots.unsupportedRules.join("  ")}</span>
            </span>
          )}
        </span>
      </li>
      <li className="flex gap-2">
        <Icon ok={d.sitemap?.status === "found"} warn={d.sitemap?.status === "error"} />
        <span>
          <span className="font-medium">sitemap.xml</span>, {d.sitemap?.status === "found" ? d.sitemap.message : `not used (${d.sitemap?.message})`}
          {!!d.sitemap?.sections.length && (
            <span className="block text-muted-foreground">
              Public sections found: <span className="font-mono">{d.sitemap.sections.join("  ")}</span>
            </span>
          )}
        </span>
      </li>
      <li className="text-muted-foreground">Checked by the AIVERA server at {time}. Suggestions were added to the scope below.</li>
    </ul>
  );
}
