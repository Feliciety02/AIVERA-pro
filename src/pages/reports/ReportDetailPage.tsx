import * as React from "react";
import { useParams } from "react-router";
import { Download, FileCheck2, FilePen, Loader2, Printer, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Callout } from "@/components/shared/display";
import { NotFoundState } from "@/components/shared/states";
import { StatusBadge, ToneBadge } from "@/components/security/badges";
import { ReportDocument } from "@/components/reports/ReportDocument";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { useReportModel, usePdfExport } from "@/features/reports/useReport";
import { REPORT_STATUS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { IS_API, reportService } from "@/services";

type Decision = "approve" | "return";

export default function ReportDetailPage() {
  const { reportId } = useParams();
  const user = useCurrentUser();
  const lookups = useLookups();
  const report = useDataStore((s) => s.reports.find((r) => r.id === reportId));
  useDocumentTitle(report?.code ?? "Report");
  const model = useReportModel(report);
  const { exportPdf, busy } = usePdfExport();
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  if (!report || !model || (!can(user?.role, "generate_reports") && report.status !== "final"))
    return (
      <ContentContainer>
        <NotFoundState entity="Report" backTo="/reports" backLabel="Back to reports" />
      </ContentContainer>
    );

  const isAuthor = report.createdBy === user?.id;
  const canWrite = can(user?.role, "generate_reports");
  const canApprove = can(user?.role, "approve_reports") && !isAuthor;

  const act = async (fn: () => Promise<void>, done: string) => {
    setSaving(true);
    try {
      await fn();
      toast.success(done);
      setDecision(null);
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const decide = () => {
    if (decision === "return" && note.trim().length < 5) return toast.error("Say what needs changing (min. 5 characters).");
    void act(() => (decision === "approve" ? reportService.approve(report.id, note.trim()) : reportService.sendBack(report.id, note.trim())), decision === "approve" ? "Report approved as final" : "Report sent back to the author");
  };

  return (
    <ContentContainer>
      <div className="no-print">
        <PageHeader
          eyebrow={<span className="font-mono">{report.code}</span>}
          title={report.title}
          meta={<><StatusBadge status={report.status} map={REPORT_STATUS} />{!IS_API && <ToneBadge tone="warning">Generated from demonstration data</ToneBadge>}<span className="text-[11px] text-muted-foreground">{formatDateTime(report.createdAt)}</span></>}
          actions={
            <>
              {IS_API ? (
                <>
                  {canWrite && report.status === "draft" && <Button size="sm" variant="outline" disabled={saving} onClick={() => act(() => reportService.submit(report.id), "Sent to the lead for approval")}><Send /> Submit for approval</Button>}
                  {canApprove && report.status === "in_review" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setDecision("return")}><Undo2 /> Send back</Button>
                      <Button size="sm" variant="outline" onClick={() => setDecision("approve")}><FileCheck2 /> Approve</Button>
                    </>
                  )}
                </>
              ) : (
                canWrite && (
                  <Button variant="outline" size="sm" onClick={() => { reportService.update(report.id, { status: report.status === "final" ? "draft" : "final" }); toast.success(report.status === "final" ? "Reverted to draft" : "Marked as final"); }}>
                    {report.status === "final" ? <FilePen /> : <FileCheck2 />} {report.status === "final" ? "Revert to draft" : "Mark final"}
                  </Button>
                )
              )}
              <Button variant="outline" size="sm" onClick={() => { reportService.logExport(report.id, "print"); window.print(); }}><Printer /> Print</Button>
              <Button size="sm" onClick={() => exportPdf(report)} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF</Button>
            </>
          }
        />
        {IS_API && report.status === "in_review" && (
          <Callout tone="info">{canApprove ? "This report is waiting for your approval. Critical and high findings in it must be signed off first." : isAuthor ? "With the lead for approval. You can edit it again if they send it back." : "With a lead for approval."}</Callout>
        )}
        {IS_API && report.status === "draft" && report.reviewNote && <Callout tone="warning" title="Sent back by the lead">{report.reviewNote}</Callout>}
        {report.status === "final" && report.approvedBy && (
          <p className="mb-3 text-xs text-muted-foreground">Approved by {lookups.users[report.approvedBy]?.name ?? "a lead"} on {formatDateTime(report.approvedAt)}{report.reviewNote ? `: ${report.reviewNote}` : ""}</p>
        )}
      </div>
      <div className="rounded-lg bg-muted/40 p-3 sm:p-6 print:bg-transparent print:p-0">
        <ReportDocument model={model} />
      </div>

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === "approve" ? "Approve as final" : "Send back for changes"}</DialogTitle>
            <DialogDescription>{decision === "approve" ? "The report becomes final and locked, and viewers on the project can read it." : "The report goes back to its author as a draft with your note."}</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision === "approve" ? "Note (optional)" : "What needs changing"} aria-label="Note" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={saving}>Cancel</Button>
            <Button onClick={decide} disabled={saving}>{saving && <Loader2 className="animate-spin" />} {decision === "approve" ? "Approve" : "Send back"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentContainer>
  );
}
