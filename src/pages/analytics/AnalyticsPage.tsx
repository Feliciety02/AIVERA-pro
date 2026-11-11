import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { differenceInCalendarWeeks, parseISO } from "date-fns";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { ChartCard, StackedBars, TrendArea, TrendLines, DonutChart, summarize } from "@/components/charts/charts";
import { ALL, DateRangeFilter, FilterSelect, type DateRange } from "@/components/shared/filters";
import { MiniStat } from "@/components/shared/display";
import { CardsSkeleton } from "@/components/shared/states";
import { useDataStore } from "@/stores/dataStore";
import { useDocumentTitle, useInitialLoading } from "@/hooks";
import { activityOverTime, categoryBreakdown, findingsOverTime, severityDistribution, verificationDistribution } from "@/features/metrics";
import { SEVERITIES, SEVERITY_META, SOURCE_LABEL } from "@/lib/constants";
import { percent } from "@/lib/utils";
import type { FindingSource } from "@/types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AnalyticsPage() {
  useDocumentTitle("Security Analytics");
  const loading = useInitialLoading();
  const s = useDataStore(useShallow((st) => ({ projects: st.projects, targets: st.targets, findings: st.findings, scans: st.scans, remediation: st.remediation, activity: st.activity, verifications: st.verifications })));
  const [range, setRange] = React.useState<DateRange>({ from: iso(new Date(Date.now() - 120 * 86400_000)), to: iso(new Date()) });
  const [projectId, setProjectId] = React.useState(ALL);

  const inRange = React.useCallback((d: string) => d.slice(0, 10) >= range.from && d.slice(0, 10) <= range.to, [range]);
  const f = React.useMemo(() => s.findings.filter((x) => (projectId === ALL || x.projectId === projectId) && inRange(x.discoveredAt)), [s.findings, projectId, inRange]);
  const scans = React.useMemo(() => s.scans.filter((x) => (projectId === ALL || x.projectId === projectId) && inRange(x.createdAt)), [s.scans, projectId, inRange]);
  const fIds = React.useMemo(() => new Set(f.map((x) => x.id)), [f]);
  const tasks = React.useMemo(() => s.remediation.filter((t) => fIds.has(t.findingId)), [s.remediation, fIds]);
  const acts = React.useMemo(() => s.activity.filter((a) => inRange(a.timestamp) && (projectId === ALL || a.entityId === projectId || (a.entityId && fIds.has(a.entityId)) || scans.some((x) => x.id === a.entityId))), [s.activity, inRange, projectId, fIds, scans]);

  const end = parseISO(range.to);
  const weeks = Math.min(26, Math.max(4, differenceInCalendarWeeks(end, parseISO(range.from)) + 1));
  const trend = React.useMemo(() => findingsOverTime(f, weeks, end), [f, weeks, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const activityTrend = React.useMemo(() => activityOverTime(acts, scans, weeks, end), [acts, scans, weeks, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const decided = f.filter((x) => x.verificationStatus === "confirmed" || x.verificationStatus === "rejected");
  const confirmed = f.filter((x) => x.verificationStatus === "confirmed");
  const closedTasks = tasks.filter((t) => t.status === "resolved" || t.status === "accepted_risk");

  const byTarget = s.targets
    .filter((t) => projectId === ALL || t.projectId === projectId)
    .map((t) => ({ name: t.name.replace(/\s*\(.*\)$/, ""), confirmed: f.filter((x) => x.targetId === t.id && x.verificationStatus === "confirmed").length, unverified: f.filter((x) => x.targetId === t.id && (x.verificationStatus === "pending" || x.verificationStatus === "needs_review")).length }))
    .filter((r) => r.confirmed + r.unverified > 0);
  const byTool = (Object.keys(SOURCE_LABEL) as FindingSource[]).map((t) => ({ name: SOURCE_LABEL[t], confirmed: f.filter((x) => x.sourceTool === t && x.verificationStatus === "confirmed").length, rejected: f.filter((x) => x.sourceTool === t && x.verificationStatus === "rejected").length, unverified: f.filter((x) => x.sourceTool === t && (x.verificationStatus === "pending" || x.verificationStatus === "needs_review")).length })).filter((r) => r.confirmed + r.rejected + r.unverified > 0);
  const byCategory = categoryBreakdown(f).filter((c) => c.total > 0);
  const verRate = trend.map((w) => ({ week: w.week, rate: w.total ? Math.round((w.confirmed / w.total) * 100) : 0, total: w.total }));
  const projectsCmp = s.projects
    .filter((p) => p.status !== "archived" && (projectId === ALL || p.id === projectId))
    .map((p) => {
      const pf = f.filter((x) => x.projectId === p.id);
      const pt = tasks.filter((t) => pf.some((x) => x.id === t.findingId));
      return { name: p.code, confirmed: pf.filter((x) => x.verificationStatus === "confirmed").length, unverified: pf.filter((x) => x.verificationStatus === "pending" || x.verificationStatus === "needs_review").length, remediated: pt.filter((t) => t.status === "resolved").length };
    });
  const remRate = [
    { key: "closed", name: "Closed", value: closedTasks.length, fill: "var(--primary)" },
    { key: "open", name: "Still open", value: tasks.length - closedTasks.length, fill: "var(--sev-medium)" },
  ];
  const sev = severityDistribution(confirmed);
  const ver = verificationDistribution(f);

  return (
    <ContentContainer wide>
      <PageHeader
        title="Security Analytics"
        description="Trends and comparisons computed live from the demo dataset. Filters apply to every chart."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Projects" value={projectId} onChange={setProjectId} options={s.projects.map((p) => ({ value: p.id, label: p.code }))} />
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        }
      />
      {loading ? (
        <CardsSkeleton count={5} className="xl:grid-cols-5" />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MiniStat label="Findings in range" value={f.length} />
          <MiniStat label="Confirmed" value={confirmed.length} tone="text-sev-high" />
          <MiniStat label="Verification rate" value={`${percent(decided.length, f.length)}%`} sub="findings with a final decision" />
          <MiniStat label="Confirmation rate" value={`${percent(confirmed.length, decided.length)}%`} sub="confirmed of decided" />
          <MiniStat label="Remediation rate" value={`${percent(closedTasks.length, tasks.length)}%`} sub={`${closedTasks.length}/${tasks.length} tasks closed`} tone="text-primary" />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Vulnerability trends" description="New findings vs. confirmed per week" summary={trend.map((t) => `${t.week}: ${t.total} new, ${t.confirmed} confirmed`).join("; ")}>
          <TrendArea data={trend} xKey="week" series={[{ key: "total", name: "New findings", color: "var(--cyan)" }, { key: "confirmed", name: "Confirmed", color: "var(--sev-high)" }]} />
        </ChartCard>
        <ChartCard title="Severity trends" description="Weekly findings by reported severity" summary={trend.map((t) => `${t.week}: ${SEVERITIES.map((k) => `${k} ${t[k]}`).join(", ")}`).join("; ")}>
          <StackedBars data={trend} xKey="week" series={SEVERITIES.map((k) => ({ key: k, name: SEVERITY_META[k].label, color: SEVERITY_META[k].color, stack: "s" }))} />
        </ChartCard>
        <ChartCard title="Findings by target" summary={byTarget.map((r) => `${r.name}: ${r.confirmed} confirmed, ${r.unverified} unverified`).join("; ")}>
          <StackedBars data={byTarget} xKey="name" layout="vertical" series={[{ key: "confirmed", name: "Confirmed", color: "var(--sev-high)", stack: "a" }, { key: "unverified", name: "Unverified", color: "var(--sev-medium)", stack: "a" }]} />
        </ChartCard>
        <ChartCard title="Findings by tool" description="Including rejected (false positive) counts" summary={byTool.map((r) => `${r.name}: ${r.confirmed} confirmed, ${r.rejected} rejected, ${r.unverified} unverified`).join("; ")}>
          <StackedBars data={byTool} xKey="name" series={[{ key: "confirmed", name: "Confirmed", color: "var(--sev-high)", stack: "a" }, { key: "unverified", name: "Unverified", color: "var(--sev-medium)", stack: "a" }, { key: "rejected", name: "Rejected", color: "var(--sev-info)", stack: "a" }]} />
        </ChartCard>
        <ChartCard title="Findings by category" summary={byCategory.map((c) => `${c.name}: ${c.total}`).join("; ")}>
          <StackedBars data={byCategory} xKey="name" layout="vertical" series={[{ key: "confirmed", name: "Confirmed", color: "var(--sev-high)", stack: "a" }, { key: "unverified", name: "Unverified", color: "var(--sev-medium)", stack: "a" }, { key: "rejected", name: "Rejected", color: "var(--sev-info)", stack: "a" }]} />
        </ChartCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChartCard title="Verification status" summary={summarize(ver)} raw height={220}>
            <DonutChart data={ver} centerLabel="findings" centerValue={f.length} />
          </ChartCard>
          <ChartCard title="Remediation rate" summary={summarize(remRate)} raw height={220}>
            <DonutChart data={remRate} centerLabel="closed" centerValue={`${percent(closedTasks.length, tasks.length)}%`} />
          </ChartCard>
        </div>
        <ChartCard title="Weekly confirmation rate" description="Share of each week's findings that were later confirmed (%)" summary={verRate.map((r) => `${r.week}: ${r.rate}%`).join("; ")}>
          <TrendLines data={verRate} xKey="week" series={[{ key: "rate", name: "Confirmed %", color: "var(--primary)" }]} />
        </ChartCard>
        <ChartCard title="Assessment activity" description="Scans and logged events per week" summary={activityTrend.map((a) => `${a.week}: ${a.scans} scans, ${a.events} events`).join("; ")}>
          <StackedBars data={activityTrend} xKey="week" series={[{ key: "scans", name: "Scans", color: "var(--cyan)" }, { key: "verifications", name: "Verification decisions", color: "var(--primary)" }, { key: "events", name: "All events", color: "var(--sev-info)" }]} />
        </ChartCard>
        <ChartCard title="Project comparison" summary={projectsCmp.map((p) => `${p.name}: ${p.confirmed} confirmed, ${p.unverified} unverified, ${p.remediated} remediated`).join("; ")} className="xl:col-span-2">
          <StackedBars data={projectsCmp} xKey="name" series={[{ key: "confirmed", name: "Confirmed", color: "var(--sev-high)" }, { key: "unverified", name: "Unverified", color: "var(--sev-medium)" }, { key: "remediated", name: "Remediated", color: "var(--primary)" }]} />
        </ChartCard>
        <ChartCard title="Confirmed severity mix" summary={summarize(sev)} raw height={220} className="xl:col-span-2">
          <DonutChart data={sev} centerLabel="confirmed" centerValue={confirmed.length} />
        </ChartCard>
      </div>
    </ContentContainer>
  );
}
