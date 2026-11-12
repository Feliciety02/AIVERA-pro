import * as React from "react";
import { ArrowLeft, ArrowRight, FlaskConical, Globe, Loader2, Network, Play, Radar, ScanSearch, ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout, KeyValue } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge, ToneBadge, ToolBadge } from "@/components/security/badges";
import { ChoiceCard, Field, Steps } from "./fields";
import { AUTHORIZATION_STATUS, CATEGORIES, ENVIRONMENTS, SCAN_PROFILES, TOOL_META } from "@/lib/constants";
import { TOOL_ACTIVITY, toolPermitted, type LiveTool } from "@/features/scanPermissions";
import { IS_API } from "@/services";
import type { ApplicationSettings, AssessmentCategoryId, OutputFormat, Project, ScanConfig, ScanProfile, ScanTool, Target } from "@/types";

const STEPS = ["Select Project", "Select Target", "Confirm Scope", "Select Tools", "Configure", "Review & Confirm"];
const TOOL_ICONS: Record<ScanTool, typeof Network> = { nmap: Network, owasp_zap: ScanSearch, dns_utils: Globe, http_inspector: Radar };

export interface ScanWizardResult {
  name: string;
  projectId: string;
  targetId: string;
  config: ScanConfig;
}

export function ScanWizard({
  projects,
  targets,
  defaults,
  initialProjectId,
  initialTargetId,
  liveAvailable,
  onCheckLive,
  onStart,
  onSimulate,
  onCancel,
}: {
  projects: Project[];
  targets: Target[];
  defaults: ApplicationSettings["assessmentDefaults"];
  initialProjectId?: string;
  initialTargetId?: string;
  liveAvailable: boolean;
  /** Re-checks whether live scanning is enabled on the server (called on the review step). */
  onCheckLive?: () => void;
  onStart: (r: ScanWizardResult) => Promise<void>;
  onSimulate: (r: ScanWizardResult) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = React.useState(initialTargetId ? 2 : initialProjectId ? 1 : 0);
  const [projectId, setProjectId] = React.useState(initialProjectId ?? "");
  const [targetId, setTargetId] = React.useState(initialTargetId ?? "");
  const [scopeConfirmed, setScopeConfirmed] = React.useState(false);
  // The full app can only run Nmap and OWASP ZAP, so those are the defaults there.
  const [tools, setTools] = React.useState<ScanTool[]>(IS_API ? ["nmap", "owasp_zap"] : ["owasp_zap", "http_inspector"]);
  const [categories, setCategories] = React.useState<AssessmentCategoryId[]>(defaults.categories);
  const [profile, setProfile] = React.useState<ScanProfile>(defaults.profile);
  const [timeLimit, setTimeLimit] = React.useState(defaults.timeLimitMinutes);
  const [rps, setRps] = React.useState(defaults.requestsPerSecond);
  const [concurrency, setConcurrency] = React.useState(2);
  const [format, setFormat] = React.useState<OutputFormat>("json");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (liveAvailable) {
      setProfile((current) => current === "standard" || current === "thorough" ? "baseline" : current);
    }
  }, [liveAvailable]);

  const activeProjects = projects.filter((p) => p.status !== "archived");
  const project = projects.find((p) => p.id === projectId);
  const projectTargets = targets.filter((t) => t.projectId === projectId);
  const target = targets.find((t) => t.id === targetId);
  const authorized = !!target && target.authorizationStatus === "authorized" && target.authorizationConfirmed;
  const effectiveCategories = categories.filter((c) => target?.scope.allowedCategories.includes(c));
  // Why the automated run can't start yet, each with a one-click fix where possible.
  const liveTools = tools.filter((t): t is LiveTool => t === "nmap" || t === "owasp_zap");
  const unsupportedTools = tools.filter((t) => t !== "nmap" && t !== "owasp_zap");
  const liveBlockers: { text: string; fix?: { label: string; run: () => void } }[] = [];
  if (!IS_API) liveBlockers.push({ text: "Automated runs need the full app with the AIVERA server (npm run dev:full). Demo mode runs only in this browser." });
  else if (!liveAvailable) liveBlockers.push({ text: "Live scanning is turned off on the AIVERA server (AIVERA_LIVE_SCANS_ENABLED and AIVERA_ALLOWED_SCAN_HOSTS in server/.env)." });
  if (unsupportedTools.length)
    liveBlockers.push({
      text: `Automated runs only use Nmap and OWASP ZAP. Not supported: ${unsupportedTools.map((t) => TOOL_META[t].label).join(", ")}.`,
      fix: { label: "Use Nmap and ZAP only", run: () => setTools(liveTools.length ? liveTools : ["nmap", "owasp_zap"]) },
    });
  if (profile !== "passive" && profile !== "baseline") liveBlockers.push({ text: `The ${SCAN_PROFILES[profile].label} profile isn't available for automated runs.`, fix: { label: "Switch to Baseline", run: () => setProfile("baseline") } });
  for (const t of liveTools)
    if (target && !toolPermitted(t, target.scope.allowedActivities)) liveBlockers.push({ text: `The target's scope doesn't allow "${TOOL_ACTIVITY[t]}", which ${TOOL_META[t].label} needs. Edit the target's scope to allow it.` });
  const liveConfigValid = liveBlockers.length === 0;

  React.useEffect(() => {
    if (step === 5) onCheckLive?.();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (target) setCategories((cs) => cs.filter((c) => target.scope.allowedCategories.includes(c)).length ? cs : target.scope.allowedCategories);
  }, [target]);
  React.useEffect(() => {
    if (target && !name) setName(`${target.name} assessment`);
  }, [target, name]);

  const errors: Record<number, string | null> = {
    0: projectId ? null : "Select a project to continue.",
    1: !targetId ? "Select a target to continue." : !authorized ? "This target is not authorized/confirmed and cannot be assessed." : null,
    2: scopeConfirmed ? null : "Confirm the approved scope to continue.",
    3: tools.length ? null : "Select at least one tool.",
    4: !effectiveCategories.length ? "Select at least one category permitted by the target scope." : rps < 1 || rps > 20 ? "Request rate must be between 1 and 20 req/s." : timeLimit < 5 || timeLimit > 240 ? "Time limit must be 5 to 240 minutes." : !name.trim() ? "Name the assessment run." : null,
    5: null,
  };
  const canNext = !errors[step];

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const result: ScanWizardResult = {
    name: name.trim(),
    projectId,
    targetId,
    config: { tools, categories: effectiveCategories, profile, timeLimitMinutes: timeLimit, requestsPerSecond: rps, maxConcurrency: concurrency, outputFormat: format, respectExclusions: true, scopeConfirmed },
  };

  return (
    <div className="space-y-5">
      <Steps steps={STEPS} current={step} onSelect={setStep} />
      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Step 1 · Select assessment project</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {activeProjects.map((p) => (
                  <ChoiceCard key={p.id} checked={projectId === p.id} onToggle={() => { setProjectId(p.id); setTargetId(""); setScopeConfirmed(false); }} title={p.name} description={`${p.code} · ${targets.filter((t) => t.projectId === p.id).length} target(s)`} />
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Step 2 · Select authorized target</h2>
              {projectTargets.length === 0 ? (
                <EmptyState compact title="No targets in this project" description="Register an authorized target first." />
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {projectTargets.map((t) => {
                    const ok = t.authorizationStatus === "authorized" && t.authorizationConfirmed;
                    return (
                      <ChoiceCard
                        key={t.id}
                        checked={targetId === t.id}
                        disabled={!ok}
                        onToggle={() => { setTargetId(t.id); setScopeConfirmed(false); }}
                        title={t.name}
                        description={`${t.url} · ${ENVIRONMENTS[t.environment]}`}
                        badge={<StatusBadge status={t.authorizationStatus} map={AUTHORIZATION_STATUS} />}
                      />
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Targets without confirmed authorization are disabled and cannot be selected.</p>
            </div>
          )}

          {step === 2 && target && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold">Step 3 · Confirm scope</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3.5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary"><ShieldCheck className="size-3.5" /> In scope</p>
                  <dl className="space-y-2.5">
                    <KeyValue label="Hosts" mono>{target.scope.inScopeHosts.join(", ")}</KeyValue>
                    <KeyValue label="Allowed paths" mono>{target.scope.allowedPaths.join(", ")}</KeyValue>
                    <KeyValue label="Allowed activities">{target.scope.allowedActivities.join("; ") || "N/A"}</KeyValue>
                  </dl>
                </div>
                <div className="rounded-lg border border-sev-critical/25 bg-sev-critical/[0.04] p-3.5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-sev-critical"><ShieldOff className="size-3.5" /> Excluded / restricted</p>
                  <dl className="space-y-2.5">
                    <KeyValue label="Excluded paths" mono>{target.scope.excludedPaths.join(", ") || "none"}</KeyValue>
                    <KeyValue label="Restricted activities">{target.scope.restrictedActivities.join("; ")}</KeyValue>
                  </dl>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Authorization reference: <span className="font-mono text-foreground">{target.authorizationReference}</span>. Testing notes: {target.testingNotes || "N/A"}</p>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <Checkbox id="scope-ok" checked={scopeConfirmed} onCheckedChange={(v) => setScopeConfirmed(v === true)} className="mt-0.5" />
                <Label htmlFor="scope-ok" className="text-sm leading-snug">I have reviewed the approved scope and will keep all activity within it. Exclusions take precedence over allowed paths.</Label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Step 4 · Select security tools</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {(Object.keys(TOOL_META) as ScanTool[]).map((t) => {
                  const Icon = TOOL_ICONS[t];
                  // In the full app only tools the server can really run are offered.
                  const runnable = !IS_API || t === "nmap" || t === "owasp_zap";
                  return (
                    <ChoiceCard
                      key={t}
                      checked={runnable && tools.includes(t)}
                      disabled={!runnable}
                      onToggle={() => setTools(toggle(tools, t))}
                      icon={<Icon className="mt-0.5 size-4 shrink-0 text-cyan" />}
                      title={TOOL_META[t].label}
                      description={runnable ? TOOL_META[t].description : "Not available for real scans yet. Nmap and OWASP ZAP cover these checks."}
                      badge={<ToneBadge tone="muted">{TOOL_META[t].kind}</ToneBadge>}
                    />
                  );
                })}
              </div>
              {!IS_API && <p className="text-[11px] text-muted-foreground">Demo mode: selections only shape the practice simulation.</p>}
            </div>
          )}

          {step === 4 && target && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold">Step 5 · Configure assessment</h2>
              <Field id="scan-name" label="Run name" required>
                <Input id="scan-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="space-y-2">
                <p className="text-xs font-medium">Assessment categories (limited to the target's approved scope)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CATEGORIES.map((c) => {
                    const allowed = target.scope.allowedCategories.includes(c.id);
                    return <ChoiceCard key={c.id} checked={allowed && categories.includes(c.id)} disabled={!allowed} onToggle={() => setCategories(toggle(categories, c.id))} title={c.name} description={allowed ? c.description : "Not permitted by target scope"} />;
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field id="profile" label="Preferred scan profile" hint={SCAN_PROFILES[profile].description}>
                  <Select value={profile} onValueChange={(v) => setProfile(v as ScanProfile)}>
                    <SelectTrigger id="profile"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SCAN_PROFILES) as ScanProfile[]).map((p) => (
                        <SelectItem key={p} value={p} disabled={p === "thorough" && target.environment !== "lab"}>
                          {SCAN_PROFILES[p].label}{p === "thorough" && target.environment !== "lab" ? " (lab only)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="rps" label="Request rate limit (req/s)" hint="1 to 20. Respect the owner's agreed limit.">
                  <Input id="rps" type="number" min={1} max={20} value={rps} onChange={(e) => setRps(Number(e.target.value))} />
                </Field>
                <Field id="time" label="Time limit (minutes)" hint="5 to 240">
                  <Input id="time" type="number" min={5} max={240} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} />
                </Field>
                <Field id="conc" label="Max concurrency">
                  <Select value={String(concurrency)} onValueChange={(v) => setConcurrency(Number(v))}>
                    <SelectTrigger id="conc"><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field id="fmt" label="Output format">
                  <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                    <SelectTrigger id="fmt"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["json", "xml", "html"] as OutputFormat[]).map((f) => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Scope restrictions</p>
                  <p className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-primary">
                    <ShieldCheck className="size-3.5" /> Exclusions enforced (always on)
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 5 && project && target && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold">Step 6 · Review and confirm</h2>
              <dl className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
                <KeyValue label="Run name">{name}</KeyValue>
                <KeyValue label="Project">{project.code} · {project.name}</KeyValue>
                <KeyValue label="Target">{target.name}<span className="block font-mono text-[11px] text-muted-foreground">{target.url}</span></KeyValue>
                <KeyValue label="Tools"><span className="flex flex-wrap gap-1">{tools.map((t) => <ToolBadge key={t} tool={t} />)}</span></KeyValue>
                <KeyValue label="Categories">{effectiveCategories.map((c) => CATEGORIES.find((x) => x.id === c)?.short).join(", ")}</KeyValue>
                <KeyValue label="Profile">{SCAN_PROFILES[profile].label}</KeyValue>
                <KeyValue label="Limits">{rps} req/s · {timeLimit} min · concurrency {concurrency}</KeyValue>
                <KeyValue label="Output">{format.toUpperCase()}</KeyValue>
                <KeyValue label="Scope">{target.scope.inScopeHosts.length} host(s), {target.scope.excludedPaths.length} exclusion(s), confirmed</KeyValue>
              </dl>
              {liveConfigValid ? (
                <Callout tone="info" icon={ShieldCheck} title="Ready for an automated assessment">
                  {liveTools.map((t) => TOOL_META[t].label).join(" and ")} will run against {target.name} inside its approved scope. ZAP explores for about a minute and only runs passive checks. Results arrive as Pending Verification.
                </Callout>
              ) : (
                <Callout tone="warning" icon={TriangleAlert} title="Start Automated Assessment is not available yet">
                  <ul className="mt-1 space-y-2">
                    {liveBlockers.map((b) => (
                      <li key={b.text} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{b.text}</span>
                        {b.fix && (
                          <Button size="sm" variant="outline" className="h-7 bg-card" onClick={b.fix.run}>
                            {b.fix.label}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!IS_API && <p className="mt-2">Demo simulation is always available, but its results are practice data, not evidence.</p>}
                </Callout>
              )}
            </div>
          )}

          {errors[step] && step !== 5 && <p className="text-xs text-sev-medium">{errors[step]}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={step === 0 ? onCancel : () => setStep(step - 1)} disabled={busy}>
          <ArrowLeft /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 5 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant={liveConfigValid ? "default" : "outline"} disabled={busy || !liveConfigValid} onClick={async () => {
              setBusy(true);
              try { await onStart(result); } finally { setBusy(false); }
            }}>
              <Play /> Start Automated Assessment
            </Button>
            {!IS_API && (
            <Button
              variant={liveConfigValid ? "outline" : "default"}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSimulate(result);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Run Demo Simulation
            </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
