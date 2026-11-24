import * as React from "react";
import { Link, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { Activity, Bug, Clock, FileUp, Plus, RotateCcw, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { scanService } from "@/services";
import { ToolImportDialog } from "@/components/forms/ToolImportDialog";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { StatusBadge, OriginBadge, ToolBadge } from "@/components/security/badges";
import { ScanProgress } from "@/components/security/ScanProgress";
import { SeverityStrip } from "@/components/security/SeverityStrip";
import { StatCard } from "@/components/dashboard/widgets";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { SCAN_STATUS, TOOL_META } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Scan, ScanStatus, ScanTool } from "@/types";

const STATUS_COLOR: Record<ScanStatus, string> = {
  queued: "var(--muted-foreground)",
  running: "var(--cyan)",
  paused: "var(--warning)",
  completed: "var(--primary)",
  failed: "var(--sev-critical)",
  cancelled: "var(--muted-foreground)",
};

export default function ScansPage() {
  useDocumentTitle("Scans");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const lookups = useLookups();
  const { scans, findings } = useDataStore(useShallow((s) => ({ scans: s.scans, findings: s.findings })));
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(ALL);
  const [origin, setOrigin] = React.useState(ALL);
  const [tool, setTool] = React.useState(ALL);
  const [importOpen, setImportOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const running = scans.filter((x) => x.status === "running" || x.status === "queued").length;
  const latest = [...scans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const simulatedScans = scans.filter((s) => s.dataOrigin === "simulated").length;
  const simulatedFindings = useDataStore((s) => s.findings.filter((f) => f.dataOrigin === "simulated").length);

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

  const columns: ColumnDef<Scan, unknown>[] = [
    {
      accessorKey: "name",
      header: "Scan",
      cell: ({ row }) => {
        const color = STATUS_COLOR[row.original.status];
        return (
          <div className="flex min-w-48 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }} aria-hidden>
              <ScanLine className={row.original.status === "running" ? "size-4 animate-pulse" : "size-4"} />
            </span>
            <div className="min-w-0">
              <p className="font-medium">{row.original.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{row.original.code}</p>
            </div>
          </div>
        );
      },
    },
    { id: "target", header: "Website", accessorFn: (s) => lookups.targets[s.targetId]?.name ?? "", cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
    { id: "tools", header: "Tools", enableSorting: false, cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.config.tools.map((t) => <ToolBadge key={t} tool={t} />)}</div> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} map={SCAN_STATUS} /> },
    { id: "progress", header: "Progress", accessorFn: (s) => s.progress, cell: ({ row }) => <ScanProgress scan={row.original} compact /> },
    { accessorKey: "dataOrigin", header: "Result type", cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
    { id: "findings", header: "Findings", accessorFn: (s) => findings.filter((f) => f.scanId === s.id).length, cell: ({ row }) => <SeverityStrip severities={findings.filter((f) => f.scanId === row.original.id).map((f) => f.severity)} /> },
    { accessorKey: "createdAt", header: "Created", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(getValue() as string)}</span> },
  ];


  return (
    <ContentContainer wide>
      <PageHeader
        title="Scans"
        actions={
          can(user?.role, "run_demo_scans") && (
            <>
              {(simulatedScans > 0 || simulatedFindings > 0) && (
                <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)}>
                  <RotateCcw /> Reset simulated data
                </Button>
              )}
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
      {scans.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Scans run" value={scans.length} icon={ScanLine} accent="var(--primary)" tooltip="Every scan, practice run and tool import in your projects." sub={`${scans.filter((x) => x.status === "completed").length} completed`} />
          <StatCard label="Running now" value={running} icon={Activity} accent="var(--cyan)" tooltip="Scans that are queued or still running." sub={running ? "in progress" : "nothing running"} />
          <StatCard label="Findings produced" value={findings.filter((f) => f.scanId).length} icon={Bug} accent="var(--sev-high)" tooltip="Findings that came from a scan or import. Each still needs a person to verify it." sub="from scans and imports" to="/findings" />
          <StatCard label="Last scan" value={latest ? formatRelative(latest.createdAt) : "Never"} icon={Clock} accent="var(--success)" tooltip="When the most recent scan was started." sub={latest ? latest.code : undefined} to={latest ? `/scans/${latest.id}` : undefined} />
        </div>
      )}
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar active={status !== ALL || origin !== ALL || tool !== ALL || !!q} onReset={() => { setQ(""); setStatus(ALL); setOrigin(ALL); setTool(ALL); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search scans" />
            <FilterSelect label="Statuses" value={status} onChange={setStatus} options={(Object.keys(SCAN_STATUS) as ScanStatus[]).map((k) => ({ value: k, label: SCAN_STATUS[k].label }))} />
            <FilterSelect label="Result types" value={origin} onChange={setOrigin} options={[{ value: "real", label: "Live result" }, { value: "imported", label: "Imported" }, { value: "simulated", label: "Simulated" }]} />
            <FilterSelect label="Tools" value={tool} onChange={setTool} options={(Object.keys(TOOL_META) as ScanTool[]).map((t) => ({ value: t, label: TOOL_META[t].label }))} />
          </FilterBar>
        </div>
        <DataTable data={rows} columns={columns} getRowId={(s) => s.id} loading={loading} onRowClick={(s) => navigate(`/scans/${s.id}`)} initialSorting={[{ id: "createdAt", desc: true }]} caption="Assessment history" />
      </Card>

      <ToolImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset simulated data?"
        description={`This permanently removes ${simulatedScans} simulated scan(s) and ${simulatedFindings} simulated finding(s), with their evidence, decisions, risks, fix tasks and AI analyses. Real and imported results, and findings you recorded yourself, are not touched.`}
        confirmLabel="Remove simulated data"
        destructive
        onConfirm={async () => {
          const r = await scanService.removeSimulatedData();
          toast.success("Simulated data removed", { description: `${r.scans} scan(s) and ${r.findings} finding(s) removed. Real results were kept.` });
        }}
      />
    </ContentContainer>
  );
}
