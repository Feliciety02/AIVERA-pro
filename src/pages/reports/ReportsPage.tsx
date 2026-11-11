import * as React from "react";
import { Link, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, FileText, Loader2, Plus, LayoutTemplate } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { Callout, SectionCard } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { REPORT_TEMPLATES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { usePdfExport } from "@/features/reports/useReport";
import type { Report } from "@/types";

export default function ReportsPage() {
  useDocumentTitle("Reports");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const lookups = useLookups();
  const allReports = useDataStore((s) => s.reports);
  // Viewers only see finalized reports (UI demonstration of role scoping).
  const reports = React.useMemo(() => (user?.role === "viewer" ? allReports.filter((r) => r.status === "final") : allReports), [allReports, user?.role]);
  const { exportPdf, busy } = usePdfExport();
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(ALL);
  const [project, setProject] = React.useState(ALL);

  const rows = reports.filter((r) => (status === ALL || r.status === status) && (project === ALL || r.projectId === project) && (!q || [r.title, r.code].some((x) => x.toLowerCase().includes(q.toLowerCase()))));

  const columns: ColumnDef<Report, unknown>[] = [
    { accessorKey: "code", header: "Report", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "title", header: "Title", cell: ({ row }) => <div className="min-w-60"><p className="font-medium">{row.original.title}</p><p className="text-[11px] text-muted-foreground">{REPORT_TEMPLATES.find((t) => t.id === row.original.templateId)?.name}</p></div> },
    { id: "project", header: "Project", accessorFn: (r) => lookups.projects[r.projectId]?.code, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { id: "findings", header: "Verified findings", accessorFn: (r) => r.findingIds.length },
    { id: "period", header: "Period", accessorFn: (r) => r.periodStart, cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.original.periodStart)}, {formatDate(row.original.periodEnd)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <ToneBadge tone={row.original.status === "final" ? "primary" : "muted"} dot>{row.original.status === "final" ? "Final" : "Draft"}</ToneBadge> },
    { id: "source", header: "Source", cell: () => <ToneBadge tone="warning">Demo data</ToneBadge> },
    { accessorKey: "createdAt", header: "Generated", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(getValue() as string)}</span> },
    {
      id: "export",
      header: () => <span className="sr-only">Export</span>,
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
      <PageHeader
        title="Security Reports"
        description="Generate print-friendly reports that clearly separate verified findings from unverified observations."
        actions={can(user?.role, "generate_reports") && <Button size="sm" asChild><Link to="/reports/new"><Plus /> Create report</Link></Button>}
      />
      <Callout tone="demo" title="Demonstration reports">All reports are generated from demonstration data and are watermarked accordingly. They must not be presented as real security assessment reports.</Callout>

      <SectionCard title="Report templates" icon={LayoutTemplate} description="Start a report from a template">
        <div className="grid gap-3 md:grid-cols-3">
          {REPORT_TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-border p-4">
              <FileText className="size-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">{t.name}</p>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">{t.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{t.sections.length} sections</p>
              {can(user?.role, "generate_reports") && (
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link to={`/reports/new?template=${t.id}`}>Use template</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <Card>
        <div className="border-b border-border p-3">
          <FilterBar active={status !== ALL || project !== ALL || !!q} onReset={() => { setQ(""); setStatus(ALL); setProject(ALL); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search reports" />
            <FilterSelect label="Statuses" value={status} onChange={setStatus} options={[{ value: "draft", label: "Draft" }, { value: "final", label: "Final" }]} />
            <FilterSelect label="Projects" value={project} onChange={setProject} options={Object.values(lookups.projects).map((p) => ({ value: p.id, label: p.code }))} />
          </FilterBar>
        </div>
        <DataTable data={rows} columns={columns} getRowId={(r) => r.id} loading={loading} onRowClick={(r) => navigate(`/reports/${r.id}`)} initialSorting={[{ id: "createdAt", desc: true }]} caption="Report history" empty={<EmptyState icon={FileText} title="No reports" description={user?.role === "viewer" ? "Viewers see finalized reports only." : "Create a report from verified findings."} />} />
      </Card>
    </ContentContainer>
  );
}
