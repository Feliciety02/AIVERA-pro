import { useParams } from "react-router";
import { Download, FileCheck2, FilePen, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { NotFoundState } from "@/components/shared/states";
import { ToneBadge } from "@/components/security/badges";
import { ReportDocument } from "@/components/reports/ReportDocument";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle } from "@/hooks";
import { useReportModel, usePdfExport } from "@/features/reports/useReport";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { reportService } from "@/services";

export default function ReportDetailPage() {
  const { reportId } = useParams();
  const user = useCurrentUser();
  const report = useDataStore((s) => s.reports.find((r) => r.id === reportId));
  useDocumentTitle(report?.code ?? "Report");
  const model = useReportModel(report);
  const { exportPdf, busy } = usePdfExport();

  if (!report || !model || (user?.role === "viewer" && report.status !== "final"))
    return (
      <ContentContainer>
        <NotFoundState entity="Report" backTo="/reports" backLabel="Back to reports" />
      </ContentContainer>
    );

  return (
    <ContentContainer>
      <div className="no-print">
        <PageHeader
          eyebrow={<span className="font-mono">{report.code}</span>}
          title={report.title}
          meta={<><ToneBadge tone={report.status === "final" ? "primary" : "muted"} dot>{report.status === "final" ? "Final" : "Draft"}</ToneBadge><ToneBadge tone="warning">Generated from demonstration data</ToneBadge><span className="text-[11px] text-muted-foreground">{formatDateTime(report.createdAt)}</span></>}
          actions={
            <>
              {can(user?.role, "generate_reports") && (
                <Button variant="outline" size="sm" onClick={() => { reportService.update(report.id, { status: report.status === "final" ? "draft" : "final" }); toast.success(report.status === "final" ? "Reverted to draft" : "Marked as final"); }}>
                  {report.status === "final" ? <FilePen /> : <FileCheck2 />} {report.status === "final" ? "Revert to draft" : "Mark final"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { reportService.logExport(report.id, "print"); window.print(); }}><Printer /> Print</Button>
              <Button size="sm" onClick={() => exportPdf(report)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF</Button>
            </>
          }
        />
      </div>
      <div className="rounded-lg bg-muted/40 p-3 sm:p-6 print:bg-transparent print:p-0">
        <ReportDocument model={model} />
      </div>
    </ContentContainer>
  );
}
