import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { Link, useNavigate, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { FileUp, Loader2, ShieldCheck, ShieldOff, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { DeleteButton, EditButton } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Callout } from "@/components/shared/display";
import { ContentCard, DetailLayout, FactList, SidePanel } from "@/components/shared/DetailLayout";
import { NotFoundState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/security/badges";
import { FindingRow } from "@/components/dashboard/widgets";
import { ScopeEditor } from "@/components/forms/ScopeEditor";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { AUTHORIZATION_STATUS, CATEGORIES, DATA_ORIGIN, ENVIRONMENTS, SCAN_STATUS } from "@/lib/constants";
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
  const canAuthorize = can(user?.role, "authorize_targets");
  const lookups = useLookups();
  const target = useDataStore((s) => s.targets.find((t) => t.id === targetId));
  useDocumentTitle(target?.name ?? "Target");
  const all = useDataStore(useShallow((s) => ({ findings: s.findings, scans: s.scans, hosts: s.hosts, endpoints: s.endpoints, dns: s.dnsRecords })));
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<TargetScope | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  if (!target)
    return (
      <ContentContainer>
        <NotFoundState entity="Website" backTo="/targets" backLabel="Back to websites" />
      </ContentContainer>
    );

  // Website owners only see what the testers confirmed, never unverified scanner output.
  const findings = all.findings.filter((f) => f.targetId === target.id && (can(user?.role, "verify_findings") || f.verificationStatus === "confirmed"));
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

  const editScope = () => {
    setDraft(structuredClone(target.scope));
    setScopeOpen(true);
  };
  const confirmed = findings.filter((f) => f.verificationStatus === "confirmed").length;
  const discovery = all.hosts.filter((h) => h.targetId === target.id).length + all.endpoints.filter((e) => e.targetId === target.id).length + all.dns.filter((d) => d.targetId === target.id).length;
  const project = target.projectId ? lookups.projects[target.projectId] : undefined;
  const recentScans = [...scans].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));

  return (
    <ContentContainer wide>
      <PageHeader
        eyebrow={
          <>
            <Link to="/targets" className="hover:text-foreground">Websites</Link>
            {project && (
              <>
                <span>/</span>
                <Link to={`/projects/${project.id}`} className="hover:text-foreground">{project.name}</Link>
              </>
            )}
          </>
        }
        title={target.name}
        meta={
          <>
            <StatusBadge status={target.authorizationStatus} map={AUTHORIZATION_STATUS} />
            <code className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">{target.url}</code>
          </>
        }
        actions={
          canManage && (
            <EditButton to={`/targets/${target.id}/edit`}>Edit website</EditButton>
          )
        }
      />

      <DetailLayout
        aside={
          <>
            <SidePanel tone="primary" title="Permission to test">
              {assessable ? (
                <p className="flex items-start gap-2 text-sm">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>Authorized and confirmed. Scans can run.</span>
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-sev-critical">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {!target.projectId
                      ? "Add it to a project before testing."
                      : `Authorization is ${AUTHORIZATION_STATUS[target.authorizationStatus].label.toLowerCase()}${!target.authorizationConfirmed ? " and not yet confirmed" : ""}. Testing is blocked.`}
                  </span>
                </p>
              )}
              {canAuthorize && target.projectId && !assessable && target.authorizationStatus === "pending" && target.authorizationConfirmed && (
                <Button variant="success" className="w-full" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try { await targetService.update(target.id, { authorizationStatus: "authorized" }); toast.success("Website authorized"); }
                  catch (e) { toast.error((e as Error).message); }
                  finally { setSaving(false); }
                }}>
                  <ShieldCheck /> Authorize website
                </Button>
              )}
              <FactList
                items={[
                  { label: "Reference", value: <span className="font-mono text-xs">{target.authorizationReference || "N/A"}</span> },
                  {
                    label: "Confirmed by",
                    value: target.authorizationConfirmed ? (
                      <span>
                        {lookups.users[target.authorizationConfirmedBy ?? ""]?.name ?? "N/A"}
                        <span className="block text-[11px] text-muted-foreground">{formatDateTime(target.authorizationConfirmedAt)}</span>
                      </span>
                    ) : (
                      <span className="text-sev-medium">Not confirmed</span>
                    ),
                  },
                  { label: "System owner", value: target.owner || "N/A" },
                ]}
              />
            </SidePanel>

            <SidePanel
              title="Details"
              footer={
                canManage && (
                  <DeleteButton className="my-1 w-full" onClick={() => setDeleteOpen(true)}>Delete website</DeleteButton>
                )
              }
            >
              <FactList
                items={[
                  { label: "Project", value: target.projectId ? <Link to={`/projects/${target.projectId}`} className="hover:text-primary">{lookups.projects[target.projectId]?.name}</Link> : "None" },
                  { label: "Environment", value: ENVIRONMENTS[target.environment] },
                  { label: "Findings", value: <Link to={`/findings?target=${target.id}`} className="hover:text-primary">{findings.length} ({confirmed} confirmed)</Link> },
                  { label: "Discovery", value: <Link to="/targets?view=discovery" className="hover:text-primary">{discovery === 1 ? "1 item found" : `${discovery} items found`}</Link> },
                  target.dataOrigin === "simulated" || target.dataOrigin === "imported" ? { label: "Data", value: DATA_ORIGIN[target.dataOrigin].label } : null,
                  { label: "Registered", value: formatDate(target.createdAt) },
                  target.testingNotes ? { label: "Notes for testers", value: <span className="text-xs text-muted-foreground">{target.testingNotes}</span> } : null,
                ]}
              />
            </SidePanel>
          </>
        }
        main={
          <>
            {!target.projectId && <AddToProject targetId={target.id} canManage={canManage} />}

            {can(user?.role, "run_demo_scans") && <QuickScanCard target={target} onEditScope={canManage ? editScope : undefined} />}

            <ContentCard
              title="Findings"
              count={findings.length}
              action={findings.length > 8 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/findings?target=${target.id}`}>See all</Link>
                </Button>
              )}
            >
              {findings.length ? (
                <div className="-mx-2 space-y-0.5">
                  {findings.slice(0, 8).map((f) => <FindingRow key={f.id} finding={f} target={target.name} />)}
                </div>
              ) : (
                <EmptyState compact title="No findings yet" description="Run a scan to look for problems." />
              )}
            </ContentCard>

            <ContentCard
              title="Scans"
              count={scans.length}
              action={canManage && assessable && (
                <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}>
                  <FileUp /> Import tool output
                </Button>
              )}
            >
              {recentScans.length ? (
                <ul className="-my-2 divide-y divide-border">
                  {recentScans.map((s) => (
                    <li key={s.id}>
                      <Link to={`/scans/${s.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                        <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">{formatDate(s.startedAt)}</span>
                        <StatusBadge status={s.status} map={SCAN_STATUS} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="No scans yet" />
              )}
            </ContentCard>

            <ContentCard
              title="What may be tested"
              action={canManage && (
                <EditButton onClick={editScope}>Edit scope</EditButton>
              )}
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <ShieldCheck className="size-3.5" aria-hidden /> May be tested
                  </p>
                  <ScopeList label="Website addresses" items={target.scope.inScopeHosts} mono />
                  <ScopeList label="Pages" items={target.scope.allowedPaths} mono />
                  <ScopeList label="Kinds of check" items={target.scope.allowedCategories.map((c) => CATEGORIES.find((x) => x.id === c)?.short ?? c)} />
                  <ScopeList label="Actions" items={target.scope.allowedActivities} empty="None listed" />
                </div>
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-sev-critical">
                    <ShieldOff className="size-3.5" aria-hidden /> Must not be tested
                  </p>
                  <ScopeList label="Pages" items={target.scope.excludedPaths} mono empty="None" />
                  {outCats.length > 0 && <ScopeList label="Kinds of check" items={outCats.map((c) => c.short)} />}
                  <ScopeList label="Actions" items={target.scope.restrictedActivities} empty="None listed" />
                  <p className="text-xs text-muted-foreground">Any other website, including outside services this site uses.</p>
                </div>
              </div>
            </ContentCard>

            {IS_API && assessable && can(user?.role, "run_demo_scans") && <ScanAutomationCard target={target} />}
          </>
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${target.name}?`}
        description={`This removes the website, ${scans.length} scan(s), ${findings.length} finding(s), their evidence and fix tasks. You can add the website again for a fresh assessment. This cannot be undone.`}
        confirmLabel="Delete website and history"
        destructive
        onConfirm={async () => {
          await targetService.delete(target.id);
          toast.success("Website deleted. You can add it again to start fresh.");
          navigate("/targets");
        }}
      />

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

      <ToolImportDialog open={importOpen} onOpenChange={setImportOpen} defaultTargetId={target.id} />
    </ContentContainer>
  );
}

/** One scope rule group: a small label and its values as chips. */
function ScopeList({ label, items, mono, empty }: { label: string; items: string[]; mono?: boolean; empty?: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.map((it) => (
            <span key={it} className={mono ? "rounded border border-border bg-muted/40 px-1.5 py-px font-mono text-[11px]" : "rounded-full border border-border px-2 py-px text-[11px]"}>{it}</span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{empty ?? "None"}</p>
      )}
    </div>
  );
}

/** Shown for older websites saved without a project: testing needs one, so offer to create it. */
function AddToProject({ targetId, canManage }: { targetId: string; canManage: boolean }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Callout tone="info" title="Not in a project yet">
      <p>Websites are tested inside a project. {canManage && IS_API ? "Create a project for this website to start testing it." : "Ask an administrator to create a project for it."}</p>
      {canManage && IS_API && (
        <Button
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await targetService.createOwnProject(targetId);
              toast.success("Project created for this website");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="animate-spin" />} Create its project
        </Button>
      )}
    </Callout>
  );
}
