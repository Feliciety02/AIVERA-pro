import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { eachWeekOfInterval, endOfWeek, format, isWithinInterval, parseISO, startOfWeek, subWeeks } from "date-fns";
import { Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { Callout, KeyValue, MiniStat, SectionCard, UserChip } from "@/components/shared/display";
import { SeverityBadge, StatusBadge, OriginBadge } from "@/components/security/badges";
import { RiskMatrix } from "@/components/security/RiskMatrix";
import { ChartCard, DonutChart, TrendLines, summarize } from "@/components/charts/charts";
import { Field } from "@/components/forms/fields";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { MITIGATION_STATUS } from "@/lib/constants";
import { IMPACT_LABELS, LIKELIHOOD_LABELS, riskLevel, riskScore, RISK_LEVEL_META } from "@/lib/risk";
import { formatDate, toInputDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { riskService } from "@/services";
import type { LikertScore, MitigationStatus, Risk, RiskLevel } from "@/types";

const LEVELS: RiskLevel[] = ["critical", "high", "medium", "low"];

function RiskEditor({ risk, onClose, readOnly }: { risk: Risk; onClose: () => void; readOnly: boolean }) {
  const users = useDataStore((s) => s.users);
  const [draft, setDraft] = React.useState(risk);
  const score = riskScore(draft.likelihood, draft.impact);
  const lvl = riskLevel(draft);
  return (
    <>
      <SheetBody className="space-y-4">
        {!readOnly && <DialogGuide guideKey="riskEditor" steps={DIALOG_GUIDES.riskEditor} inSheet />}
        <div className="rounded-lg border p-3 text-center" style={{ borderColor: RISK_LEVEL_META[lvl].color }}>
          <p className="text-[11px] text-muted-foreground">Demo risk score (not CVSS)</p>
          <p className="text-3xl font-semibold tabular-nums" style={{ color: RISK_LEVEL_META[lvl].color }}>{score}</p>
          <p className="text-xs font-semibold" style={{ color: RISK_LEVEL_META[lvl].color }}>{RISK_LEVEL_META[lvl].label}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="rk-l" label="Likelihood">
            <Select value={String(draft.likelihood)} disabled={readOnly} onValueChange={(v) => setDraft({ ...draft, likelihood: Number(v) as LikertScore })}>
              <SelectTrigger id="rk-l"><SelectValue /></SelectTrigger>
              <SelectContent>{([1, 2, 3, 4, 5] as LikertScore[]).map((n) => <SelectItem key={n} value={String(n)}>{n} — {LIKELIHOOD_LABELS[n]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="rk-i" label="Impact">
            <Select value={String(draft.impact)} disabled={readOnly} onValueChange={(v) => setDraft({ ...draft, impact: Number(v) as LikertScore })}>
              <SelectTrigger id="rk-i"><SelectValue /></SelectTrigger>
              <SelectContent>{([1, 2, 3, 4, 5] as LikertScore[]).map((n) => <SelectItem key={n} value={String(n)}>{n} — {IMPACT_LABELS[n]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="rk-o" label="Assigned owner">
            <Select value={draft.ownerId} disabled={readOnly} onValueChange={(v) => setDraft({ ...draft, ownerId: v })}>
              <SelectTrigger id="rk-o"><SelectValue /></SelectTrigger>
              <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="rk-m" label="Mitigation status">
            <Select value={draft.mitigationStatus} disabled={readOnly} onValueChange={(v) => setDraft({ ...draft, mitigationStatus: v as MitigationStatus })}>
              <SelectTrigger id="rk-m"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(MITIGATION_STATUS) as MitigationStatus[]).map((m) => <SelectItem key={m} value={m}>{MITIGATION_STATUS[m].label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="rk-d" label="Review date" className="col-span-2">
            <Input id="rk-d" type="date" disabled={readOnly} className="[color-scheme:light] dark:[color-scheme:dark]" value={toInputDate(draft.reviewDate)} onChange={(e) => e.target.value && setDraft({ ...draft, reviewDate: new Date(`${e.target.value}T00:00:00Z`).toISOString() })} />
          </Field>
        </div>
        <Field id="rk-n" label="Notes">
          <Textarea id="rk-n" rows={3} disabled={readOnly} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
        <Button variant="link" size="sm" className="px-0" asChild>
          <Link to={`/findings/${risk.findingId}`}>Open related finding →</Link>
        </Button>
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {!readOnly && (
          <Button
            onClick={async () => {
              await riskService.update(risk.id, { likelihood: draft.likelihood, impact: draft.impact, ownerId: draft.ownerId, mitigationStatus: draft.mitigationStatus, reviewDate: draft.reviewDate, notes: draft.notes });
              toast.success("Risk record updated");
              onClose();
            }}
          >
            Save risk
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

export default function RisksPage() {
  useDocumentTitle("Risk Management");
  const loading = useInitialLoading();
  const user = useCurrentUser();
  const readOnly = !can(user?.role, "verify_findings");
  const lookups = useLookups();
  const { risks, findings } = useDataStore(useShallow((s) => ({ risks: s.risks, findings: s.findings })));
  const [cell, setCell] = React.useState<{ l: number; i: number } | null>(null);
  const [q, setQ] = React.useState("");
  const [level, setLevel] = React.useState(ALL);
  const [mit, setMit] = React.useState(ALL);
  const [editing, setEditing] = React.useState<Risk | null>(null);

  const findingById = React.useMemo(() => Object.fromEntries(findings.map((f) => [f.id, f])), [findings]);
  // Only human-confirmed findings are in the register.
  const active = React.useMemo(() => risks.filter((r) => findingById[r.findingId]?.verificationStatus === "confirmed"), [risks, findingById]);
  const open = active.filter((r) => r.mitigationStatus !== "mitigated" && r.mitigationStatus !== "accepted");

  const rows = React.useMemo(
    () =>
      active.filter(
        (r) =>
          (!cell || (r.likelihood === cell.l && r.impact === cell.i)) &&
          (level === ALL || riskLevel(r) === level) &&
          (mit === ALL || r.mitigationStatus === mit) &&
          (!q || r.title.toLowerCase().includes(q.toLowerCase()) || findingById[r.findingId]?.code.toLowerCase().includes(q.toLowerCase())),
      ),
    [active, cell, level, mit, q, findingById],
  );

  const distribution = LEVELS.map((k) => ({ key: k, name: RISK_LEVEL_META[k].label, value: open.filter((r) => riskLevel(r) === k).length, fill: RISK_LEVEL_META[k].color }));
  const avg = open.length ? (open.reduce((n, r) => n + riskScore(r.likelihood, r.impact), 0) / open.length).toFixed(1) : "0";

  const trend = React.useMemo(() => {
    const end = new Date();
    return eachWeekOfInterval({ start: startOfWeek(subWeeks(end, 11), { weekStartsOn: 1 }), end }, { weekStartsOn: 1 }).map((w) => {
      const until = endOfWeek(w, { weekStartsOn: 1 });
      const existing = active.filter((r) => parseISO(r.createdAt) <= until);
      const row: Record<string, string | number> = { week: format(w, "MMM d"), new: active.filter((r) => isWithinInterval(parseISO(r.createdAt), { start: w, end: until })).length };
      LEVELS.forEach((k) => (row[k] = existing.filter((r) => riskLevel(r) === k).length));
      return row;
    });
  }, [active]);

  const assets = React.useMemo(() => {
    const m = new Map<string, { targetId: string; count: number; max: number }>();
    open.forEach((r) => {
      const f = findingById[r.findingId];
      if (!f) return;
      const e = m.get(f.targetId) ?? { targetId: f.targetId, count: 0, max: 0 };
      e.count++;
      e.max = Math.max(e.max, riskScore(r.likelihood, r.impact));
      m.set(f.targetId, e);
    });
    return [...m.values()].sort((a, b) => b.max - a.max);
  }, [open, findingById]);

  const columns: ColumnDef<Risk, unknown>[] = [
    { id: "score", header: "Score", accessorFn: (r) => riskScore(r.likelihood, r.impact), cell: ({ row }) => { const l = riskLevel(row.original); return <span className="inline-flex w-9 justify-center rounded border px-1 py-0.5 text-xs font-bold tabular-nums" style={{ color: RISK_LEVEL_META[l].color, borderColor: RISK_LEVEL_META[l].color }}>{riskScore(row.original.likelihood, row.original.impact)}</span>; } },
    { id: "level", header: "Risk level", accessorFn: (r) => riskScore(r.likelihood, r.impact), cell: ({ row }) => <span className="text-xs font-semibold" style={{ color: RISK_LEVEL_META[riskLevel(row.original)].color }}>{RISK_LEVEL_META[riskLevel(row.original)].label}</span> },
    { accessorKey: "title", header: "Risk", cell: ({ row }) => <div className="min-w-56"><p className="truncate font-medium">{row.original.title}</p><p className="font-mono text-[11px] text-muted-foreground">{findingById[row.original.findingId]?.code} · {lookups.targets[findingById[row.original.findingId]?.targetId ?? ""]?.name}</p></div> },
    { id: "severity", header: "Severity", accessorFn: (r) => findingById[r.findingId]?.severity, cell: ({ row }) => { const f = findingById[row.original.findingId]; return f ? <SeverityBadge severity={f.severity} /> : null; } },
    { id: "li", header: "L × I", accessorFn: (r) => `${r.likelihood}×${r.impact}`, cell: ({ row }) => <span className="font-mono text-xs">L{row.original.likelihood} × I{row.original.impact}</span> },
    { id: "owner", header: "Owner", accessorFn: (r) => lookups.users[r.ownerId]?.name ?? "", cell: ({ row }) => <UserChip user={lookups.users[row.original.ownerId]} /> },
    { accessorKey: "mitigationStatus", header: "Mitigation", cell: ({ row }) => <StatusBadge status={row.original.mitigationStatus} map={MITIGATION_STATUS} /> },
    { accessorKey: "reviewDate", header: "Review date", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(getValue() as string)}</span> },
    { id: "origin", header: "Origin", accessorFn: (r) => findingById[r.findingId]?.dataOrigin, cell: ({ row }) => { const f = findingById[row.original.findingId]; return f ? <OriginBadge origin={f.dataOrigin} /> : null; } },
  ];

  return (
    <ContentContainer wide>
      <PageHeader title="Risk Management" description="Prioritise confirmed vulnerabilities using a deterministic likelihood × impact model." />
      <Callout icon={Info} title="Demo risk model — not CVSS">
        Scores here are a simple qualitative rating (likelihood 1–5 × impact 1–5), seeded from the finding's severity and adjustable by an assessor. They are not CVSS base scores. A CVSS calculator would require implementing the FIRST specification.
      </Callout>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat label="Open risks" value={open.length} />
        <MiniStat label="Critical" value={open.filter((r) => riskLevel(r) === "critical").length} tone="text-sev-critical" />
        <MiniStat label="High" value={open.filter((r) => riskLevel(r) === "high").length} tone="text-sev-high" />
        <MiniStat label="Average open score" value={avg} sub="out of 25" />
        <MiniStat label="Mitigated / accepted" value={active.length - open.length} tone="text-primary" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title="Risk matrix" description="All confirmed risks. Select a cell to filter the register." icon={TriangleAlert}>
          <RiskMatrix risks={active} selected={cell} onSelect={setCell} />
        </SectionCard>
        <div className="grid gap-4">
          <ChartCard title="Risk distribution" description="Open risks by level" summary={summarize(distribution)} raw height={200}>
            <DonutChart data={distribution} centerLabel="open" centerValue={open.length} />
          </ChartCard>
          <SectionCard title="Affected assets" description="Targets ranked by highest open risk">
            <ul className="space-y-2">
              {assets.length === 0 && <li className="text-xs text-muted-foreground">No open risks.</li>}
              {assets.map((a) => {
                const lvl = riskLevelFromMax(a.max);
                return (
                  <li key={a.targetId}>
                    <Link to={`/targets/${a.targetId}`} className="flex items-center gap-3 text-xs hover:text-primary">
                      <span className="w-6 text-right font-bold tabular-nums" style={{ color: RISK_LEVEL_META[lvl].color }}>{a.max}</span>
                      <span className="min-w-0 flex-1 truncate">{lookups.targets[a.targetId]?.name}</span>
                      <span className="text-muted-foreground">{a.count} open</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </div>
      </div>

      <ChartCard title="Risk trends" description="Cumulative confirmed risks by current level (12 weeks)" summary={trend.map((t) => `${t.week}: ${LEVELS.map((k) => `${k} ${t[k]}`).join(", ")}`).join("; ")}>
        <TrendLines data={trend} xKey="week" series={LEVELS.map((k) => ({ key: k, name: RISK_LEVEL_META[k].label, color: RISK_LEVEL_META[k].color }))} />
      </ChartCard>

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Risk register</p>
            <p className="text-[11px] text-muted-foreground">Priority findings sorted by demo score. Click a row for risk details.</p>
          </div>
          <FilterBar active={!!cell || level !== ALL || mit !== ALL || !!q} onReset={() => { setCell(null); setLevel(ALL); setMit(ALL); setQ(""); }}>
            {cell && <span className="rounded border border-primary/30 bg-primary/8 px-2 py-1 text-[11px] text-primary">Cell L{cell.l} × I{cell.i}</span>}
            <SearchInput value={q} onChange={setQ} placeholder="Search risks" className="sm:w-48" />
            <FilterSelect label="Levels" value={level} onChange={setLevel} options={LEVELS.map((k) => ({ value: k, label: RISK_LEVEL_META[k].label }))} />
            <FilterSelect label="Mitigation" value={mit} onChange={setMit} options={(Object.keys(MITIGATION_STATUS) as MitigationStatus[]).map((k) => ({ value: k, label: MITIGATION_STATUS[k].label }))} />
          </FilterBar>
        </div>
        <DataTable data={rows} columns={columns} getRowId={(r) => r.id} loading={loading} onRowClick={setEditing} initialSorting={[{ id: "score", desc: true }]} caption="Risk register" />
      </Card>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          {editing && (
            <>
              <SheetHeader>
                <SheetTitle>Risk details</SheetTitle>
                <SheetDescription>{editing.title}</SheetDescription>
              </SheetHeader>
              <div className="border-b border-border px-5 py-3">
                <dl className="grid grid-cols-2 gap-3">
                  <KeyValue label="Related finding"><span className="font-mono text-xs">{findingById[editing.findingId]?.code}</span></KeyValue>
                  <KeyValue label="Reported severity">{findingById[editing.findingId] && <SeverityBadge severity={findingById[editing.findingId]!.severity} />}</KeyValue>
                </dl>
              </div>
              <RiskEditor key={editing.id} risk={editing} readOnly={readOnly} onClose={() => setEditing(null)} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </ContentContainer>
  );
}

function riskLevelFromMax(score: number): RiskLevel {
  return score >= 20 ? "critical" : score >= 12 ? "high" : score >= 6 ? "medium" : "low";
}
