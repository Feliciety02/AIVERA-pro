import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { Archive, CalendarDays, FileText, Pencil, Plus, RotateCcw, ScanLine, Target } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Progress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard, KeyValue, UserChip, MiniStat } from "@/components/shared/display";
import { EmptyState, NotFoundState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge, OriginBadge, SeverityBadge, ToolBadge, ToneBadge } from "@/components/security/badges";
import { RecentActivity, FindingRow } from "@/components/dashboard/widgets";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { ASSESSMENT_STATUS, ASSESSMENT_TYPES, AUTHORIZATION_STATUS, CATEGORY_BY_ID, ENVIRONMENTS, PROJECT_STATUS, SCAN_STATUS, SEVERITIES, SEVERITY_META } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { percent } from "@/lib/utils";
import { projectService } from "@/services";

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const canManage = can(user?.role, "manage_projects");
  const lookups = useLookups();
  const project = useDataStore((s) => s.projects.find((p) => p.id === projectId));
  useDocumentTitle(project?.name ?? "Project");
  const all = useDataStore(useShallow((s) => ({ targets: s.targets, scans: s.scans, findings: s.findings, reports: s.reports, activity: s.activity, assessments: s.assessments, remediation: s.remediation })));
  const [confirm, setConfirm] = React.useState(false);

  const d = React.useMemo(() => {
    const targets = all.targets.filter((t) => t.projectId === projectId);
    const targetIds = new Set(targets.map((t) => t.id));
    const findings = all.findings.filter((f) => f.projectId === projectId);
    const scans = all.scans.filter((s) => s.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reports = all.reports.filter((r) => r.projectId === projectId);
    const assessments = all.assessments.filter((a) => a.projectId === projectId);
    const findingIds = new Set(findings.map((f) => f.id));
    const activity = all.activity.filter((a) => a.entityId === projectId || (a.entityId && (targetIds.has(a.entityId) || findingIds.has(a.entityId) || scans.some((s) => s.id === a.entityId) || reports.some((r) => r.id === a.entityId))));
    const remediation = all.remediation.filter((r) => findingIds.has(r.findingId));
    const checklist = assessments.flatMap((a) => a.checklist);
    const tested = checklist.filter((c) => c.result !== "not_tested").length;
    return { targets, findings, scans, reports, assessments, activity, remediation, checklistTotal: checklist.length, tested };
  }, [all, projectId]);

  if (!project)
    return (
      <ContentContainer>
        <NotFoundState entity="Project" backTo="/projects" backLabel="Back to projects" />
      </ContentContainer>
    );

  const confirmed = d.findings.filter((f) => f.verificationStatus === "confirmed");
  const pending = d.findings.filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review");
  const archived = project.status === "archived";
  const progressPct = percent(d.tested, d.checklistTotal);

  return (
    <ContentContainer>
      <PageHeader
        eyebrow={
          <>
            <span className="font-mono">{project.code}</span>
            <span>·</span>
            <span>{ASSESSMENT_TYPES[project.assessmentType]}</span>
          </>
        }
        title={project.name}
        description={project.description}
        meta={
          <>
            <StatusBadge status={project.status} map={PROJECT_STATUS} />
            <OriginBadge origin={project.dataOrigin} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" /> {formatDate(project.startDate)} → {formatDate(project.dueDate)}
            </span>
          </>
        }
        actions={
          canManage && (
            <>
              {archived ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await projectService.restore(project.id);
                    toast.success("Project restored");
                  }}
                >
                  <RotateCcw /> Restore
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
                    <Archive /> Archive
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/projects/${project.id}/edit`}>
                      <Pencil /> Edit
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to={`/targets/new?project=${project.id}`}>
                      <Plus /> Register target
                    </Link>
                  </Button>
                </>
              )}
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat label="Authorized targets" value={`${d.targets.filter((t) => t.authorizationStatus === "authorized").length}/${d.targets.length}`} />
        <MiniStat label="Scans" value={d.scans.length} sub={`${d.scans.filter((s) => s.dataOrigin === "simulated").length} simulated`} />
        <MiniStat label="Confirmed vulns" value={confirmed.length} tone="text-sev-high" />
        <MiniStat label="Pending verification" value={pending.length} tone="text-sev-medium" />
        <MiniStat label="Checklist progress" value={`${progressPct}%`} sub={`${d.tested}/${d.checklistTotal} checks recorded`} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="targets">Targets ({d.targets.length})</TabsTrigger>
          <TabsTrigger value="scans">Scans ({d.scans.length})</TabsTrigger>
          <TabsTrigger value="findings">Findings ({d.findings.length})</TabsTrigger>
          <TabsTrigger value="reports">Reports ({d.reports.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Project overview" className="lg:col-span-2">
            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue label="Owner">
                <UserChip user={lookups.users[project.ownerId]} showTitle />
              </KeyValue>
              <KeyValue label="Assessment type">{ASSESSMENT_TYPES[project.assessmentType]}</KeyValue>
              <KeyValue label="Created">{formatDate(project.createdAt)}</KeyValue>
              <KeyValue label="Last updated">{formatRelative(project.updatedAt)}</KeyValue>
              <KeyValue label="Objectives" className="sm:col-span-2">
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{project.objectives}</p>
              </KeyValue>
              {project.notes && (
                <KeyValue label="Notes" className="sm:col-span-2">
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{project.notes}</p>
                </KeyValue>
              )}
            </dl>
          </SectionCard>
          <SectionCard title="Assigned members">
            <ul className="space-y-3">
              {project.memberIds.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2">
                  <UserChip user={lookups.users[id]} showTitle />
                  {id === project.ownerId && <ToneBadge tone="primary">Owner</ToneBadge>}
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Assessment progress" description="Checklist coverage per category" className="lg:col-span-2" actions={<Button variant="ghost" size="sm" asChild><Link to={`/assessments?project=${project.id}`}>Open assessments</Link></Button>}>
            {d.assessments.length === 0 ? (
              <EmptyState compact title="No category assessments started" description="Open Vulnerability Assessment to begin a guided checklist for this project." />
            ) : (
              <ul className="space-y-3">
                {d.assessments.map((a) => {
                  const done = a.checklist.filter((c) => c.result !== "not_tested").length;
                  return (
                    <li key={a.id}>
                      <Link to={`/assessments/${a.category}?project=${project.id}`} className="group block">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium group-hover:text-primary">{CATEGORY_BY_ID[a.category].name}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground tabular-nums">
                              {done}/{a.checklist.length}
                            </span>
                            <StatusBadge status={a.status} map={ASSESSMENT_STATUS} />
                          </span>
                        </div>
                        <Progress value={percent(done, a.checklist.length)} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Vulnerability summary" description="Confirmed findings by severity">
            <ul className="space-y-2">
              {SEVERITIES.map((sev) => {
                const n = confirmed.filter((f) => f.severity === sev).length;
                return (
                  <li key={sev} className="flex items-center gap-3 text-xs">
                    <SeverityBadge severity={sev} className="w-[70px] justify-center" />
                    <Progress value={confirmed.length ? (n / confirmed.length) * 100 : 0} className="flex-1" indicatorClassName="bg-current" style={{ color: SEVERITY_META[sev].color }} />
                    <span className="w-5 text-right font-semibold tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[11px] text-muted-foreground">
              {pending.length} unverified observation(s) are not counted. Remediation: {d.remediation.filter((r) => r.status === "resolved").length}/{d.remediation.length} resolved.
            </p>
          </SectionCard>
        </TabsContent>

        <TabsContent value="targets">
          <SectionCard title="Authorized targets" flush actions={canManage && !archived && <Button size="sm" variant="outline" asChild><Link to={`/targets/new?project=${project.id}`}><Target /> Register target</Link></Button>}>
            {d.targets.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Target} title="No targets registered" description="Register the web applications you are authorized to assess for this project." />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Authorization</TableHead>
                    <TableHead>Hosts in scope</TableHead>
                    <TableHead>Findings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.targets.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/targets/${t.id}`)}>
                      <TableCell>
                        <p className="font-medium">{t.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{t.url}</p>
                      </TableCell>
                      <TableCell>{ENVIRONMENTS[t.environment]}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.authorizationStatus} map={AUTHORIZATION_STATUS} />
                      </TableCell>
                      <TableCell className="tabular-nums">{t.scope.inScopeHosts.length}</TableCell>
                      <TableCell className="tabular-nums">{d.findings.filter((f) => f.targetId === t.id).length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="scans">
          <SectionCard title="Recent scans" flush actions={can(user?.role, "run_demo_scans") && !archived && <Button size="sm" variant="outline" asChild><Link to={`/scans/new?project=${project.id}`}><ScanLine /> Configure demo scan</Link></Button>}>
            {d.scans.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={ScanLine} title="No scans yet" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scan</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Tools</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.scans.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/scans/${s.id}`)}>
                      <TableCell>
                        <p className="font-medium">{s.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{s.code}</p>
                      </TableCell>
                      <TableCell className="text-xs">{lookups.targets[s.targetId]?.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {s.config.tools.map((t) => (
                            <ToolBadge key={t} tool={t} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} map={SCAN_STATUS} />
                      </TableCell>
                      <TableCell>
                        <OriginBadge origin={s.dataOrigin} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="findings">
          <SectionCard title="Findings" actions={<Button variant="ghost" size="sm" asChild><Link to={`/findings?project=${project.id}`}>Open in Findings register</Link></Button>}>
            {d.findings.length === 0 ? (
              <EmptyState compact title="No findings yet" />
            ) : (
              <div className="-mx-2 space-y-0.5">
                {d.findings.map((f) => (
                  <FindingRow key={f.id} finding={f} target={lookups.targets[f.targetId]?.name} />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="reports">
          <SectionCard title="Reports" actions={can(user?.role, "generate_reports") && <Button size="sm" variant="outline" asChild><Link to={`/reports/new?project=${project.id}`}><FileText /> New report</Link></Button>}>
            {d.reports.length === 0 ? (
              <EmptyState compact icon={FileText} title="No reports generated" description="Generate a demonstration report once findings are verified." />
            ) : (
              <ul className="divide-y divide-border">
                {d.reports.map((r) => (
                  <li key={r.id}>
                    <Link to={`/reports/${r.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {r.code} · {r.findingIds.length} findings · {formatDate(r.createdAt)}
                        </span>
                      </span>
                      <ToneBadge tone={r.status === "final" ? "primary" : "muted"}>{r.status === "final" ? "Final" : "Draft"}</ToneBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="activity">
          <SectionCard title="Activity timeline" description="Demonstration log entries related to this project">
            <RecentActivity items={d.activity} users={lookups.users} limit={30} />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Archive ${project.code}?`}
        description="The project will be hidden from active views. All related data is retained and the project can be restored."
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
