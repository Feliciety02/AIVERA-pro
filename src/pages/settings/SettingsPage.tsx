import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { KeyRound, LogOut, Monitor, Moon, RotateCcw, Sun, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout, KeyValue, SectionCard, UserChip } from "@/components/shared/display";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ChoiceCard, Field } from "@/components/forms/fields";
import { ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { CATEGORIES, REPORT_TEMPLATES, ROLE_META, SCAN_PROFILES } from "@/lib/constants";
import { can, permissionsFor, PERMISSION_LABELS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { authService, IS_API, notificationService, settingsService } from "@/services";
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
  const signOut = authService.signOut;
  const seededAt = useDataStore((s) => s.seededAt);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? (isAdmin ? "general" : "appearance");
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

  const themes: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <ContentContainer className="max-w-5xl">
      <PageHeader title="Settings" description="Workspace and personal preferences for this demo. Stored in your browser only." />
      {adminOnly && <Callout>Some sections are read-only for your demo role. Appearance, notification and account preferences remain editable.</Callout>}
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security Preferences</TabsTrigger>
          <TabsTrigger value="assessment">Assessment Defaults</TabsTrigger>
          <TabsTrigger value="reports">Report Preferences</TabsTrigger>
          <TabsTrigger value="integrations">Integration Configuration</TabsTrigger>
          <TabsTrigger value="account">Account Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <SectionCard title="General">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="org" label="Organization name">
                <div className="flex gap-2">
                  <Input id="org" value={org} disabled={adminOnly} onChange={(e) => setOrg(e.target.value)} />
                  <Button variant="outline" disabled={adminOnly || org === general.organizationName || !org.trim()} onClick={() => setGeneral({ organizationName: org.trim() })}>Save</Button>
                </div>
              </Field>
              <Field id="tz" label="Timezone" hint="Applied to all timestamps in the app. Calendar dates (due dates, periods) don't shift.">
                <Select value={general.timezone} disabled={adminOnly} onValueChange={(v) => setGeneral({ timezone: v })}>
                  <SelectTrigger id="tz"><SelectValue /></SelectTrigger>
                  <SelectContent>{["local", "UTC", "Asia/Manila", "Europe/London", "America/New_York"].map((t) => <SelectItem key={t} value={t}>{t === "local" ? "Browser local time" : t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="df" label="Date format" hint="Applied to dates across tables, details and reports.">
                <Select value={general.dateFormat} disabled={adminOnly} onValueChange={(v) => setGeneral({ dateFormat: v as ApplicationSettings["general"]["dateFormat"] })}>
                  <SelectTrigger id="df"><SelectValue /></SelectTrigger>
                  <SelectContent>{(["MMM d, yyyy", "yyyy-MM-dd", "dd/MM/yyyy"] as const).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Demo data" description="Versioned demo dataset persisted in localStorage">
            <dl className="grid gap-4 sm:grid-cols-3">
              <KeyValue label="Data mode"><ToneBadge tone="warning">{DATA_MODE === "demo" ? "Demo adapter" : "API"}</ToneBadge></KeyValue>
              <KeyValue label="Dataset initialised">{formatDateTime(seededAt)}</KeyValue>
              <KeyValue label="Storage key" mono>aegis-demo-state</KeyValue>
            </dl>
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-sev-critical/30 bg-sev-critical/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-sev-critical"><TriangleAlert className="size-4" /> Reset Demo Data</p>
                <p className="text-xs text-muted-foreground">Restores the original synthetic dataset. All projects, targets, simulations, verifications, tasks and reports created in this browser are discarded.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)}><RotateCcw /> Reset demo data</Button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="appearance">
          <SectionCard title="Appearance">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Theme</p>
                <div className="grid grid-cols-3 gap-2 sm:w-96">
                  {themes.map((t) => (
                    <button key={t.id} type="button" onClick={() => setAppearance({ theme: t.id }, `Theme: ${t.label}`)} aria-pressed={appearance.theme === t.id} className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none", appearance.theme === t.id ? "border-primary/50 bg-primary/8 text-primary" : "border-border hover:border-ring/40")}>
                      <t.icon className="size-4" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Row title="Table density" description="Compact rows show more records per screen.">
                <Select value={appearance.density} onValueChange={(v) => setAppearance({ density: v as "comfortable" | "compact" })}>
                  <SelectTrigger className="w-40" aria-label="Density"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="comfortable">Comfortable</SelectItem><SelectItem value="compact">Compact</SelectItem></SelectContent>
                </Select>
              </Row>
              <Row title="Default rows per page" description="Applies to data tables.">
                <Select value={String(table.pageSize)} onValueChange={(v) => setTable({ pageSize: Number(v) })}>
                  <SelectTrigger className="w-40" aria-label="Rows per page"><SelectValue /></SelectTrigger>
                  <SelectContent>{[5, 10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </Row>
              <Row title="Reduce motion" description="Minimise animations and transitions.">
                <Switch checked={appearance.reduceMotion} onCheckedChange={(v) => setAppearance({ reduceMotion: v })} aria-label="Reduce motion" />
              </Row>
            </div>
          </SectionCard>
          <SectionCard title="Tutorials & help" className="mt-4" description="Saved in this browser only.">
            <Row title="Simple menu" description="Show only the main steps: Websites, Scans, Findings, Fixes and Reports. Turn off to see every tool.">
              <Switch checked={ui.simpleMode} onCheckedChange={(v) => { ui.setSimpleMode(v); toast.success(v ? "Simple menu on" : "Showing all tools"); }} aria-label="Simple menu" />
            </Row>
            <Row title="Show page tutorials" description="Step-by-step tips the first time you open each page.">
              <Switch checked={ui.tutorialsEnabled} onCheckedChange={(v) => { ui.setTutorialsEnabled(v); toast.success(v ? "Tutorials on" : "Tutorials off"); }} aria-label="Show page tutorials" />
            </Row>
            <Row title="Replay all tutorials" description={`You've finished ${ui.seenTours.length} tutorial${ui.seenTours.length === 1 ? "" : "s"}. Reset to see them again.`}>
              <Button variant="outline" size="sm" onClick={() => { ui.resetTours(); toast.success("Tutorials reset, they'll show again on each page"); }}>
                <RotateCcw /> Reset tutorials
              </Button>
            </Row>
            <Row title="Show demo mode reminders" description="The Demo chip, sidebar note and demo banners. Labels on simulated or imported records always stay.">
              <Switch checked={ui.showDemoNotices} onCheckedChange={(v) => { ui.setShowDemoNotices(v); toast.success(v ? "Demo reminders shown" : "Demo reminders hidden"); }} aria-label="Show demo mode reminders" />
            </Row>
          </SectionCard>
        </TabsContent>

        <TabsContent value="notifications">
          <SectionCard title="Notifications" description="Demo notifications generated from in-app events">
            <Row title="Finding updates" description="Notify when high/critical vulnerabilities are confirmed."><Switch checked={notif.findingUpdates} onCheckedChange={(v) => setNotif({ findingUpdates: v })} aria-label="Finding updates" /></Row>
            <Row title="Scan events" description="Notify when demo simulations finish."><Switch checked={notif.scanEvents} onCheckedChange={(v) => setNotif({ scanEvents: v })} aria-label="Scan events" /></Row>
            <Row title="Remediation due dates" description="Highlight overdue remediation tasks."><Switch checked={notif.remediationDue} onCheckedChange={(v) => setNotif({ remediationDue: v })} aria-label="Remediation due dates" /></Row>
            <Row title="Report ready" description="Notify when a demo report is generated."><Switch checked={notif.reportReady} onCheckedChange={(v) => setNotif({ reportReady: v })} aria-label="Report ready" /></Row>
            <Row title="Toast messages" description="Show transient confirmation toasts."><Switch checked={notif.toastsEnabled} onCheckedChange={(v) => setNotif({ toastsEnabled: v })} aria-label="Toast messages" /></Row>
            <div className="pt-3"><Button variant="outline" size="sm" onClick={async () => { await notificationService.test(); toast.info("Test notification added to the bell menu"); }}>Send test notification</Button></div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="security">
          <SectionCard title="Security preferences" description="Verification safeguards applied in the UI">
            <Row title="Require second confirmation before confirming a finding" description="Adds a final “Are you sure?” step."><Switch checked={security.requireConfirmBeforeVerify} disabled={adminOnly} onCheckedChange={(v) => setSecurity({ requireConfirmBeforeVerify: v })} aria-label="Require confirmation" /></Row>
            <Row title="Require evidence review for decisions" description="Confirm/Reject requires attesting evidence was reviewed."><Switch checked={security.requireEvidenceReview} disabled={adminOnly} onCheckedChange={(v) => setSecurity({ requireEvidenceReview: v })} aria-label="Require evidence review" /></Row>
            <Row title="Mask sensitive values in evidence" description="Hide Authorization headers, cookies and credential variables in evidence views."><Switch checked={security.maskSensitiveEvidence} onCheckedChange={(v) => setSecurity({ maskSensitiveEvidence: v })} aria-label="Mask sensitive evidence" /></Row>
            <Row title="Idle lock" description="Signs out of the demo persona after inactivity. Browser-only; real session expiry will be enforced by the backend.">
              <Select value={String(security.idleLockMinutes)} disabled={adminOnly} onValueChange={(v) => setSecurity({ idleLockMinutes: Number(v) })}>
                <SelectTrigger className="w-32" aria-label="Idle lock"><SelectValue /></SelectTrigger>
                <SelectContent>{[0, 5, 15, 30, 60].map((n) => <SelectItem key={n} value={String(n)}>{n === 0 ? "Off" : `${n} min`}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
          </SectionCard>
        </TabsContent>

        <TabsContent value="assessment">
          <SectionCard title="Assessment defaults" description="Pre-fill values for the scan wizard">
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
        </TabsContent>

        <TabsContent value="reports">
          <SectionCard title="Report preferences">
            <Row title="Default template">
              <Select value={reports.defaultTemplate} disabled={adminOnly} onValueChange={(v) => setReports({ defaultTemplate: v })}>
                <SelectTrigger className="w-60" aria-label="Default template"><SelectValue /></SelectTrigger>
                <SelectContent>{REPORT_TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
            <Row title="Include unverified appendix by default" description="Unverified observations are always clearly separated."><Switch checked={reports.includeUnverifiedAppendix} disabled={adminOnly} onCheckedChange={(v) => setReports({ includeUnverifiedAppendix: v })} aria-label="Unverified appendix" /></Row>
            <Row title="“DEMO DATA” watermark" description="Recommended while all reports come from demonstration data."><Switch checked={reports.showDemoWatermark} disabled={adminOnly} onCheckedChange={(v) => setReports({ showDemoWatermark: v })} aria-label="Demo watermark" /></Row>
            <Row title="Prepared by">
              <div className="flex gap-2">
                <Input value={preparedBy} disabled={adminOnly} onChange={(e) => setPreparedBy(e.target.value)} className="w-60" aria-label="Prepared by" />
                <Button variant="outline" disabled={adminOnly || preparedBy === reports.preparedBy || !preparedBy.trim()} onClick={() => setReports({ preparedBy: preparedBy.trim() })}>Save</Button>
              </div>
            </Row>
          </SectionCard>
        </TabsContent>

        <TabsContent value="integrations">
          <SectionCard title="Integration configuration" icon={KeyRound}>
            <Callout tone="warning" title="No secrets in the browser">API keys, scanner credentials and model tokens must never be stored in this frontend or in localStorage. They will be managed by the backend's secret storage. Only non-secret configuration is editable here.</Callout>
            <div className="mt-4 space-y-1">
              <Row title="Backend base URL" description="Used by the future API adapter. Not contacted in demo mode.">
                <div className="flex gap-2">
                  <Input value={baseUrl} disabled={adminOnly} onChange={(e) => setBaseUrl(e.target.value)} className="w-72 font-mono text-xs" aria-label="Backend base URL" />
                  <Button variant="outline" disabled={adminOnly || baseUrl === integ.backendBaseUrl} onClick={() => { try { new URL(baseUrl); setInteg({ backendBaseUrl: baseUrl }); } catch { toast.error("Enter a valid URL"); } }}>Save</Button>
                </div>
              </Row>
              <Row title="AI analysis service mode" description="The API mode becomes available once the backend AI gateway exists.">
                <Select value={integ.aiServiceMode} disabled>
                  <SelectTrigger className="w-60" aria-label="AI mode"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="demo">Demo adapter (predefined samples)</SelectItem><SelectItem value="api">Backend AI gateway</SelectItem></SelectContent>
                </Select>
              </Row>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="account">
          <SectionCard title="Account preferences">
            {user && (
              <div className="space-y-4">
                <UserChip user={user} showTitle />
                <dl className="grid gap-4 sm:grid-cols-3">
                  <KeyValue label="Email">{user.email}</KeyValue>
                  <KeyValue label="Role"><ToneBadge tone={ROLE_META[user.role].tone}>{ROLE_META[user.role].label}</ToneBadge></KeyValue>
                  <KeyValue label="Status">{user.status}</KeyValue>
                </dl>
                <div>
                  <p className="mb-1.5 text-xs font-medium">Your demo permissions</p>
                  <div className="flex flex-wrap gap-1">{permissionsFor(user.role).length ? permissionsFor(user.role).map((p) => <ToneBadge key={p} tone="muted">{PERMISSION_LABELS[p]}</ToneBadge>) : <span className="text-xs text-muted-foreground">Read-only access</span>}</div>
                </div>
                <Callout>Password and MFA management are not available: this is a demo persona without real credentials. Account security will be handled by the backend identity service.</Callout>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("/login")}>Switch demo account</Button>
                  <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate("/login"); }}><LogOut /> Sign out</Button>
                </div>
              </div>
            )}
          </SectionCard>
        </TabsContent>
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
