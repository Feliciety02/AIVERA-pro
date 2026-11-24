import * as React from "react";
import { Link, useParams } from "react-router";
import { Download, FileCheck2, FilePen, Loader2, Printer, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailLayout, FactList, SidePanel } from "@/components/shared/DetailLayout";
import { NotFoundState } from "@/components/shared/states";
import { StatusBadge, ToneBadge } from "@/components/security/badges";
import { ReportDocument } from "@/components/reports/ReportDocument";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { useReportModel, usePdfExport } from "@/features/reports/useReport";
import { REPORT_STATUS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
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

  // One sentence that says where the report stands and who acts next.
  const stage =
    report.status === "final"
      ? report.approvedBy
        ? `Approved by ${lookups.users[report.approvedBy]?.name ?? "a lead"} on ${formatDateTime(report.approvedAt)}.`
        : "Final. Ready to send."
      : IS_API && report.status === "in_review"
        ? canApprove
          ? "Waiting for your approval. Critical and high findings in it must be signed off first."
          : isAuthor
            ? "With the lead for approval. You can edit it again if they send it back."
            : "With a lead for approval."
        : IS_API
          ? "Draft. Submit it when the content is ready."
          : "Draft. Mark it final when the content is ready.";

  return (
    <ContentContainer wide>
      <div className="no-print">
        <PageHeader
          eyebrow={
            <>
              <Link to="/reports" className="hover:text-foreground">Reports</Link>
              <span>/</span>
              <span className="font-mono">{report.code}</span>
            </>
          }
          title={report.title}
          meta={
            <>
              <StatusBadge status={report.status} map={REPORT_STATUS} />
              {!IS_API && <ToneBadge tone="warning">Demonstration data</ToneBadge>}
            </>
          }
        />
      </div>

      <DetailLayout
        aside={
          <>
            <SidePanel tone="primary" title="Status">
              <p className="text-sm text-muted-foreground">{stage}</p>
              {IS_API && report.status === "draft" && report.reviewNote && (
                <p className="rounded-xl bg-warning/10 px-3.5 py-2.5 text-xs">
                  <span className="font-medium">Sent back: </span>
                  {report.reviewNote}
                </p>
              )}
              {report.status === "final" && report.reviewNote && <p className="text-xs">{report.reviewNote}</p>}
              <div className="space-y-2">
                {IS_API ? (
                  <>
                    {canWrite && report.status === "draft" && (
                      <Button className="w-full" disabled={saving} onClick={() => act(() => reportService.submit(report.id), "Sent to the lead for approval")}>
                        <Send /> Submit for approval
                      </Button>
                    )}
                    {canApprove && report.status === "in_review" && (
                      <>
                        <Button variant="success" className="w-full" onClick={() => setDecision("approve")}>
                          <FileCheck2 /> Approve as final
                        </Button>
                        <Button variant="warning-outline" className="w-full" onClick={() => setDecision("return")}>
                          <Undo2 /> Send back
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  canWrite && (
                    <Button
                      className="w-full"
                      variant={report.status === "final" ? "outline" : "default"}
                      onClick={() => {
                        reportService.update(report.id, { status: report.status === "final" ? "draft" : "final" });
                        toast.success(report.status === "final" ? "Reverted to draft" : "Marked as final");
                      }}
                    >
                      {report.status === "final" ? <FilePen /> : <FileCheck2 />} {report.status === "final" ? "Revert to draft" : "Mark final"}
                    </Button>
                  )
                )}
              </div>
            </SidePanel>

            <SidePanel title="Download">
              <Button className="w-full" variant={report.status === "final" ? "default" : "outline"} onClick={() => exportPdf(report)} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { reportService.logExport(report.id, "print"); window.print(); }}>
                <Printer /> Print
              </Button>
            </SidePanel>

            <SidePanel title="Details">
              <FactList
                items={[
                  { label: "Project", value: <Link to={`/projects/${report.projectId}`} className="hover:text-primary">{lookups.projects[report.projectId]?.code ?? "N/A"}</Link> },
                  { label: "Websites", value: report.targetIds.map((id) => lookups.targets[id]?.name).filter(Boolean).join(", ") || "N/A" },
                  { label: "Period", value: `${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}` },
                  { label: "Findings", value: report.findingIds.length },
                  { label: "Written by", value: lookups.users[report.createdBy]?.name ?? "N/A" },
                  { label: "Created", value: formatDateTime(report.createdAt) },
                ]}
              />
            </SidePanel>
          </>
        }
        main={
          <div className="rounded-2xl bg-muted/40 p-3 sm:p-6 print:bg-transparent print:p-0">
            <ReportDocument model={model} />
          </div>
        }
      />

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision === "approve" ? "Approve as final" : "Send back for changes"}</DialogTitle>
            <DialogDescription>{decision === "approve" ? "The report becomes final and locked, and everyone on the project can read it." : "The report goes back to its author as a draft with your note."}</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision === "approve" ? "Note (optional)" : "What needs changing"} aria-label="Note" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={saving}>Cancel</Button>
            <Button variant={decision === "approve" ? "success" : "warning"} onClick={decide} disabled={saving}>{saving && <Loader2 className="animate-spin" />} {decision === "approve" ? "Approve" : "Send back"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentContainer>
  );
}
