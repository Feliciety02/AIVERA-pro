import * as React from "react";
import { useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { FileUp, RotateCcw, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { scanService } from "@/services";
import { ToolImportDialog } from "@/components/forms/ToolImportDialog";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { AddButton } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { StatusBadge } from "@/components/security/badges";
import { ScanProgress } from "@/components/security/ScanProgress";
import { SeverityStrip } from "@/components/security/SeverityStrip";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { SCAN_STATUS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Scan, ScanStatus } from "@/types";

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
  const [importOpen, setImportOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const simulatedScans = scans.filter((s) => s.dataOrigin === "simulated").length;
  const simulatedFindings = useDataStore((s) => s.findings.filter((f) => f.dataOrigin === "simulated").length);

  const rows = React.useMemo(
    () =>
      scans.filter(
        (s) =>
          (status === ALL || s.status === status) &&
          (!q || [s.name, s.code, lookups.targets[s.targetId]?.name ?? ""].some((f) => f.toLowerCase().includes(q.toLowerCase()))),
      ),
    [scans, status, q, lookups.targets],
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
              <p className="text-[11px] text-muted-foreground">{lookups.targets[row.original.targetId]?.name ?? "Unknown website"}{row.original.dataOrigin === "simulated" ? " · practice" : row.original.dataOrigin === "imported" ? " · imported" : ""}</p>
            </div>
          </div>
        );
      },
    },
    // Running scans show their progress; finished ones just their status.
    { accessorKey: "status", header: "Status", cell: ({ row }) => (row.original.status === "running" || row.original.status === "queued" ? <div className="w-40"><ScanProgress scan={row.original} compact /></div> : <StatusBadge status={row.original.status} map={SCAN_STATUS} />) },
    { id: "findings", header: "Findings", accessorFn: (s) => findings.filter((f) => f.scanId === s.id).length, cell: ({ row }) => <SeverityStrip severities={findings.filter((f) => f.scanId === row.original.id).map((f) => f.severity)} /> },
    { accessorKey: "createdAt", header: "When", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatRelative(getValue() as string)}</span> },
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
              <AddButton to="/scans/new">New scan</AddButton>
            </>
          )
        }
      />
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar active={status !== ALL || !!q} onReset={() => { setQ(""); setStatus(ALL); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search scans" />
            <FilterSelect label="Statuses" value={status} onChange={setStatus} options={(Object.keys(SCAN_STATUS) as ScanStatus[]).map((k) => ({ value: k, label: SCAN_STATUS[k].label }))} />
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
