import * as React from "react";
import { Link, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { CircleCheck, FileText, Globe, ScanLine, ShieldAlert, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { AddButton, ArchiveButton, EditButton, RestoreButton } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { IconChip, UserChip } from "@/components/shared/display";
import { EmptyState, NotFoundState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Collapsible, ContentCard, DetailLayout, FactList, SidePanel } from "@/components/shared/DetailLayout";
import { StatusBadge, OriginBadge, ToneBadge } from "@/components/security/badges";
import { RecentActivity, FindingRow, StatCard } from "@/components/dashboard/widgets";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { ASSESSMENT_TYPES, AUTHORIZATION_STATUS, PROJECT_STATUS, REPORT_STATUS, SCAN_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { percent } from "@/lib/utils";
import { projectService } from "@/services";

const isUnverified = (s: string) => s === "pending" || s === "needs_review";

/**
 * One page per project, everything in it: its websites first (where testing starts), then what was
 * found, the scans and the reports. Details and the team sit on the side.
 */
export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const user = useCurrentUser();
  const canManage = can(user?.role, "manage_projects");
  const canAddSite = can(user?.role, "manage_targets");
  const lookups = useLookups();
  const project = useDataStore((s) => s.projects.find((p) => p.id === projectId));
  useDocumentTitle(project?.name ?? "Project");
  const all = useDataStore(useShallow((s) => ({ targets: s.targets, scans: s.scans, findings: s.findings, reports: s.reports, activity: s.activity, assessments: s.assessments, remediation: s.remediation })));
  const [confirm, setConfirm] = React.useState(false);

  const d = React.useMemo(() => {
    const targets = all.targets.filter((t) => t.projectId === projectId);
    const findings = all.findings.filter((f) => f.projectId === projectId);
    const scans = all.scans.filter((s) => s.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reports = all.reports.filter((r) => r.projectId === projectId);
    const ids = new Set([projectId, ...targets.map((t) => t.id), ...findings.map((f) => f.id), ...scans.map((s) => s.id), ...reports.map((r) => r.id)]);
    const activity = all.activity.filter((a) => a.entityId && ids.has(a.entityId));
    const findingIds = new Set(findings.map((f) => f.id));
    const remediation = all.remediation.filter((r) => findingIds.has(r.findingId));
    const checklist = all.assessments.filter((a) => a.projectId === projectId).flatMap((a) => a.checklist);
    return { targets, findings, scans, reports, activity, remediation, checks: checklist.length, tested: checklist.filter((c) => c.result !== "not_tested").length };
  }, [all, projectId]);

  if (!project)
    return (
      <ContentContainer>
        <NotFoundState entity="Project" backTo="/projects" backLabel="Back to projects" />
      </ContentContainer>
    );

  const archived = project.status === "archived";
  const unverified = d.findings.filter((f) => isUnverified(f.verificationStatus));
  const confirmed = d.findings.filter((f) => f.verificationStatus === "confirmed");
  const ready = d.targets.filter((t) => t.authorizationStatus === "authorized" && t.authorizationConfirmed).length;
  const fixed = d.remediation.filter((r) => r.status === "resolved" || r.status === "accepted_risk").length;
  // Unverified first: they are the ones waiting on a person.
  const findingList = [...d.findings].sort((a, b) => Number(isUnverified(b.verificationStatus)) - Number(isUnverified(a.verificationStatus)));
  // The owner is shown once, as owner; the lead and website owner are tagged among the members.
  const members = project.memberIds.filter((id) => id !== project.ownerId);
  const roleTag = (id: string) => (id === project.leadId ? "Lead" : id === project.remediationOwnerId ? "Fixes issues" : null);
  const addSite = canAddSite && !archived && (
    <AddButton to={`/targets/new?project=${project.id}`}>Add website</AddButton>
  );

  return (
    <ContentContainer wide>
      <PageHeader
        eyebrow={
          <>
            <Link to="/projects" className="hover:text-foreground">Projects</Link>
            <span>/</span>
            <span className="font-mono">{project.code}</span>
          </>
        }
        title={project.name}
        meta={
          <>
            <StatusBadge status={project.status} map={PROJECT_STATUS} />
            <OriginBadge origin={project.dataOrigin} />
            <span className="text-xs text-muted-foreground">
              {formatDate(project.startDate)} to {formatDate(project.dueDate)}
            </span>
          </>
        }
        actions={
          canManage &&
          (archived ? (
            <RestoreButton
              onClick={async () => {
                await projectService.restore(project.id);
                toast.success("Project restored");
              }}
            />
          ) : (
            <>
              <ArchiveButton onClick={() => setConfirm(true)} />
              <EditButton to={`/projects/${project.id}/edit`} />
            </>
          ))
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Websites ready" value={`${ready}/${d.targets.length}`} icon={Globe} tooltip="Websites with confirmed permission to test. Only these can be scanned." />
        <StatCard label="To verify" value={unverified.length} icon={ShieldQuestion} accent="var(--warning)" tooltip="Findings no person has checked yet. They are not real issues until a tester confirms them." to={`/findings?project=${project.id}&status=unverified`} />
        <StatCard label="Confirmed issues" value={confirmed.length} icon={ShieldAlert} accent="var(--sev-high)" tooltip="Findings a tester checked and confirmed." to={`/findings?project=${project.id}&status=confirmed`} />
        <StatCard label="Fixes closed" value={`${fixed}/${d.remediation.length}`} icon={CircleCheck} accent="var(--success)" tooltip="Fix tasks for this project's confirmed issues that are closed." to="/remediation" />
      </div>

      <DetailLayout
        main={
          <>
            <ContentCard title="Websites" count={d.targets.length} action={addSite}>
              {d.targets.length ? (
                <ul className="-my-2 divide-y divide-border">
                  {d.targets.map((t) => {
                    const open = d.findings.filter((f) => f.targetId === t.id && isUnverified(f.verificationStatus)).length;
                    return (
                      <li key={t.id}>
                        <Link to={`/targets/${t.id}`} className="group flex items-center gap-3 py-3">
                          <IconChip>{t.name.trim().charAt(0).toUpperCase() || "?"}</IconChip>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium group-hover:text-primary">{t.name}</span>
                            <span className="block truncate font-mono text-[11px] text-muted-foreground">{t.url}</span>
                          </span>
                          {open > 0 && <ToneBadge tone="warning">{open} to verify</ToneBadge>}
                          <StatusBadge status={t.authorizationStatus} map={AUTHORIZATION_STATUS} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState compact icon={Globe} title="No websites yet" description="Add the website you have permission to test. Scans start from its page." action={addSite || undefined} />
              )}
            </ContentCard>

            <ContentCard
              title="Findings"
              count={d.findings.length}
              action={d.findings.length > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/findings?project=${project.id}`}>See all</Link>
                </Button>
              )}
            >
              {findingList.length ? (
                <div className="-mx-2 space-y-0.5">
                  {findingList.slice(0, 6).map((f) => <FindingRow key={f.id} finding={f} target={lookups.targets[f.targetId]?.name} />)}
                </div>
              ) : (
                <EmptyState compact title="No findings yet" description="Scan a website to look for problems." />
              )}
            </ContentCard>

            <div className="grid gap-5 2xl:grid-cols-2">
              <ContentCard title="Scans" count={d.scans.length}>
                {d.scans.length ? (
                  <ul className="-my-2 divide-y divide-border">
                    {d.scans.slice(0, 5).map((s) => (
                      <li key={s.id}>
                        <Link to={`/scans/${s.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                          <ScanLine className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{s.name}</span>
                            <span className="block text-[11px] text-muted-foreground">{lookups.targets[s.targetId]?.name} · {formatDate(s.createdAt)}</span>
                          </span>
                          <StatusBadge status={s.status} map={SCAN_STATUS} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact title="No scans yet" description="Open a website to scan it." />
                )}
              </ContentCard>

              <ContentCard
                title="Reports"
                count={d.reports.length}
                action={can(user?.role, "generate_reports") && !archived && (
                  <AddButton to={`/reports?new=1&project=${project.id}`}>New report</AddButton>
                )}
              >
                {d.reports.length ? (
                  <ul className="-my-2 divide-y divide-border">
                    {d.reports.map((r) => (
                      <li key={r.id}>
                        <Link to={`/reports/${r.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{r.title}</span>
                            <span className="block text-[11px] text-muted-foreground">{formatDate(r.createdAt)}</span>
                          </span>
                          <StatusBadge status={r.status} map={REPORT_STATUS} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact title="No reports yet" description="Create one once findings are verified." />
                )}
              </ContentCard>
            </div>

            <Collapsible title="Activity" hint={`${d.activity.length} events`}>
              <RecentActivity items={d.activity} users={lookups.users} limit={30} />
            </Collapsible>
          </>
        }
        aside={
          <>
            <SidePanel title="About">
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/85">{project.objectives}</p>
              {project.notes && <p className="text-xs whitespace-pre-line text-muted-foreground">{project.notes}</p>}
              <FactList
                items={[
                  { label: "Type", value: ASSESSMENT_TYPES[project.assessmentType] },
                  { label: "Due", value: formatDate(project.dueDate) },
                  {
                    label: "Checklists",
                    value: (
                      <Link to={`/assessments?project=${project.id}`} className="block min-w-28 hover:text-primary">
                        <span className="text-xs">{d.checks ? `${d.tested}/${d.checks} done` : "Not started"}</span>
                        {d.checks > 0 && <Progress value={percent(d.tested, d.checks)} className="mt-1 h-1.5" />}
                      </Link>
                    ),
                  },
                ]}
              />
            </SidePanel>

            <SidePanel title="Team">
              <ul className="space-y-3">
                <li className="flex items-center justify-between gap-2">
                  <UserChip user={lookups.users[project.ownerId]} showTitle />
                  <ToneBadge tone="primary">Owner</ToneBadge>
                </li>
                {members.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <UserChip user={lookups.users[id]} showTitle />
                    {roleTag(id) && <ToneBadge tone="neutral">{roleTag(id)}</ToneBadge>}
                  </li>
                ))}
                {!members.length && <li className="text-xs text-muted-foreground">No other members.</li>}
              </ul>
            </SidePanel>
          </>
        }
      />

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Archive ${project.code}?`}
        description="The project is hidden from active views. Its websites, findings and reports are kept, and you can restore it."
        confirmLabel="Archive project"
        destructive
        onConfirm={async () => {
          await projectService.archive(project.id);
          toast.success("Project archived");
        }}
      />
    </ContentContainer>
  );
}
