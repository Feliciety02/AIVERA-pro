import * as React from "react";
import { Link } from "react-router";
import { useShallow } from "zustand/react/shallow";
import {
  CircleCheckBig,
  ClipboardCheck,
  FolderKanban,
  Plus,
  ScanLine,
  ShieldAlert,
  ShieldX,
  Target,
  Timer,
  Wrench,
  ArrowRight,
} from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { StatCard, RecentActivity, VerificationQueue, FindingRow } from "@/components/dashboard/widgets";
import { ChartCard, DonutChart, StackedBars, TrendArea, summarize } from "@/components/charts/charts";
import { SectionCard } from "@/components/shared/display";
import { CardsSkeleton } from "@/components/shared/states";
import { StatusBadge, ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useDocumentTitle, useInitialLoading, useLookups, useCurrentUser } from "@/hooks";
import { activityOverTime, categoryBreakdown, computeDashboardMetrics, findingsOverTime, remediationDistribution, severityDistribution, verificationDistribution } from "@/features/metrics";
import { ASSESSMENT_STATUS, PROJECT_STATUS } from "@/lib/constants";
import { riskLevel, riskScore, RISK_LEVEL_META } from "@/lib/risk";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import type { ProjectStatus, AssessmentStatus } from "@/types";

export default function DashboardPage() {
  useDocumentTitle("Dashboard");
  const loading = useInitialLoading();
  const user = useCurrentUser();
  const lookups = useLookups();
  const s = useDataStore(
    useShallow((st) => ({
      projects: st.projects,
      targets: st.targets,
      scans: st.scans,
      findings: st.findings,
      remediation: st.remediation,
      assessments: st.assessments,
      activity: st.activity,
      risks: st.risks,
      aiAnalyses: st.aiAnalyses,
    })),
  );

  const m = React.useMemo(() => computeDashboardMetrics(s), [s]);
  const nonRejected = React.useMemo(() => s.findings.filter((f) => f.verificationStatus !== "rejected"), [s.findings]);
  const sevData = React.useMemo(() => severityDistribution(nonRejected), [nonRejected]);
  const verData = React.useMemo(() => verificationDistribution(s.findings), [s.findings]);
  const remData = React.useMemo(() => remediationDistribution(s.remediation), [s.remediation]);
  const catData = React.useMemo(() => categoryBreakdown(s.findings).filter((c) => c.total > 0), [s.findings]);
  const trend = React.useMemo(() => findingsOverTime(s.findings, 12), [s.findings]);
  const activityTrend = React.useMemo(() => activityOverTime(s.activity, s.scans, 12), [s.activity, s.scans]);

  const queue = React.useMemo(
    () =>
      s.findings
        .filter((f) => f.verificationStatus === "pending" || f.verificationStatus === "needs_review")
        .sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt))
        .slice(0, 6),
    [s.findings],
  );
  const aiSent = React.useMemo(() => new Set(s.aiAnalyses.filter((a) => a.status === "sent_to_verification" && a.findingId).map((a) => a.findingId!)), [s.aiAnalyses]);

  const topRisks = React.useMemo(
    () =>
      s.risks
        .filter((r) => r.mitigationStatus !== "mitigated" && r.mitigationStatus !== "accepted")
        .map((r) => ({ r, f: s.findings.find((f) => f.id === r.findingId) }))
        .filter((x) => x.f?.verificationStatus === "confirmed")
        .sort((a, b) => riskScore(b.r.likelihood, b.r.impact) - riskScore(a.r.likelihood, a.r.impact))
        .slice(0, 5),
    [s.risks, s.findings],
  );

  const recentProjects = React.useMemo(() => [...s.projects].filter((p) => p.status !== "archived").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), [s.projects]);
  const recentFindings = React.useMemo(() => [...s.findings].sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt)).slice(0, 6), [s.findings]);

  const projectStatusCounts = (Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((k) => ({ k, n: s.projects.filter((p) => p.status === k).length }));
  const asmStatusCounts = (Object.keys(ASSESSMENT_STATUS) as AssessmentStatus[]).map((k) => ({ k, n: s.assessments.filter((a) => a.status === k).length }));

  return (
    <ContentContainer wide>
      <PageHeader
        title="Security Operations Dashboard"
        description="Live overview computed from the current demo dataset. Only human-confirmed findings count as verified vulnerabilities."
        eyebrow={<span>Welcome back, {user?.name.split(" ")[0]}</span>}
        actions={
          can(user?.role, "manage_projects") && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to="/scans/new">
                  <ScanLine /> Configure demo scan
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/projects/new">
                  <Plus /> New project
                </Link>
              </Button>
            </>
          )
        }
      />

      {loading ? (
        <CardsSkeleton count={8} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Assessment Projects" value={m.totalProjects} icon={FolderKanban} tooltip="Non-archived assessment projects in the demo workspace." sub={`${m.activeProjects} active`} to="/projects" />
          <StatCard label="Registered Targets" value={m.registeredTargets} icon={Target} iconTone="bg-cyan/10 text-cyan" tooltip="Target applications registered as metadata. Registration never contacts the target." sub={`${m.authorizedTargets} authorized & confirmed`} to="/targets" />
          <StatCard label="Completed Assessments" value={m.completedAssessments} icon={ClipboardCheck} iconTone="bg-primary/10 text-primary" tooltip="Category assessments (e.g. Session Management for a project) marked completed by an assessor." sub={`of ${s.assessments.length} category assessments`} to="/assessments" />
          <StatCard label="Potential Findings" value={m.potentialFindings} icon={ShieldAlert} iconTone="bg-sev-medium/10 text-sev-medium" tooltip="All findings not rejected — includes unverified tool/simulation output. These are NOT confirmed vulnerabilities." trend={{ delta: m.findingsLast30 - m.findingsPrev30, goodWhenDown: true, label: "new vs. previous 30 days" }} to="/findings" />
          <StatCard label="Confirmed Vulnerabilities" value={m.confirmed} icon={CircleCheckBig} tone="text-sev-high" iconTone="bg-sev-high/10 text-sev-high" tooltip="Findings a human assessor marked Confirmed after reviewing evidence. AI suggestions never count here." sub="human-verified only" to="/findings?status=confirmed" />
          <StatCard label="Critical Vulnerabilities" value={m.criticalConfirmed} icon={ShieldX} tone={m.criticalConfirmed ? "text-sev-critical" : undefined} iconTone="bg-sev-critical/10 text-sev-critical" tooltip="Confirmed findings with Critical severity." sub="confirmed & critical" to="/findings?status=confirmed&severity=critical" />
          <StatCard label="Pending Verification" value={m.pendingVerification} icon={Timer} tone="text-sev-medium" iconTone="bg-sev-medium/10 text-sev-medium" tooltip="Findings awaiting a human decision (Pending or Needs Further Review)." sub="awaiting assessor decision" to="/findings?status=unverified" />
          <StatCard label="Remediation Progress" value={`${m.remediationProgress}%`} icon={Wrench} tone="text-primary" iconTone="bg-primary/10 text-primary" tooltip="Share of remediation tasks Resolved (with manual approval) or Accepted Risk." sub={<Progress value={m.remediationProgress} className="h-1 w-24" />} to="/remediation" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <ChartCard title="Vulnerability Severity Distribution" description="Non-rejected findings by reported severity" summary={`Severity distribution: ${summarize(sevData)}`} raw>
          <DonutChart data={sevData} centerLabel="findings" centerValue={nonRejected.length} />
        </ChartCard>
        <ChartCard title="Findings Over Time" description="Weekly new findings vs. those later confirmed (12 weeks)" summary={`Findings per week: ${trend.map((t) => `${t.week} ${t.total}`).join(", ")}`} className="2xl:col-span-1">
          <TrendArea data={trend} xKey="week" series={[{ key: "total", name: "New findings", color: "var(--cyan)" }, { key: "confirmed", name: "Confirmed", color: "var(--sev-high)" }]} />
        </ChartCard>
        <ChartCard title="Finding Verification Status" description="Human verification decisions across all findings" summary={`Verification status: ${summarize(verData)}`} raw>
          <DonutChart data={verData} centerLabel="total" centerValue={s.findings.length} />
        </ChartCard>
        <ChartCard title="Vulnerabilities by Assessment Category" description="Confirmed vs. unverified per category" summary={`By category: ${catData.map((c) => `${c.name} ${c.confirmed} confirmed, ${c.unverified} unverified`).join("; ")}`}>
          <StackedBars data={catData} xKey="name" layout="vertical" series={[{ key: "confirmed", name: "Confirmed", color: "var(--sev-high)", stack: "a" }, { key: "unverified", name: "Unverified", color: "var(--sev-medium)", stack: "a" }]} />
        </ChartCard>
        <ChartCard title="Remediation Progress" description={`${m.remediationDone} of ${m.remediationTotal} tasks closed`} summary={`Remediation: ${summarize(remData)}`} raw>
          <DonutChart data={remData} centerLabel="closed" centerValue={`${m.remediationProgress}%`} />
        </ChartCard>
        <ChartCard title="Assessment Activity Timeline" description="Weekly scans (imported/simulated) and verification decisions" summary={`Activity: ${activityTrend.map((a) => `${a.week}: ${a.scans} scans, ${a.verifications} decisions`).join("; ")}`}>
          <StackedBars data={activityTrend} xKey="week" series={[{ key: "scans", name: "Scans", color: "var(--cyan)" }, { key: "verifications", name: "Verification decisions", color: "var(--primary)" }]} />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Pending Verification Queue"
          description="Findings waiting for a human decision"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/findings?status=unverified">
                View all <ArrowRight />
              </Link>
            </Button>
          }
        >
          <VerificationQueue findings={queue} targets={lookups.targets} aiSent={aiSent} />
        </SectionCard>
        <SectionCard
          title="Highest-Priority Risks"
          description="Open confirmed risks by demo score (likelihood × impact, not CVSS)"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/risks">
                Risk register <ArrowRight />
              </Link>
            </Button>
          }
        >
          {topRisks.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No open confirmed risks.</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {topRisks.map(({ r, f }) => {
                const lvl = riskLevel(r);
                return (
                  <li key={r.id}>
                    <Link to={`/findings/${f!.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-bold tabular-nums" style={{ color: RISK_LEVEL_META[lvl].color, borderColor: RISK_LEVEL_META[lvl].color }}>
                        {riskScore(r.likelihood, r.impact)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{r.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {f!.code} · {lookups.targets[f!.targetId]?.name} · L{r.likelihood} × I{r.impact}
                        </span>
                      </span>
                      <span className="text-[10.5px] font-semibold uppercase" style={{ color: RISK_LEVEL_META[lvl].color }}>
                        {RISK_LEVEL_META[lvl].label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        <SectionCard
          title="Recent Activity"
          description="Demonstration activity log"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/activity">
                Full log <ArrowRight />
              </Link>
            </Button>
          }
        >
          <RecentActivity items={s.activity} users={lookups.users} limit={7} />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Recent Assessment Projects" className="xl:col-span-1" actions={<Button variant="ghost" size="sm" asChild><Link to="/projects">All projects <ArrowRight /></Link></Button>}>
          <ul className="-mx-2 space-y-0.5">
            {recentProjects.map((p) => {
              const findings = s.findings.filter((f) => f.projectId === p.id);
              return (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                      <FolderKanban className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{p.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        <span className="font-mono">{p.code}</span> · {findings.length} findings · updated {formatRelative(p.updatedAt)}
                      </span>
                    </span>
                    <StatusBadge status={p.status} map={PROJECT_STATUS} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
        <SectionCard title="Recent Findings" actions={<Button variant="ghost" size="sm" asChild><Link to="/findings">All findings <ArrowRight /></Link></Button>}>
          <div className="-mx-2 space-y-0.5">
            {recentFindings.map((f) => (
              <FindingRow key={f.id} finding={f} target={lookups.targets[f.targetId]?.name} />
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Assessment Status Summary" description="Projects and category assessments by status">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Projects</p>
              <div className="grid grid-cols-2 gap-2">
                {projectStatusCounts.map(({ k, n }) => (
                  <Link key={k} to={`/projects?status=${k}`} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-primary/35">
                    <StatusBadge status={k} map={PROJECT_STATUS} />
                    <span className="font-semibold tabular-nums">{n}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Category assessments</p>
              <div className="space-y-2">
                {asmStatusCounts.map(({ k, n }) => (
                  <div key={k} className="flex items-center gap-3 text-xs">
                    <span className="w-24 shrink-0 text-muted-foreground">{ASSESSMENT_STATUS[k].label}</span>
                    <Progress value={s.assessments.length ? (n / s.assessments.length) * 100 : 0} className="h-1.5 flex-1" indicatorClassName={cn(k === "completed" ? "bg-primary" : k === "in_progress" ? "bg-cyan" : k === "blocked" ? "bg-sev-critical" : "bg-muted-foreground/50")} />
                    <span className="w-6 text-right font-semibold tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span>Latest scan</span>
              {s.scans[0] ? (
                <Link to={`/scans/${s.scans[0].id}`} className="flex items-center gap-2 hover:text-foreground">
                  <span className="font-mono">{s.scans[0].code}</span>
                  <ToneBadge tone={s.scans[0].dataOrigin === "simulated" ? "warning" : "cyan"}>{s.scans[0].dataOrigin === "simulated" ? "SIMULATED" : "Imported sample"}</ToneBadge>
                  <span>{formatDate(s.scans[0].createdAt)}</span>
                </Link>
              ) : (
                <span>none</span>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </ContentContainer>
  );
}
