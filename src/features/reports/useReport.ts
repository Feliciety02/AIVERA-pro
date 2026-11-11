import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { useDataStore } from "@/stores/dataStore";
import { buildReportModel, type ReportSource } from "./reportModel";
import { downloadBlob } from "@/lib/utils";
import { reportService } from "@/services";
import type { Report } from "@/types";

export function useReportSource(): ReportSource {
  return useDataStore(
    useShallow((s) => ({ projects: s.projects, targets: s.targets, users: s.users, findings: s.findings, evidence: s.evidence, risks: s.risks, remediation: s.remediation, scans: s.scans, settings: s.settings })),
  );
}

export function useReportModel(report: Report | undefined) {
  const src = useReportSource();
  return React.useMemo(() => (report ? buildReportModel(report, src) : null), [report, src]);
}

/** Generates and downloads a PDF from the current report state. */
export function usePdfExport() {
  const [busy, setBusy] = React.useState(false);
  const src = useReportSource();
  const exportPdf = React.useCallback(
    async (report: Report) => {
      const model = buildReportModel(report, src);
      if (!model) return toast.error("Report project no longer exists.");
      setBusy(true);
      try {
        const { generateReportPdf } = await import("@/lib/pdf");
        const blob = await generateReportPdf(model);
        downloadBlob(blob, `${report.code}-${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}${model.hasSimulated ? "-DEMO" : ""}.pdf`, "application/pdf");
        reportService.logExport(report.id, "PDF");
        toast.success("PDF downloaded", { description: model.sourceNotice });
      } catch (e) {
        console.error(e);
        toast.error("PDF generation failed", { description: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [src],
  );
  return { exportPdf, busy };
}
