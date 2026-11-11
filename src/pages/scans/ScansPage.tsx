import * as React from "react";
import { Link, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { CircleCheck, CircleX, Clock, FileUp, FlaskConical, Import, Plus, Rocket, ScanLine } from "lucide-react";
import { ToolImportDialog } from "@/components/forms/ToolImportDialog";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { SectionCard } from "@/components/shared/display";
import { StatCard } from "@/components/dashboard/widgets";
import { StatusBadge, OriginBadge, ToolBadge } from "@/components/security/badges";
import { ScanProgress } from "@/components/security/ScanProgress";
import { ChartCard, StackedBars } from "@/components/charts/charts";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { SCAN_STATUS, TOOL_META } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Scan, ScanStatus, ScanTool } from "@/types";

export default function ScansPage() {
  useDocumentTitle("Scan Center");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const lookups = useLookups();
  const { scans, results, findings } = useDataStore(useShallow((s) => ({ scans: s.scans, results: s.scanResults, findings: s.findings })));
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(ALL);
  const [origin, setOrigin] = React.useState(ALL);
  const [tool, setTool] = React.useState(ALL);
  const [importOpen, setImportOpen] = React.useState(false);

  const rows = React.useMemo(
    () =>
      scans.filter(
        (s) =>
          (status === ALL || s.status === status) &&
          (origin === ALL || s.dataOrigin === origin) &&
          (tool === ALL || s.config.tools.includes(tool as ScanTool)) &&
          (!q || [s.name, s.code, lookups.targets[s.targetId]?.name ?? ""].some((f) => f.toLowerCase().includes(q.toLowerCase()))),
      ),
    [scans, status, origin, tool, q, lookups.targets],
  );

  const toolUsage = (Object.keys(TOOL_META) as ScanTool[]).map((t) => ({
    name: TOOL_META[t].label,
    imported: scans.filter((s) => s.config.tools.includes(t) && s.dataOrigin === "imported").length,
    simulated: scans.filter((s) => s.config.tools.includes(t) && s.dataOrigin === "simulated").length,
  }));

  const columns: ColumnDef<Scan, unknown>[] = [
    { accessorKey: "name", header: "Scan", cell: ({ row }) => <div className="min-w-48"><p className="font-medium">{row.original.name}</p><p className="font-mono text-[11px] text-muted-foreground">{row.original.code}</p></div> },
    { id: "target", header: "Target", accessorFn: (s) => lookups.targets[s.targetId]?.name ?? "", cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
    { id: "tools", header: "Tools", enableSorting: false, cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.config.tools.map((t) => <ToolBadge key={t} tool={t} />)}</div> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} map={SCAN_STATUS} /> },
    { id: "progress", header: "Progress", accessorFn: (s) => s.progress, cell: ({ row }) => <ScanProgress scan={row.original} compact /> },
    { accessorKey: "dataOrigin", header: "Result type", cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
    { id: "findings", header: "Findings", accessorFn: (s) => findings.filter((f) => f.scanId === s.id).length },
    { accessorKey: "createdAt", header: "Created", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(getValue() as string)}</span> },
  ];

  const recentResults = [...results].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 6);

  return (
    <ContentContainer wide>
      <PageHeader
        title="Scan Center"
        description="Configure and review security assessment runs. Real scanning requires the backend; this phase supports imported samples and clearly labelled simulations."
        actions={
          can(user?.role, "run_demo_scans") && (
            <>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp /> Import tool output
              </Button>
              <Button size="sm" asChild>
                <Link to="/scans/new">
                  <Plus /> New scan
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total scans" value={scans.length} icon={ScanLine} tooltip="All imported and simulated scan records." sub={`${scans.filter((s) => s.dataOrigin === "simulated").length} simulated · ${scans.filter((s) => s.dataOrigin === "imported").length} imported`} />
        <StatCard label="Completed" value={scans.filter((s) => s.status === "completed").length} icon={CircleCheck} iconTone="bg-primary/10 text-primary" tooltip="Scans with status Completed (imported samples or finished simulations)." />
        <StatCard label="Failed" value={scans.filter((s) => s.status === "failed").length} icon={CircleX} iconTone="bg-sev-critical/10 text-sev-critical" tooltip="Scans that ended in an error state." />
        <StatCard label="Pending / running" value={scans.filter((s) => s.status === "queued" || s.status === "running").length} icon={Clock} iconTone="bg-cyan/10 text-cyan" tooltip="Queued or running scans." />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Result types" description="How AEGIS distinguishes scan data" className="lg:col-span-1">
          <ul className="space-y-3 text-xs">
            <li className="flex gap-3">
              <Import className="mt-0.5 size-4 shrink-0 text-cyan" />
              <div>
                <p className="font-medium">Imported <OriginBadge origin="imported" className="ml-1" /></p>
                <p className="text-muted-foreground">Nmap XML / ZAP JSON reports parsed in the browser — bundled synthetic samples or files you supply from your own authorized runs. Scope-filtered on import.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-sev-medium" />
              <div>
                <p className="font-medium">Simulated <OriginBadge origin="simulated" className="ml-1" /></p>
                <p className="text-muted-foreground">Generated in-browser by “Run Demo Simulation”. Never usable as real evidence.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <Rocket className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">Future real results <OriginBadge origin="real" className="ml-1" /></p>
                <p className="text-muted-foreground">Will come from isolated backend scan workers once integrated. Not available in this phase.</p>
              </div>
            </li>
          </ul>
        </SectionCard>
        <ChartCard title="Tool usage statistics" description="Scans per tool by result type" summary={toolUsage.map((t) => `${t.name}: ${t.imported} imported, ${t.simulated} simulated`).join("; ")} className="lg:col-span-2" height={220}>
          <StackedBars data={toolUsage} xKey="name" series={[{ key: "imported", name: "Imported sample", color: "var(--cyan)", stack: "a" }, { key: "simulated", name: "Simulated", color: "var(--sev-medium)", stack: "a" }]} />
        </ChartCard>
      </div>

      <Card>
        <div className="border-b border-border p-3">
          <FilterBar active={status !== ALL || origin !== ALL || tool !== ALL || !!q} onReset={() => { setQ(""); setStatus(ALL); setOrigin(ALL); setTool(ALL); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search scans" />
            <FilterSelect label="Statuses" value={status} onChange={setStatus} options={(Object.keys(SCAN_STATUS) as ScanStatus[]).map((k) => ({ value: k, label: SCAN_STATUS[k].label }))} />
            <FilterSelect label="Result types" value={origin} onChange={setOrigin} options={[{ value: "imported", label: "Imported sample" }, { value: "simulated", label: "Simulated" }]} />
            <FilterSelect label="Tools" value={tool} onChange={setTool} options={(Object.keys(TOOL_META) as ScanTool[]).map((t) => ({ value: t, label: TOOL_META[t].label }))} />
          </FilterBar>
        </div>
        <DataTable data={rows} columns={columns} getRowId={(s) => s.id} loading={loading} onRowClick={(s) => navigate(`/scans/${s.id}`)} initialSorting={[{ id: "createdAt", desc: true }]} caption="Assessment history" />
      </Card>

      <SectionCard title="Recent scan results" description="Latest tool outputs recorded">
        <ul className="divide-y divide-border">
          {recentResults.map((r) => (
            <li key={r.id}>
              <Link to={`/scans/${r.scanId}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:text-primary">
                <ToolBadge tool={r.tool} />
                <span className="min-w-0 flex-1 truncate text-sm">{r.summary}</span>
                <OriginBadge origin={r.dataOrigin} />
                <span className="text-[11px] text-muted-foreground">{formatRelative(r.recordedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
      <ToolImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </ContentContainer>
  );
}
