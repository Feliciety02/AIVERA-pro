import * as React from "react";
import { Link } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ArrowRight, BarChart3, CircleCheckBig, Globe, Inbox, Plus, ScanLine, Timer, Wrench } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { StatCard, RecentActivity } from "@/components/dashboard/widgets";
import { NextStepCard } from "@/components/dashboard/NextStepCard";
import { MyWorkList } from "@/components/dashboard/MyWorkList";
import { SectionCard } from "@/components/shared/display";
import { CardsSkeleton } from "@/components/shared/states";
import { useDataStore } from "@/stores/dataStore";
import { useUIStore } from "@/stores/sessionStore";
import { useDocumentTitle, useInitialLoading, useLookups, useCurrentUser } from "@/hooks";
import { useMyWork } from "@/features/myWork";
import { computeDashboardMetrics } from "@/features/metrics";
import { riskLevel, riskScore, RISK_LEVEL_META } from "@/lib/risk";
import { can } from "@/lib/permissions";

/**
 * Home: one screen that answers "what should I do now?".
 * 1. The next step of the assessment, 2. what is waiting on you, 3. four numbers that matter.
 * Charts live on the Analytics page, so they are not repeated here.
 */
export default function DashboardPage() {
  const simpleMode = useUIStore((st) => st.simpleMode);
  // The website to offer a one-click scan for: the first one that's ready, otherwise the first registered.
  const scanTarget = useDataStore((st) => st.targets.find((t) => t.authorizationStatus === "authorized" && t.authorizationConfirmed && t.projectId) ?? st.targets[0]);
  useDocumentTitle("Home");
  const loading = useInitialLoading();
  const user = useCurrentUser();
  const lookups = useLookups();
  const work = useMyWork();
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

  return (
    <ContentContainer>
      <PageHeader
        title="Home"
        description="Your next step, what's waiting on you, and where the assessment stands. Only findings a person confirmed count as vulnerabilities."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/analytics">
                <BarChart3 /> Charts & trends
              </Link>
            </Button>
            {can(user?.role, "manage_projects") && !simpleMode && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/scans/new">
                    <ScanLine /> New scan
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/projects/new">
                    <Plus /> New project
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <NextStepCard scanTarget={scanTarget} />

      {loading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Websites ready to scan" value={m.authorizedTargets} icon={Globe} tooltip="Websites with confirmed permission that can be scanned. Registering a website never contacts it." sub={`of ${m.registeredTargets} added`} to="/targets" />
          <StatCard label="Findings to review" value={m.pendingVerification} icon={Timer} tooltip="Findings waiting for a person to decide: real problem or false alarm." sub="awaiting a decision" to="/findings?status=unverified" />
          <StatCard label="Confirmed problems" value={m.confirmed} icon={CircleCheckBig} tone={m.criticalConfirmed ? "text-sev-critical" : undefined} tooltip="Findings a person confirmed after checking the evidence. AI suggestions never count here." sub={m.criticalConfirmed ? `${m.criticalConfirmed} critical` : "none critical"} to="/findings?status=confirmed" />
          <StatCard label="Fixes closed" value={`${m.remediationProgress}%`} icon={Wrench} tooltip="Share of fix tasks resolved (with approval) or accepted as a risk." sub={<Progress value={m.remediationProgress} className="h-1 w-24" />} to="/remediation" />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Waiting on you"
          icon={Inbox}
          className="xl:col-span-2"
          description={work.total ? `${work.total} item${work.total === 1 ? "" : "s"} assigned to you` : undefined}
          actions={
            work.total > 3 && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/my-work">
                  See all <ArrowRight />
                </Link>
              </Button>
            )
          }
        >
          {work.total === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting on you. New assignments show up here.</p> : <MyWorkList work={work} limit={3} />}
        </SectionCard>
        <SectionCard
          title="Recent activity"
          actions={
            can(user?.role, "view_activity") && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/activity">
                  Full log <ArrowRight />
                </Link>
              </Button>
            )
          }
        >
          <RecentActivity items={s.activity} users={lookups.users} limit={6} />
        </SectionCard>
      </div>

      {!simpleMode && topRisks.length > 0 && (
        <SectionCard
          title="Fix these first"
          description="Open confirmed risks by score (likelihood × impact, 1–25; not CVSS)"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/findings?view=risks">
                Risk register <ArrowRight />
              </Link>
            </Button>
          }
        >
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
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {f!.code} · {lookups.targets[f!.targetId]?.name}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold uppercase" style={{ color: RISK_LEVEL_META[lvl].color }}>
                      {RISK_LEVEL_META[lvl].label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </ContentContainer>
  );
}
