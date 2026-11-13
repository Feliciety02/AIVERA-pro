import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { Link, useNavigate, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Ban, CircleCheck, FileUp, Globe, Loader2, Pencil, Radar, ShieldCheck, ShieldOff, ShieldAlert, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard, KeyValue, Callout, MiniStat, UserChip } from "@/components/shared/display";
import { NotFoundState, EmptyState } from "@/components/shared/states";
import { StatusBadge, OriginBadge, ToneBadge, ToolBadge } from "@/components/security/badges";
import { FindingRow } from "@/components/dashboard/widgets";
import { ScopeEditor } from "@/components/forms/ScopeEditor";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { ASSET_TYPES, AUTHORIZATION_STATUS, CATEGORIES, ENVIRONMENTS, SCAN_STATUS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { IS_API, targetService } from "@/services";
import { ToolImportDialog } from "@/components/forms/ToolImportDialog";
import { QuickScanCard } from "@/components/security/QuickScanCard";
import { ScanAutomationCard } from "@/components/security/ScanAutomationCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { TargetScope } from "@/types";

export default function TargetDetailPage() {
  const navigate = useNavigate();
  const { targetId } = useParams();
  const user = useCurrentUser();
  const canManage = can(user?.role, "manage_targets");
  const lookups = useLookups();
  const target = useDataStore((s) => s.targets.find((t) => t.id === targetId));
  useDocumentTitle(target?.name ?? "Target");
  const all = useDataStore(useShallow((s) => ({ findings: s.findings, scans: s.scans, hosts: s.hosts, endpoints: s.endpoints, dns: s.dnsRecords })));
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<TargetScope | null>(null);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  if (!target)
    return (
      <ContentContainer>
        <NotFoundState entity="Target" backTo="/targets" backLabel="Back to targets" />
      </ContentContainer>
    );

  const findings = all.findings.filter((f) => f.targetId === target.id);
  const scans = all.scans.filter((s) => s.targetId === target.id);
  const outCats = CATEGORIES.filter((c) => !target.scope.allowedCategories.includes(c.id));
  const assessable = !!target.projectId && target.authorizationStatus === "authorized" && target.authorizationConfirmed;

  const saveScope = async () => {
    if (!draft) return;
    if (!draft.inScopeHosts.length || !draft.allowedPaths.length || !draft.allowedCategories.length) {
      toast.error("Scope needs at least one host, one allowed path and one category.");
      return;
    }
    setSaving(true);
    await targetService.updateScope(target.id, draft);
    setSaving(false);
    setScopeOpen(false);
    toast.success("Scope updated", { description: "Recorded in the activity log." });
  };

  return (
    <ContentContainer>
      <PageHeader
        eyebrow={
          <>
            {target.projectId ? (
              <Link to={`/projects/${target.projectId}`} className="font-mono hover:text-foreground">
                {lookups.projects[target.projectId]?.code}
              </Link>
            ) : (
              <span>No project</span>
            )}
            <span>·</span>
            <span>{ASSET_TYPES[target.assetType]}</span>
          </>
        }
        title={target.name}
        description={target.description}
        meta={
          <>
            <StatusBadge status={target.authorizationStatus} map={AUTHORIZATION_STATUS} />
            <ToneBadge tone="muted">{ENVIRONMENTS[target.environment]}</ToneBadge>
            <OriginBadge origin={target.dataOrigin} />
            <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">{target.url}</code>
          </>
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setDraft(structuredClone(target.scope)); setScopeOpen(true); }}>
                <SlidersHorizontal /> Edit scope
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/targets/${target.id}/edit`}>
                  <Pencil /> Edit target
                </Link>
              </Button>
              {assessable && (
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <FileUp /> Import tool output
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Delete target
              </Button>
            </>
          )
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${target.name}?`}
        description={`This removes the target, ${scans.length} scan(s), ${findings.length} finding(s), their evidence and fix tasks. You can register the website again for a fresh assessment. This cannot be undone.`}
        confirmLabel="Delete target and history"
        destructive
        onConfirm={async () => {
          await targetService.delete(target.id);
          toast.success("Target deleted. You can register it again to start fresh.");
          navigate("/targets");
        }}
      />

      {!target.projectId && <AddToProject targetId={target.id} canManage={canManage} />}

      <QuickScanCard target={target} onEditScope={canManage ? () => { setDraft(structuredClone(target.scope)); setScopeOpen(true); } : undefined} />

      {target.projectId && !assessable && (
        <Callout tone="danger" icon={ShieldAlert} title="This target cannot be assessed">
          Authorization is {AUTHORIZATION_STATUS[target.authorizationStatus].label.toLowerCase()}
          {!target.authorizationConfirmed && " and has not been confirmed by an assessor"}. Scans, simulations and testing are blocked until authorization is documented and confirmed.
          {canManage && target.authorizationStatus === "pending" && (
            <Button size="sm" variant="outline" className="mt-2 flex" onClick={() => { setAuthChecked(false); setAuthOpen(true); }}>
              <ShieldCheck /> Record authorization
            </Button>
          )}
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="In-scope assets" value={target.scope.inScopeHosts.length} tone="text-primary" />
        <MiniStat label="Excluded paths" value={target.scope.excludedPaths.length} tone="text-sev-critical" />
        <MiniStat label="Findings" value={findings.length} sub={`${findings.filter((f) => f.verificationStatus === "confirmed").length} confirmed`} />
        <MiniStat label="Recon records" value={all.hosts.filter((h) => h.targetId === target.id).length + all.endpoints.filter((e) => e.targetId === target.id).length + all.dns.filter((d) => d.targetId === target.id).length} sub={<Link className="hover:text-foreground" to={`/reconnaissance?target=${target.id}`}>Open reconnaissance →</Link>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Scope visualization" description="What may and may not be tested" className="lg:col-span-2" icon={Radar}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <ShieldCheck className="size-3.5" /> In-scope assets
              </p>
              <ul className="space-y-1.5">
                {target.scope.inScopeHosts.map((h) => (
                  <li key={h} className="flex items-center gap-2 font-mono text-xs">
                    <Globe className="size-3 text-primary/70" /> {h}
                  </li>
                ))}
              </ul>
              <p className="mt-3 mb-1.5 text-[10.5px] font-semibold text-muted-foreground">Allowed paths</p>
              <div className="flex flex-wrap gap-1">
                {target.scope.allowedPaths.map((p) => (
                  <code key={p} className="rounded border border-primary/25 bg-primary/8 px-1.5 py-px text-[11px] text-primary">{p}</code>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-sev-critical/25 bg-sev-critical/[0.04] p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-sev-critical">
                <ShieldOff className="size-3.5" /> Out-of-scope
              </p>
              {target.scope.excludedPaths.length ? (
                <div className="flex flex-wrap gap-1">
                  {target.scope.excludedPaths.map((p) => (
                    <code key={p} className="rounded border border-sev-critical/25 bg-sev-critical/8 px-1.5 py-px text-[11px] text-sev-critical">{p}</code>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No path exclusions declared.</p>
              )}
              <p className="mt-3 mb-1.5 text-[10.5px] font-semibold text-muted-foreground">Any host not listed in scope</p>
              <p className="text-xs text-muted-foreground">Third-party services, CDNs and linked domains are out of scope unless explicitly listed.</p>
              {outCats.length > 0 && (
                <>
                  <p className="mt-3 mb-1.5 text-[10.5px] font-semibold text-muted-foreground">Categories not permitted</p>
                  <div className="flex flex-wrap gap-1">
                    {outCats.map((c) => (
                      <ToneBadge key={c.id} tone="muted">{c.short}</ToneBadge>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="rounded-xl border border-border p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <CircleCheck className="size-3.5 text-primary" /> Allowed activities
              </p>
              <ul className="space-y-1 text-xs text-foreground/85">
                {target.scope.allowedActivities.length ? target.scope.allowedActivities.map((a) => <li key={a}>• {a}</li>) : <li className="text-muted-foreground">None declared</li>}
              </ul>
              <p className="mt-3 mb-1.5 text-[10.5px] font-semibold text-muted-foreground">Allowed categories</p>
              <div className="flex flex-wrap gap-1">
                {target.scope.allowedCategories.map((c) => (
                  <ToneBadge key={c} tone="primary">{CATEGORIES.find((x) => x.id === c)?.short}</ToneBadge>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <Ban className="size-3.5 text-sev-critical" /> Restricted activities
              </p>
              <ul className="space-y-1 text-xs text-foreground/85">
                {target.scope.restrictedActivities.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Authorization" icon={ShieldCheck}>
          <dl className="space-y-4">
            <KeyValue label="Status">
              <StatusBadge status={target.authorizationStatus} map={AUTHORIZATION_STATUS} />
            </KeyValue>
            <KeyValue label="Reference" mono>{target.authorizationReference}</KeyValue>
            <KeyValue label="Confirmed by">
              {target.authorizationConfirmed ? (
                <span className="space-y-1">
                  <UserChip user={lookups.users[target.authorizationConfirmedBy ?? ""]} />
                  <span className="block text-[11px] text-muted-foreground">{formatDateTime(target.authorizationConfirmedAt)}</span>
                </span>
              ) : (
                <span className="text-sev-medium">Not confirmed</span>
              )}
            </KeyValue>
            <KeyValue label="System owner">{target.owner}</KeyValue>
            <KeyValue label="Testing notes">
              <span className="text-xs text-muted-foreground">{target.testingNotes || "N/A"}</span>
            </KeyValue>
            <KeyValue label="Registered">{formatDate(target.createdAt)}</KeyValue>
          </dl>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Findings on this target" actions={<Button variant="ghost" size="sm" asChild><Link to={`/findings?target=${target.id}`}>Open register</Link></Button>}>
          {findings.length ? (
            <div className="-mx-2 space-y-0.5">
              {findings.slice(0, 8).map((f) => (
                <FindingRow key={f.id} finding={f} target={target.name} />
              ))}
            </div>
          ) : (
            <EmptyState compact title="No findings" />
          )}
        </SectionCard>
        <SectionCard title="Scans">
          {scans.length ? (
            <ul className="divide-y divide-border">
              {scans.map((s) => (
                <li key={s.id}>
                  <Link to={`/scans/${s.id}`} className="flex flex-wrap items-center gap-2 py-2.5 hover:text-primary">
                    <span className="font-mono text-xs">{s.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    <span className="flex flex-wrap gap-1">{s.config.tools.map((t) => <ToolBadge key={t} tool={t} />)}</span>
                    <StatusBadge status={s.status} map={SCAN_STATUS} />
                    <OriginBadge origin={s.dataOrigin} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No scans for this target" />
          )}
        </SectionCard>
      </div>

      {IS_API && assessable && <ScanAutomationCard target={target} />}

      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit scope, {target.name}</DialogTitle>
            <DialogDescription>Changes are recorded in the demo activity log. The backend will independently enforce scope for future real scans.</DialogDescription>
          </DialogHeader>
          <DialogGuide guideKey="scopeEdit" steps={DIALOG_GUIDES.scopeEdit} />
          {draft && <ScopeEditor value={draft} onChange={setDraft} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScopeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveScope} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Save scope
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record authorization</DialogTitle>
            <DialogDescription>Only do this once you hold written authorization ({target.authorizationReference}) from the system owner.</DialogDescription>
          </DialogHeader>
          <DialogGuide guideKey="recordAuthorization" steps={DIALOG_GUIDES.recordAuthorization} />
          <div className="flex items-start gap-3 rounded-xl border border-border p-3">
            <Checkbox id="auth-confirm" checked={authChecked} onCheckedChange={(v) => setAuthChecked(v === true)} className="mt-0.5" />
            <Label htmlFor="auth-confirm" className="text-sm leading-snug">
              I confirm that this application is authorized for security assessment.
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!authChecked}
              onClick={async () => {
                await targetService.update(target.id, { authorizationStatus: "authorized", authorizationConfirmed: true });
                setAuthOpen(false);
                toast.success("Authorization recorded");
              }}
            >
              <ShieldCheck /> Confirm authorization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ToolImportDialog open={importOpen} onOpenChange={setImportOpen} defaultTargetId={target.id} />
    </ContentContainer>
  );
}

/** Shown for targets registered without a project: testing needs one. */
function AddToProject({ targetId, canManage }: { targetId: string; canManage: boolean }) {
  const projects = useDataStore((s) => s.projects).filter((p) => p.status !== "archived");
  const [projectId, setProjectId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      // Server errors are already shown by api(); only local errors (e.g. demo mode) need a toast here.
      if (!IS_API) toast.error("Not saved", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Callout tone="info" title="Not in a project yet">
      <p>Scans and findings are grouped by project. Give this website its own project, or add it to an existing one if it is part of the same assessment.</p>
      {canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {IS_API && (
            <Button size="sm" className="rounded-full" disabled={busy} onClick={() => run(() => targetService.createOwnProject(targetId), "Project created for this website")}>
              Create its own project
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{IS_API ? "or" : ""}</span>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-8 w-64 bg-background" aria-label="Existing project">
              <SelectValue placeholder="Add to an existing project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projectId && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => targetService.update(targetId, { projectId }), "Added to project")}>
              Add
            </Button>
          )}
        </div>
      )}
    </Callout>
  );
}
