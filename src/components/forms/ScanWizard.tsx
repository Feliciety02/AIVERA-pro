import * as React from "react";
import { FlaskConical, Globe, Loader2, Network, Play, Radar, ScanSearch, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChoiceCard, Field } from "./fields";
import { ChoiceChips } from "./choices";
import { CATEGORIES, SCAN_PROFILES, TOOL_META } from "@/lib/constants";
import { ACTIVE_SCAN_ACTIVITY, AUTH_SCAN_ACTIVITY, TOOL_ACTIVITY, hasActivity, isLoopbackUrl, missingScanActivities, standardScanActivities, toolPermitted, type LiveTool } from "@/features/scanPermissions";
import { IS_API, automationService, targetService, type ScanCredentialStatus } from "@/services";
import { cn } from "@/lib/utils";
import type { ApplicationSettings, AssessmentCategoryId, OutputFormat, Project, ScanConfig, ScanProfile, ScanTool, Target } from "@/types";

const TOOL_ICONS: Record<ScanTool, typeof Network> = { nmap: Network, owasp_zap: ScanSearch, dns_utils: Globe, http_inspector: Radar };
/** Tools the AIVERA server can really run. */
const LIVE_TOOLS: LiveTool[] = ["nmap", "owasp_zap", "http_inspector"];
const isLive = (t: ScanTool): t is LiveTool => (LIVE_TOOLS as ScanTool[]).includes(t);

export interface ScanWizardResult {
  name: string;
  projectId: string;
  targetId: string;
  config: ScanConfig;
}

