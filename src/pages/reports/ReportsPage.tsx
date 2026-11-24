import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileText, Loader2, Plus } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/security/badges";
import { SeverityStrip } from "@/components/security/SeverityStrip";
import { CreateReportDialog } from "@/components/forms/CreateReportDialog";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { REPORT_STATUS, REPORT_TEMPLATES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { usePdfExport } from "@/features/reports/useReport";
import type { Report, Severity } from "@/types";

const STATUS_COLOR: Record<string, string> = { draft: "var(--muted-foreground)", in_review: "var(--warning)", final: "var(--success)" };

export default function ReportsPage() {
  useDocumentTitle("Reports");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const lookups = useLookups();
  const canWrite = can(user?.role, "generate_reports");
  const allReports = useDataStore((s) => s.reports);
  const findings = useDataStore((s) => s.findings);
  const severityOf = React.useMemo(() => new Map(findings.map((f) => [f.id, f.severity])), [findings]);
  // People who don't write reports only see approved ones (the server applies the same rule).
  const reports = React.useMemo(() => (!canWrite ? allReports.filter((r) => r.status === "final") : allReports), [allReports, canWrite]);
  const { exportPdf, busy } = usePdfExport();
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(ALL);

  // ?new=1 (optionally &project=…) opens the create dialog, so other pages can link straight to it.
  const [params, setParams] = useSearchParams();
  const createOpen = canWrite && params.get("new") === "1";
  const setCreateOpen = (o: boolean) => setParams(o ? { new: "1" } : {}, { replace: true });

  const rows = reports.filter((r) => (status === ALL || r.status === status) && (!q || [r.title, r.code].some((x) => x.toLowerCase().includes(q.toLowerCase()))));

  const columns: ColumnDef<Report, unknown>[] = [
    {
      accessorKey: "title",
      header: "Report",
      cell: ({ row }) => (
        <div className="flex min-w-60 items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `color-mix(in srgb, ${STATUS_COLOR[row.original.status] ?? "var(--primary)"} 14%, transparent)`, color: STATUS_COLOR[row.original.status] ?? "var(--primary)" }}
            aria-hidden
          >
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{row.original.title}</p>
            <p className="text-[11px] text-muted-foreground"><span className="font-mono">{row.original.code}</span> · {REPORT_TEMPLATES.find((t) => t.id === row.original.templateId)?.name.replace(" Report", "")} · {lookups.projects[row.original.projectId]?.name}</p>
          </div>
        </div>
      ),
    },
    { id: "findings", header: "Findings", accessorFn: (r) => r.findingIds.length, cell: ({ row }) => <SeverityStrip severities={row.original.findingIds.map((id) => severityOf.get(id)).filter((x): x is Severity => !!x)} /> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} map={REPORT_STATUS} /> },
    { accessorKey: "createdAt", header: "Created", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(getValue() as string)}</span> },
    {
      id: "export",
      header: () => <span className="sr-only">Download</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async (e) => {
            e.stopPropagation();
            setExporting(row.original.id);
            await exportPdf(row.original);
            setExporting(null);
          }}
        >
          {exporting === row.original.id ? <Loader2 className="animate-spin" /> : <Download />} PDF
        </Button>
      ),
    },
  ];

  return (
    <ContentContainer wide>
      <PageHeader title="Reports" actions={canWrite && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> Create report</Button>} />

      <Card>
        {reports.length > 0 && (
          <div className="border-b border-border p-3">
            <FilterBar active={status !== ALL || !!q} onReset={() => { setQ(""); setStatus(ALL); }}>
              <SearchInput value={q} onChange={setQ} placeholder="Search reports" />
              {canWrite && <FilterSelect label="Statuses" value={status} onChange={setStatus} options={Object.entries(REPORT_STATUS).map(([value, m]) => ({ value, label: m.label }))} />}
            </FilterBar>
          </div>
        )}
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          loading={loading}
          onRowClick={(r) => navigate(`/reports/${r.id}`)}
          initialSorting={[{ id: "createdAt", desc: true }]}
          caption="Reports"
          empty={<EmptyState icon={FileText} title="No reports yet" description={canWrite ? "Create one from the findings people confirmed." : "Reports appear here once an administrator approves them."} action={canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> Create report</Button> : undefined} />}
        />
      </Card>

      {canWrite && <CreateReportDialog open={createOpen} onOpenChange={setCreateOpen} initialProjectId={params.get("project") ?? undefined} />}
    </ContentContainer>
  );
}
