import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Check, ChevronDown, KeyRound, Monitor, Moon, RotateCcw, Sun, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyValue, SectionCard, UserChip } from "@/components/shared/display";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ChoiceCard, Field } from "@/components/forms/fields";
import { ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { CATEGORIES, REPORT_TEMPLATES, ROLE_META, SCAN_PROFILES } from "@/lib/constants";
import { can, permissionsFor, PERMISSION_LABELS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IS_API, settingsService } from "@/services";
import { useUIStore } from "@/stores/sessionStore";
import { DATA_MODE } from "@/services/api/contracts";
import type { ApplicationSettings, ScanProfile, ThemePreference } from "@/types";

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Pill switch for 2-3 options. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: typeof Sun }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors", value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.icon && <o.icon className="size-3.5" aria-hidden />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function useSection<K extends keyof ApplicationSettings>(k: K) {
  const value = useDataStore((s) => s.settings[k]);
  const update = (patch: Partial<ApplicationSettings[K]>, msg = "Setting saved") => {
    settingsService.update(k, patch);
    toast.success(msg);
  };
  return [value, update] as const;
}

export default function SettingsPage() {
  useDocumentTitle("Settings");
  const user = useCurrentUser();
  const isAdmin = can(user?.role, "manage_settings");
  const navigate = useNavigate();
  const seededAt = useDataStore((s) => s.seededAt);
  const [params, setParams] = useSearchParams();
  // Old links (?tab=account, ?tab=reports…) still land on the tab that now holds that section.
  const LEGACY: Record<string, string> = { account: "you", appearance: "you", notifications: "you", general: "workspace", security: "workspace", assessment: "workspace", reports: "workspace", integrations: "advanced" };
  const asked = params.get("tab") ?? "you";
  const mapped = LEGACY[asked] ?? asked;
  const tab = isAdmin && ["you", "workspace", "advanced"].includes(mapped) ? mapped : "you";
  const [general, setGeneral] = useSection("general");
  const [appearance, setAppearance] = useSection("appearance");
  const [table, setTable] = useSection("table");
  const [notif, setNotif] = useSection("notifications");
  const [security, setSecurity] = useSection("security");
  const [defaults, setDefaults] = useSection("assessmentDefaults");
  const [reports, setReports] = useSection("reports");
  const [integ, setInteg] = useSection("integrations");
  const [org, setOrg] = React.useState(general.organizationName);
  const [preparedBy, setPreparedBy] = React.useState(reports.preparedBy);
  const [baseUrl, setBaseUrl] = React.useState(integ.backendBaseUrl);
  const [resetOpen, setResetOpen] = React.useState(false);
  const ui = useUIStore();
  const adminOnly = !isAdmin;
  const perms = user ? permissionsFor(user.role) : [];

  const themes: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <ContentContainer className="max-w-5xl">
      <PageHeader title="Settings" />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        {isAdmin && (
          <TabsList>
            <TabsTrigger value="you">You</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="you" className="space-y-4">
          {user && (
            <SectionCard title="Account">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <UserChip user={user} />
                  <span className="truncate text-sm text-muted-foreground">{user.email}</span>
                  <ToneBadge tone={ROLE_META[user.role].tone}>{ROLE_META[user.role].label}</ToneBadge>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/login")}>Switch account</Button>
              </div>
              {perms.length > 0 && (
                <details className="group mt-4 rounded-xl border border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    What you can do
                    <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">{perms.length} <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden /></span>
                  </summary>
                  <ul className="grid gap-x-6 gap-y-1.5 border-t border-border px-3.5 py-3 text-xs sm:grid-cols-2">
                    {perms.map((p) => (
                      <li key={p} className="flex items-start gap-2"><Check className="mt-px size-3.5 shrink-0 text-success" aria-hidden />{PERMISSION_LABELS[p]}</li>
                    ))}
                  </ul>
                </details>
              )}
            </SectionCard>
          )}
          <SectionCard title="Display">
            <Row title="Theme">
              <Segmented label="Theme" value={appearance.theme} options={themes.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))} onChange={(v) => setAppearance({ theme: v }, `Theme: ${themes.find((t) => t.id === v)?.label}`)} />
            </Row>
            <Row title="Table rows">
              <Segmented label="Table density" value={appearance.density} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} onChange={(v) => setAppearance({ density: v })} />
            </Row>
            <Row title="Rows per page">
              <Select value={String(table.pageSize)} onValueChange={(v) => setTable({ pageSize: Number(v) })}>
                <SelectTrigger className="w-24" aria-label="Rows per page"><SelectValue /></SelectTrigger>
                <SelectContent>{[5, 10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
            <Row title="Reduce motion"><Switch checked={appearance.reduceMotion} onCheckedChange={(v) => setAppearance({ reduceMotion: v })} aria-label="Reduce motion" /></Row>
            <Row title="Hide secrets in evidence" description="Masks passwords, cookies and auth headers."><Switch checked={security.maskSensitiveEvidence} onCheckedChange={(v) => setSecurity({ maskSensitiveEvidence: v })} aria-label="Hide secrets in evidence" /></Row>
          </SectionCard>
          <SectionCard title="Help">
            <Row title="Simple menu" description="Only the main steps in the sidebar.">
              <Switch checked={ui.simpleMode} onCheckedChange={(v) => { ui.setSimpleMode(v); toast.success(v ? "Simple menu on" : "Showing all tools"); }} aria-label="Simple menu" />
            </Row>
            <Row title="Page tutorials">
              <div className="flex items-center gap-3">
                {ui.seenTours.length > 0 && (
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => { ui.resetTours(); toast.success("Tutorials will show again"); }}>Replay</button>
                )}
                <Switch checked={ui.tutorialsEnabled} onCheckedChange={(v) => { ui.setTutorialsEnabled(v); toast.success(v ? "Tutorials on" : "Tutorials off"); }} aria-label="Page tutorials" />
              </div>
            </Row>
            <Row title="Demo reminders">
              <Switch checked={ui.showDemoNotices} onCheckedChange={(v) => { ui.setShowDemoNotices(v); toast.success(v ? "Demo reminders shown" : "Demo reminders hidden"); }} aria-label="Demo reminders" />
            </Row>
          </SectionCard>
          <SectionCard title="Notify me when">
            <Row title="A serious finding is confirmed"><Switch checked={notif.findingUpdates} onCheckedChange={(v) => setNotif({ findingUpdates: v })} aria-label="A serious finding is confirmed" /></Row>
            <Row title="A scan finishes"><Switch checked={notif.scanEvents} onCheckedChange={(v) => setNotif({ scanEvents: v })} aria-label="A scan finishes" /></Row>
            <Row title="A fix is overdue"><Switch checked={notif.remediationDue} onCheckedChange={(v) => setNotif({ remediationDue: v })} aria-label="A fix is overdue" /></Row>
            <Row title="A report is ready"><Switch checked={notif.reportReady} onCheckedChange={(v) => setNotif({ reportReady: v })} aria-label="A report is ready" /></Row>
            <Row title="Show pop-up confirmations"><Switch checked={notif.toastsEnabled} onCheckedChange={(v) => setNotif({ toastsEnabled: v })} aria-label="Show pop-up confirmations" /></Row>
          </SectionCard>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="workspace" className="space-y-4">
          <SectionCard title="General">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="org" label="Organization name">
                <div className="flex gap-2">
                  <Input id="org" value={org} disabled={adminOnly} onChange={(e) => setOrg(e.target.value)} />
                  <Button variant="outline" disabled={adminOnly || org === general.organizationName || !org.trim()} onClick={() => setGeneral({ organizationName: org.trim() })}>Save</Button>
                </div>
              </Field>
              <Field id="tz" label="Timezone">
                <Select value={general.timezone} disabled={adminOnly} onValueChange={(v) => setGeneral({ timezone: v })}>
                  <SelectTrigger id="tz"><SelectValue /></SelectTrigger>
                  <SelectContent>{["local", "UTC", "Asia/Manila", "Europe/London", "America/New_York"].map((t) => <SelectItem key={t} value={t}>{t === "local" ? "Browser local time" : t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="df" label="Date format">
                <Select value={general.dateFormat} disabled={adminOnly} onValueChange={(v) => setGeneral({ dateFormat: v as ApplicationSettings["general"]["dateFormat"] })}>
                  <SelectTrigger id="df"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["MMM d, yyyy", "yyyy-MM-dd", "dd/MM/yyyy"] as const).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="New scan defaults">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="d-prof" label="Scan profile">
                <Select value={defaults.profile} disabled={adminOnly} onValueChange={(v) => setDefaults({ profile: v as ScanProfile })}>
                  <SelectTrigger id="d-prof"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(SCAN_PROFILES) as ScanProfile[]).map((p) => <SelectItem key={p} value={p}>{SCAN_PROFILES[p].label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="d-rps" label="Request rate (req/s)">
                <Select value={String(defaults.requestsPerSecond)} disabled={adminOnly} onValueChange={(v) => setDefaults({ requestsPerSecond: Number(v) })}>
                  <SelectTrigger id="d-rps"><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 5, 10, 20].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="d-time" label="Time limit">
                <Select value={String(defaults.timeLimitMinutes)} disabled={adminOnly} onValueChange={(v) => setDefaults({ timeLimitMinutes: Number(v) })}>
                  <SelectTrigger id="d-time"><SelectValue /></SelectTrigger>
                  <SelectContent>{[15, 30, 60, 120].map((n) => <SelectItem key={n} value={String(n)}>{n} min</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <p className="mt-4 mb-2 text-xs font-medium">Default categories</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CATEGORIES.map((c) => (
                <ChoiceCard key={c.id} disabled={adminOnly} checked={defaults.categories.includes(c.id)} onToggle={() => setDefaults({ categories: defaults.categories.includes(c.id) ? defaults.categories.filter((x) => x !== c.id) : [...defaults.categories, c.id] })} title={c.name} />
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Reports">
            <Row title="Default template">
              <Select value={reports.defaultTemplate} disabled={adminOnly} onValueChange={(v) => setReports({ defaultTemplate: v })}>
                <SelectTrigger className="w-60" aria-label="Default template"><SelectValue /></SelectTrigger>
                <SelectContent>{REPORT_TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
            <Row title="Add unverified items as an appendix"><Switch checked={reports.includeUnverifiedAppendix} disabled={adminOnly} onCheckedChange={(v) => setReports({ includeUnverifiedAppendix: v })} aria-label="Unverified appendix" /></Row>
            <Row title="“DEMO DATA” watermark"><Switch checked={reports.showDemoWatermark} disabled={adminOnly} onCheckedChange={(v) => setReports({ showDemoWatermark: v })} aria-label="Demo watermark" /></Row>
            <Row title="Prepared by">
              <div className="flex gap-2">
                <Input value={preparedBy} disabled={adminOnly} onChange={(e) => setPreparedBy(e.target.value)} className="w-60" aria-label="Prepared by" />
                <Button variant="outline" disabled={adminOnly || preparedBy === reports.preparedBy || !preparedBy.trim()} onClick={() => setReports({ preparedBy: preparedBy.trim() })}>Save</Button>
              </div>
            </Row>
          </SectionCard>
          <SectionCard title="Decision safeguards">
            <Row title="Ask for confirmation before confirming a vulnerability"><Switch checked={security.requireConfirmBeforeVerify} disabled={adminOnly} onCheckedChange={(v) => setSecurity({ requireConfirmBeforeVerify: v })} aria-label="Require confirmation" /></Row>
            <Row title="Require the “I checked the evidence” tick"><Switch checked={security.requireEvidenceReview} disabled={adminOnly} onCheckedChange={(v) => setSecurity({ requireEvidenceReview: v })} aria-label="Require evidence review" /></Row>
            <Row title="Sign out after inactivity">
              <Select value={String(security.idleLockMinutes)} disabled={adminOnly} onValueChange={(v) => setSecurity({ idleLockMinutes: Number(v) })}>
                <SelectTrigger className="w-32" aria-label="Idle lock"><SelectValue /></SelectTrigger>
                <SelectContent>{[0, 5, 15, 30, 60].map((n) => <SelectItem key={n} value={String(n)}>{n === 0 ? "Off" : `${n} min`}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
          </SectionCard>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="advanced" className="space-y-4">
          <SectionCard title="Connections" icon={KeyRound}>
            <p className="text-xs text-muted-foreground">API keys and passwords are never stored in the browser; they stay on the server.</p>
            <div className="mt-2">
              <Row title="Server address">
                <div className="flex gap-2">
                  <Input value={baseUrl} disabled={adminOnly} onChange={(e) => setBaseUrl(e.target.value)} className="w-72 font-mono text-xs" aria-label="Backend base URL" />
                  <Button variant="outline" disabled={adminOnly || baseUrl === integ.backendBaseUrl} onClick={() => { try { new URL(baseUrl); setInteg({ backendBaseUrl: baseUrl }); } catch { toast.error("Enter a valid URL"); } }}>Save</Button>
                </div>
              </Row>
              <Row title="AI service">
                <ToneBadge tone={integ.aiServiceMode === "api" ? "cyan" : "muted"}>{integ.aiServiceMode === "api" ? "Backend AI gateway" : "Demo (sample answers)"}</ToneBadge>
              </Row>
            </div>
          </SectionCard>
          <SectionCard title="Demo data">
            <dl className="grid gap-4 sm:grid-cols-3">
              <KeyValue label="Data mode"><ToneBadge tone="warning">{DATA_MODE === "demo" ? "Demo adapter" : "API"}</ToneBadge></KeyValue>
              <KeyValue label="Dataset initialised">{formatDateTime(seededAt)}</KeyValue>
              <KeyValue label="Storage key" mono>aegis-demo-state</KeyValue>
            </dl>
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-sev-critical/30 bg-sev-critical/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-sev-critical"><TriangleAlert className="size-4" /> Start over</p>
                <p className="text-xs text-muted-foreground">Deletes everything you added and restores the sample data.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)}><RotateCcw /> Reset demo data</Button>
            </div>
          </SectionCard>
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all demo data?"
        description={IS_API ? "This replaces everything in the database with the initial synthetic dataset and signs everyone out. This cannot be undone." : "This restores the initial synthetic dataset and discards every change made in this browser. This cannot be undone."}
        confirmLabel="Reset demo data"
        destructive
        onConfirm={async () => {
          await settingsService.resetDemo();
          if (IS_API) {
            toast.success("Database reset. Sign in again.");
            navigate("/login");
            return;
          }
          setOrg(useDataStore.getState().settings.general.organizationName);
          setPreparedBy(useDataStore.getState().settings.reports.preparedBy);
          setBaseUrl(useDataStore.getState().settings.integrations.backendBaseUrl);
          toast.success("Demo data reset to the initial dataset");
        }}
      />
    </ContentContainer>
  );
}