/**
 * One screen instead of six steps: pick the website (its project comes with it), tick that you'll stay
 * in scope, choose how deep to go, and start. Tuning lives under "More settings".
 */
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
  /** Re-checks whether live scanning is enabled on the server. */
  onCheckLive?: () => void;
  onStart: (r: ScanWizardResult) => Promise<void>;
  onSimulate: (r: ScanWizardResult) => Promise<void>;
  onCancel: () => void;
}) {
  const activeProjectIds = new Set(projects.filter((p) => p.status !== "archived").map((p) => p.id));
  const isReady = (t: Target) => t.authorizationStatus === "authorized" && t.authorizationConfirmed && !!t.projectId && activeProjectIds.has(t.projectId);
  const choices = targets.filter((t) => t.projectId && activeProjectIds.has(t.projectId));
  const firstReady = choices.find((t) => isReady(t) && (!initialProjectId || t.projectId === initialProjectId)) ?? choices.find(isReady);

  const [targetId, setTargetId] = React.useState(initialTargetId ?? firstReady?.id ?? "");
  const [scopeConfirmed, setScopeConfirmed] = React.useState(false);
  const [tools, setTools] = React.useState<ScanTool[]>(IS_API ? ["nmap", "owasp_zap"] : ["owasp_zap", "http_inspector"]);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [credential, setCredential] = React.useState<ScanCredentialStatus>({ configured: false });
  const [categories, setCategories] = React.useState<AssessmentCategoryId[]>(defaults.categories);
  const [profile, setProfile] = React.useState<ScanProfile>(defaults.profile);
  const [timeLimit, setTimeLimit] = React.useState(defaults.timeLimitMinutes);
  const [rps, setRps] = React.useState(defaults.requestsPerSecond);
  const [concurrency, setConcurrency] = React.useState(2);
  const [format, setFormat] = React.useState<OutputFormat>("json");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const target = targets.find((t) => t.id === targetId);
  const project = projects.find((p) => p.id === target?.projectId);
  const authorized = !!target && isReady(target);
  const localCopy = !!target && isLoopbackUrl(target.url);
  const effectiveCategories = categories.filter((c) => target?.scope.allowedCategories.includes(c));

  // Only offer scan depths this website allows.
  const profiles = (Object.keys(SCAN_PROFILES) as ScanProfile[]).filter((p) => {
    if (p === "thorough") return !IS_API && target?.environment === "lab";
    if (p === "standard" && IS_API) return localCopy;
    return true;
  });
  React.useEffect(() => {
    if (!profiles.includes(profile)) setProfile(profiles.includes("baseline") ? "baseline" : profiles[0]!);
  }, [profiles.join(), liveAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!target) return;
    setScopeConfirmed(false);
    setName(`${target.name} scan`);
    setCategories((cs) => (cs.filter((c) => target.scope.allowedCategories.includes(c)).length ? cs : target.scope.allowedCategories));
    if (!IS_API) return;
    // Offer the server tools this website's scope allows, plus the standard ones AIVERA adds itself.
    const allowed = LIVE_TOOLS.filter((t) => toolPermitted(t, [...target.scope.allowedActivities, ...missingScanActivities(target.url, target.scope.allowedActivities)]));
    if (allowed.length) setTools(allowed);
    setAuthenticated(false);
    void automationService.credential(target.id).then(setCredential).catch(() => setCredential({ configured: false }));
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => onCheckLive?.(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Why a real run can't start yet, each with a one-click fix where possible.
  const liveTools = tools.filter(isLive);
  const unsupportedTools = tools.filter((t) => !isLive(t));
  const liveBlockers: { text: string; fix?: { label: string; run: () => void } }[] = [];
  if (!IS_API) liveBlockers.push({ text: "Real scans need the full app with the AIVERA server (npm run dev:full). Here you can run a practice scan." });
  else if (!liveAvailable) liveBlockers.push({ text: "Live scanning is turned off on the AIVERA server (AIVERA_LIVE_SCANS_ENABLED and AIVERA_ALLOWED_SCAN_HOSTS in server/.env)." });
  if (IS_API && unsupportedTools.length)
    liveBlockers.push({ text: `Real scans can't use ${unsupportedTools.map((t) => TOOL_META[t].label).join(", ")} yet.`, fix: { label: "Remove it", run: () => setTools(liveTools.length ? liveTools : ["owasp_zap"]) } });
  if (IS_API && profile === "standard" && target) {
    if (!hasActivity(ACTIVE_SCAN_ACTIVITY, target.scope.allowedActivities)) liveBlockers.push({ text: `Standard needs "${ACTIVE_SCAN_ACTIVITY}" allowed in the website's scope.`, fix: { label: "Use Baseline", run: () => setProfile("baseline") } });
    if (!tools.includes("owasp_zap")) liveBlockers.push({ text: "Standard needs OWASP ZAP.", fix: { label: "Add ZAP", run: () => setTools([...tools, "owasp_zap"]) } });
  }
  if (IS_API && authenticated && target) {
    if (!hasActivity(AUTH_SCAN_ACTIVITY, target.scope.allowedActivities)) liveBlockers.push({ text: `Signed-in scans need "${AUTH_SCAN_ACTIVITY}" allowed in the website's scope.`, fix: { label: "Scan signed out", run: () => setAuthenticated(false) } });
    else if (!credential.configured) liveBlockers.push({ text: "No test-account session is saved for this website. Add one on the website's page.", fix: { label: "Scan signed out", run: () => setAuthenticated(false) } });
  }
  // Standard activities the chosen tools need are added to the scope automatically when the scan
  // starts. Only a tool AIVERA deliberately leaves out (port scanning on shared hosting) blocks.
  const autoAdd = target ? missingScanActivities(target.url, target.scope.allowedActivities).filter((a) => liveTools.some((t) => TOOL_ACTIVITY[t] === a)) : [];
  if (IS_API && target)
    for (const t of liveTools)
      if (!toolPermitted(t, [...target.scope.allowedActivities, ...autoAdd])) {
        const why = standardScanActivities(target.url).leftOut.find((l) => l.activity === TOOL_ACTIVITY[t])?.reason;
        liveBlockers.push({ text: why ?? `The website's scope doesn't allow "${TOOL_ACTIVITY[t]}", which ${TOOL_META[t].label} needs.`, fix: { label: `Remove ${TOOL_META[t].label}`, run: () => setTools(tools.filter((x) => x !== t)) } });
      }

  const formError = !target ? "Choose a website." : !authorized ? "This website's permission isn't confirmed, so it can't be scanned." : !tools.length ? "Pick at least one tool." : !effectiveCategories.length ? "Pick at least one test category under More settings." : !name.trim() ? "Name the scan under More settings." : !scopeConfirmed ? "Tick the scope box to start." : null;
  const canLive = !formError && liveBlockers.length === 0;

  const result: ScanWizardResult = {
    name: name.trim(),
    projectId: target?.projectId ?? "",
    targetId,
    config: { tools, categories: effectiveCategories, profile, timeLimitMinutes: timeLimit, requestsPerSecond: rps, maxConcurrency: concurrency, outputFormat: format, respectExclusions: true, scopeConfirmed, ...(IS_API && authenticated ? { authenticated: true } : {}) },
  };
  const run = (fn: (r: ScanWizardResult) => Promise<void>) => async () => {
    setBusy(true);
    try {
      if (IS_API && target && autoAdd.length) await targetService.updateScope(target.id, { ...target.scope, allowedActivities: [...target.scope.allowedActivities, ...autoAdd] });
      await fn(result);
    } finally {
      setBusy(false);
    }
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toolOptions = (Object.keys(TOOL_META) as ScanTool[]).filter((t) => !IS_API || isLive(t));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <Field id="scan-target" label="Website">
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id="scan-target"><SelectValue placeholder="Choose a website" /></SelectTrigger>
              <SelectContent>
                {choices.map((t) => (
                  <SelectItem key={t.id} value={t.id} disabled={!isReady(t)}>
                    {t.name} {isReady(t) ? "" : "(permission not confirmed)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {target && authorized && (
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm", scopeConfirmed ? "border-primary/40 bg-primary/5" : "border-border")}>
              <Checkbox checked={scopeConfirmed} onCheckedChange={(v) => setScopeConfirmed(v === true)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block font-medium">Only test inside the approved scope</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Hosts <span className="font-mono text-foreground">{target.scope.inScopeHosts.join(", ")}</span>
                  {target.scope.excludedPaths.length > 0 && <> · never <span className="font-mono text-foreground">{target.scope.excludedPaths.join(", ")}</span></>}
                  {project && <> · project {project.name}</>}
                </span>
              </span>
            </label>
          )}

          <Field id="scan-depth" label="How deep?" hint={SCAN_PROFILES[profile].description}>
            <ChoiceChips label="Scan depth" value={profile} options={profiles.map((p) => ({ value: p, label: SCAN_PROFILES[p].label }))} onChange={setProfile} />
          </Field>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Tools</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tools">
              {toolOptions.map((t) => {
                const Icon = TOOL_ICONS[t];
                const on = tools.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => setTools(toggle(tools, t))} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors", on ? "border-primary/50 bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    <Icon className="size-3.5" aria-hidden /> {TOOL_META[t].label}
                  </button>
                );
              })}
            </div>
          </div>

          {target && (
            <details className="group rounded-xl border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                More settings <span className="text-xs font-normal text-muted-foreground">{rps} req/s · {timeLimit} min · {effectiveCategories.length} categories</span>
              </summary>
              <div className="space-y-4 border-t border-border p-3.5">
                <Field id="scan-name" label="Scan name"><Input id="scan-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field id="rps" label="Request rate">
                    <Select value={String(rps)} onValueChange={(v) => setRps(Number(v))}>
                      <SelectTrigger id="rps"><SelectValue /></SelectTrigger>
                      <SelectContent>{[...new Set([1, 2, 5, 10, 20, rps])].sort((a, b) => a - b).map((n) => <SelectItem key={n} value={String(n)}>{n} req/s{n <= 2 ? " (gentle)" : ""}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field id="time" label="Time limit">
                    <Select value={String(timeLimit)} onValueChange={(v) => setTimeLimit(Number(v))}>
                      <SelectTrigger id="time"><SelectValue /></SelectTrigger>
                      <SelectContent>{[...new Set([5, 15, 30, 60, 120, 240, timeLimit])].sort((a, b) => a - b).map((n) => <SelectItem key={n} value={String(n)}>{n < 60 ? `${n} min` : `${n / 60} h`}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field id="conc" label="Parallel requests">
                    <Select value={String(concurrency)} onValueChange={(v) => setConcurrency(Number(v))}>
                      <SelectTrigger id="conc"><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field id="fmt" label="Output">
                    <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                      <SelectTrigger id="fmt"><SelectValue /></SelectTrigger>
                      <SelectContent>{(["json", "xml", "html"] as OutputFormat[]).map((f) => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
                {IS_API && (
                  <label className="flex items-start gap-2.5 text-sm">
                    <Checkbox checked={authenticated} onCheckedChange={(v) => setAuthenticated(v === true)} className="mt-0.5" />
                    <span>Scan as the test account <span className="block text-xs text-muted-foreground">{credential.configured ? `Uses the saved ${credential.headerName} session${credential.label ? ` (${credential.label})` : ""}.` : "No session saved yet."}</span></span>
                  </label>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Test categories</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CATEGORIES.filter((c) => target.scope.allowedCategories.includes(c.id)).map((c) => (
                      <ChoiceCard key={c.id} checked={categories.includes(c.id)} onToggle={() => setCategories(toggle(categories, c.id))} title={c.name} />
                    ))}
                  </div>
                </div>
              </div>
            </details>
          )}

          {target && authorized && liveBlockers.length > 0 && (IS_API || !formError) && (
            <ul className="space-y-1.5 rounded-xl bg-muted/50 px-3.5 py-3 text-xs">
              {liveBlockers.map((b) => (
                <li key={b.text} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {IS_API ? <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden /> : <FlaskConical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0 flex-1">{b.text}</span>
                  {b.fix && <Button size="sm" variant="outline" className="h-7" onClick={b.fix.run}>{b.fix.label}</Button>}
                </li>
              ))}
            </ul>
          )}
          {canLive && target && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-success" aria-hidden /> {liveTools.map((t) => TOOL_META[t].label).join(" and ")} will run on {target.name}.{autoAdd.length ? ` AIVERA also allows ${autoAdd.map((a) => `“${a}”`).join(" and ")} in its scope.` : ""} Results wait for your review.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {formError && <span className="text-xs text-muted-foreground sm:mr-2">{formError}</span>}
          {IS_API ? (
            <Button disabled={busy || !canLive} onClick={run(onStart)}>{busy ? <Loader2 className="animate-spin" /> : <Play />} Start scan</Button>
          ) : (
            <Button disabled={busy || !!formError} onClick={run(onSimulate)}>{busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Run practice scan</Button>
          )}
        </div>
      </div>
    </div>
  );
}
