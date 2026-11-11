/**
 * Real, client-side PDF generation for demo reports (jsPDF + autotable).
 * jsPDF is loaded on demand so it does not weigh down the initial bundle.
 * The PDF is built purely from in-memory demo data — no network request.
 */
import type { ReportModel } from "@/features/reports/reportModel";
import { DEMO_DISCLAIMER, riskSummary } from "@/features/reports/reportModel";
import { CATEGORY_BY_ID, REMEDIATION_STATUS, SEVERITY_HEX, SEVERITY_META, SOURCE_LABEL, TOOL_META, VERIFICATION_STATUS, ENVIRONMENTS } from "./constants";
import { format } from "date-fns";

const fmt = (d?: string) => (d ? format(new Date(d), "MMM d, yyyy") : "—");

export async function generateReportPdf(m: ReportModel): Promise<Blob> {
  const [{ jsPDF, GState }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  const has = (k: string) => m.report.sections.includes(k as never);
  const emerald: [number, number, number] = [16, 185, 129];
  const ink: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [100, 116, 139];

  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (t: string) => {
    ensure(40);
    y += 8;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...ink).text(t, M, y);
    doc.setDrawColor(...emerald).setLineWidth(1.2).line(M, y + 5, M + 36, y + 5);
    y += 20;
  };
  const para = (t: string, size = 10, color = ink) => {
    doc.setFont("helvetica", "normal").setFontSize(size).setTextColor(...color);
    const lines = doc.splitTextToSize(t, W - M * 2) as string[];
    lines.forEach((l) => {
      ensure(size + 4);
      doc.text(l, M, y);
      y += size + 4;
    });
    y += 4;
  };
  const bullets = (items: string[]) => items.forEach((i) => para(`•  ${i}`));
  const table = (head: string[], body: (string | number)[][], opts: { colWidths?: number[] } = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 4, textColor: ink, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 23, 36], textColor: [241, 245, 249], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: opts.colWidths ? Object.fromEntries(opts.colWidths.map((w, i) => [i, { cellWidth: w }])) : undefined,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  };

  /* Cover */
  doc.setFillColor(11, 17, 27).rect(0, 0, W, 250, "F");
  doc.setFillColor(...emerald).rect(0, 250, W, 4, "F");
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(16, 185, 129).text("AEGIS AI", M, 70);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(148, 163, 184).text("Intelligent Security. Verified Decisions.", M, 86);
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(241, 245, 249);
  (doc.splitTextToSize(m.report.title, W - M * 2) as string[]).forEach((l, i) => doc.text(l, M, 140 + i * 26));
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(203, 213, 225).text(`${m.project.code} · ${m.project.name}`, M, 215);
  y = 290;
  doc.setFillColor(254, 243, 199).setDrawColor(234, 179, 8).roundedRect(M, y, W - M * 2, 46, 4, 4, "FD");
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(120, 53, 15);
  (doc.splitTextToSize(DEMO_DISCLAIMER, W - M * 2 - 20) as string[]).forEach((l, i) => doc.text(l, M + 10, y + 18 + i * 12));
  y += 70;
  table(["Field", "Value"], [
    ["Report ID", m.report.code],
    ["Status", m.report.status === "final" ? "Final" : "Draft"],
    ["Assessment period", `${fmt(m.report.periodStart)} – ${fmt(m.report.periodEnd)}`],
    ["Prepared by", m.preparedBy],
    ["Generated", format(new Date(), "MMM d, yyyy HH:mm")],
    ["Data source", "Demonstration data (synthetic / imported sample / simulated)"],
  ], { colWidths: [140] });

  /* Body */
  doc.addPage();
  y = M;
  if (has("assessment_info")) {
    heading("Assessment Information");
    table(["Item", "Detail"], [
      ["Project", `${m.project.code} — ${m.project.name}`],
      ["Owner", m.owner?.name ?? "—"],
      ["Organization", m.organization],
      ["Targets", m.targets.map((t) => `${t.name} (${t.url})`).join("\n")],
      ["Objectives", m.project.objectives],
    ], { colWidths: [110] });
  }
  if (has("executive_summary")) {
    heading("Executive Summary");
    para(m.report.executiveSummary || "No executive summary provided.");
    para(`Verified vulnerabilities: ${m.verified.length}. ${m.severityCounts.filter((c) => c.count).map((c) => `${c.label}: ${c.count}`).join(", ") || "None"}.`);
  }
  if (has("scope")) {
    heading("Scope and Authorization");
    table(["Target", "Environment", "In-scope hosts", "Excluded paths", "Authorization"], m.targets.map((t) => [t.name, ENVIRONMENTS[t.environment], t.scope.inScopeHosts.join(", "), t.scope.excludedPaths.join(", ") || "none", `${t.authorizationStatus} · ${t.authorizationReference}`]));
  }
  if (has("methodology")) {
    heading("Assessment Methodology");
    bullets(m.methodology);
  }
  if (has("tools")) {
    heading("Security Tools Used");
    table(["Tool", "Purpose"], m.tools.length ? m.tools.map((t) => [TOOL_META[t].label, TOOL_META[t].description]) : [["—", "No tool runs recorded in this period"]], { colWidths: [120] });
    para(`Scan records in period: ${m.scanOrigins.imported} imported sample, ${m.scanOrigins.simulated} simulated. No live scans were performed by this frontend.`, 9, muted);
  }
  if (has("findings_summary") || has("severity_distribution")) {
    heading("Findings Summary & Severity Distribution");
    table(["Severity", "Verified count"], m.severityCounts.map((c) => [c.label, c.count]), { colWidths: [160] });
    const total = Math.max(1, m.verified.length);
    m.severityCounts.forEach((c) => {
      ensure(16);
      doc.setFontSize(8).setTextColor(...muted).text(c.label, M, y + 8);
      doc.setFillColor(241, 245, 249).rect(M + 60, y, W - M * 2 - 60, 10, "F");
      const hex = SEVERITY_HEX[c.severity];
      doc.setFillColor(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)).rect(M + 60, y, ((W - M * 2 - 60) * c.count) / total, 10, "F");
      y += 15;
    });
    y += 6;
    if (m.verified.length) table(["ID", "Title", "Severity", "Target"], m.verified.map((f) => [f.code, f.title, SEVERITY_META[f.severity].label, m.targets.find((t) => t.id === f.targetId)?.name ?? ""]));
  }
  if (has("detailed_findings")) {
    heading("Detailed Verified Findings");
    if (!m.verified.length) para("No verified findings.");
    m.verified.forEach((f) => {
      ensure(80);
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...ink).text(`${f.code} — ${f.title}`, M, y, { maxWidth: W - M * 2 });
      y += 16;
      table(["Attribute", "Value"], [
        ["Severity", SEVERITY_META[f.severity].label],
        ["Verification", `${VERIFICATION_STATUS[f.verificationStatus].label} by human assessor`],
        ["Category", CATEGORY_BY_ID[f.category].name],
        ["Affected asset", f.affectedAsset],
        ["Source", `${SOURCE_LABEL[f.sourceTool]} · ${f.dataOrigin === "simulated" ? "SIMULATED (demo)" : f.dataOrigin}`],
        ["References", `${f.cwe ?? ""} ${f.owasp ?? ""}`],
        ["Description", f.description],
        ["Impact", f.impact],
      ], { colWidths: [100] });
      if (has("evidence")) {
        (m.evidence[f.id] ?? []).forEach((e) => {
          para(`Evidence: ${e.title} (${e.id})`, 9, muted);
          doc.setFont("courier", "normal").setFontSize(7.5).setTextColor(51, 65, 85);
          (doc.splitTextToSize(e.content, W - M * 2 - 12) as string[]).slice(0, 18).forEach((l) => {
            ensure(10);
            doc.text(l, M + 6, y);
            y += 9.5;
          });
          y += 6;
        });
      }
      if (has("remediation")) para(`Recommendation: ${f.remediation}`, 9.5);
    });
  }
  if (has("risk_assessment")) {
    heading("Risk Assessment");
    para("Demo qualitative risk model (likelihood × impact, 1–25). Not CVSS.", 9, muted);
    table(["Finding", "Risk score", "Mitigation"], m.verified.map((f) => [f.code, riskSummary(m.risks[f.id]), m.risks[f.id]?.mitigationStatus.replace("_", " ") ?? "—"]));
  }
  if (has("remediation")) {
    heading("Remediation Recommendations");
    const rows = m.verified.flatMap((f) => (m.remediation[f.id]?.length ? m.remediation[f.id]!.map((t) => [f.code, t.title, REMEDIATION_STATUS[t.status].label, fmt(t.dueDate)]) : [[f.code, f.remediation, "No task", "—"]]));
    table(["Finding", "Action", "Status", "Due"], rows.length ? rows : [["—", "No verified findings", "", ""]]);
  }
  if (has("unverified_observations") && m.report.includeUnverified) {
    heading("Appendix — Unverified Observations");
    para("The following observations have NOT been verified by an assessor and must not be treated as confirmed vulnerabilities.", 9.5, [180, 83, 9]);
    table(["ID", "Title", "Status", "Origin"], m.unverified.length ? m.unverified.map((f) => [f.code, f.title, VERIFICATION_STATUS[f.verificationStatus].label, f.dataOrigin]) : [["—", "None", "", ""]]);
  }
  if (has("conclusion")) {
    heading("Conclusion");
    para(m.conclusion);
  }
  if (has("assessor_info")) {
    heading("Assessor Information");
    table(["Name", "Role", "Contact"], m.assessors.map((u) => [u.name, u.title, u.email]));
  }

  /* Footer + watermark on every page */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (m.watermark) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.08 }));
      doc.setTextColor(15, 23, 42).setFont("helvetica", "bold").setFontSize(56);
      doc.text("DEMO DATA", W / 2, H / 2, { align: "center", angle: 35 });
      doc.restoreGraphicsState();
    }
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...muted);
    doc.text(`${m.report.code} · AEGIS AI demonstration report · not a real assessment`, M, H - 22);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  return doc.output("blob");
}
