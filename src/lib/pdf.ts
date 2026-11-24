/**
 * Client-side PDF generation for assessment reports (jsPDF + autotable).
 * jsPDF is loaded on demand so it does not weigh down the initial bundle.
 * The PDF is built from the current report model, no network request.
 */
import type { ReportModel } from "@/features/reports/reportModel";
import { riskSummary } from "@/features/reports/reportModel";
import { CATEGORY_BY_ID, REMEDIATION_STATUS, REPORT_STATUS, SEVERITY_HEX, SEVERITY_META, SOURCE_LABEL, TOOL_META, VERIFICATION_STATUS, ENVIRONMENTS } from "./constants";
import { format } from "date-fns";

const fmt = (d?: string) => (d ? format(new Date(d), "MMM d, yyyy") : "N/A");

/** The AIVERA logo as a PNG data URL (jsPDF cannot embed webp). Null if it cannot be loaded. */
async function logoPng(): Promise<string | null> {
  try {
    const img = new Image();
    img.src = "/aivera-logo.webp";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    c.getContext("2d")?.drawImage(img, 0, 0, 256, 256);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function generateReportPdf(m: ReportModel): Promise<Blob> {
  const [{ jsPDF, GState }, { default: autoTable }, logo] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logoPng()]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const TOP = 78; // body pages start below the running header
  let y = M;
  const has = (k: string) => m.report.sections.includes(k as never);
  const brand: [number, number, number] = [11, 87, 208];
  const ink: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [100, 116, 139];

  const ensure = (h: number) => {
    if (y + h > H - M - 10) {
      doc.addPage();
      y = TOP;
    }
  };
  let sectionNo = 0;
  const heading = (t: string) => {
    ensure(48);
    y += 12;
    sectionNo++;
    doc.setFillColor(...brand).roundedRect(M, y - 13, 18, 18, 3, 3, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255).text(String(sectionNo), M + 9, y - 1, { align: "center" });
    doc.setFontSize(13.5).setTextColor(...ink).text(t, M + 28, y);
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
      theme: "plain",
      styles: { fontSize: 8.5, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: { bottom: 0.5 } },
      headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: "bold", fontSize: 7.5, lineWidth: { top: 0.75, bottom: 0.75 }, lineColor: [203, 213, 225] },
      columnStyles: opts.colWidths ? Object.fromEntries(opts.colWidths.map((w, i) => [i, { cellWidth: w }])) : undefined,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  };

  /* Cover */
  const gradSteps = 40;
  for (let i = 0; i < gradSteps; i++) {
    const t = i / (gradSteps - 1);
    doc.setFillColor(Math.round(11 + (34 - 11) * t), Math.round(87 + (211 - 87) * t), Math.round(208 + (238 - 208) * t));
    doc.rect(M + ((W - M * 2) * i) / gradSteps, M, (W - M * 2) / gradSteps + 0.5, 4, "F");
  }
  if (logo) doc.addImage(logo, "PNG", M, M + 24, 34, 34);
  const lx = logo ? M + 44 : M;
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...ink).text("AIVERA", lx, M + 40, { charSpace: 2 });
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...muted).text("Intelligent Security. Verified Decisions.", lx, M + 53);
  doc.setDrawColor(220, 38, 38).setLineWidth(0.75).roundedRect(W - M - 82, M + 30, 82, 18, 2, 2, "S");
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(185, 28, 28).text("CONFIDENTIAL", W - M - 41, M + 42, { align: "center", charSpace: 1 });

  y = 330;
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...brand).text("SECURITY ASSESSMENT REPORT", M, y, { charSpace: 1.5 });
  y += 30;
  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(...ink);
  (doc.splitTextToSize(m.report.title, W - M * 2) as string[]).forEach((l) => {
    doc.text(l, M, y);
    y += 31;
  });
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...muted).text(`${m.project.name}  ·  ${m.project.code}`, M, y);
  y += 22;
  doc.setDrawColor(...brand).setLineWidth(1.5).line(M, y, M + 70, y);

  const meta: [string, string][] = [
    ["PREPARED FOR", m.organization],
    ["PREPARED BY", m.preparedBy],
    ["ASSESSMENT PERIOD", `${fmt(m.report.periodStart)} to ${fmt(m.report.periodEnd)}`],
    ["REPORT ID", m.report.code],
    ["STATUS", REPORT_STATUS[m.report.status].label],
    ["ISSUED", format(new Date(), "MMM d, yyyy")],
  ];
  const colW = (W - M * 2) / 3;
  meta.forEach(([k, v], i) => {
    const x = M + (i % 3) * colW;
    const yy = H - 210 + Math.floor(i / 3) * 44;
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...muted).text(k, x, yy, { charSpace: 0.8 });
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...ink).text(doc.splitTextToSize(v, colW - 12) as string[], x, yy + 14);
  });
  doc.setFillColor(255, 251, 235).setDrawColor(251, 191, 36).setLineWidth(0.5);
  const notice = doc.splitTextToSize(m.sourceNotice, W - M * 2 - 24) as string[];
  const nh = 14 + notice.length * 11;
  doc.rect(M, H - 110, W - M * 2, nh, "F");
  doc.setFillColor(251, 191, 36).rect(M, H - 110, 3, nh, "F");
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(120, 53, 15);
  notice.forEach((l, i) => doc.text(l, M + 14, H - 110 + 15 + i * 11));

  /* Body */
  doc.addPage();
  y = TOP;
  if (has("assessment_info")) {
    heading("Assessment Information");
    table(["Item", "Detail"], [
      ["Project", `${m.project.code} · ${m.project.name}`],
      ["Owner", m.owner?.name ?? "N/A"],
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
    table(["Tool", "Purpose"], m.tools.length ? m.tools.map((t) => [TOOL_META[t].label, TOOL_META[t].description]) : [["N/A", "No tool runs recorded in this period"]], { colWidths: [120] });
    para(`Scan records in period: ${m.scanOrigins.real} live, ${m.scanOrigins.imported} imported, ${m.scanOrigins.simulated} simulated.`, 9, muted);
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
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...ink).text(`${f.code} · ${f.title}`, M, y, { maxWidth: W - M * 2 });
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
    para("Qualitative risk model (likelihood × impact, 1 to 25). Not CVSS.", 9, muted);
    table(["Finding", "Risk score", "Mitigation"], m.verified.map((f) => [f.code, riskSummary(m.risks[f.id]), m.risks[f.id]?.mitigationStatus.replace("_", " ") ?? "N/A"]));
  }
  if (has("remediation")) {
    heading("Remediation Recommendations");
    const rows = m.verified.flatMap((f) => (m.remediation[f.id]?.length ? m.remediation[f.id]!.map((t) => [f.code, t.title, REMEDIATION_STATUS[t.status].label, fmt(t.dueDate)]) : [[f.code, f.remediation, "No task", "N/A"]]));
    table(["Finding", "Action", "Status", "Due"], rows.length ? rows : [["N/A", "No verified findings", "", ""]]);
  }
  if (has("unverified_observations") && m.report.includeUnverified) {
    heading("Appendix, Unverified Observations");
    para("The following observations have NOT been verified by an assessor and must not be treated as confirmed vulnerabilities.", 9.5, [180, 83, 9]);
    table(["ID", "Title", "Status", "Origin"], m.unverified.length ? m.unverified.map((f) => [f.code, f.title, VERIFICATION_STATUS[f.verificationStatus].label, f.dataOrigin]) : [["N/A", "None", "", ""]]);
  }
  if (has("conclusion")) {
    heading("Conclusion");
    para(m.conclusion);
  }
  if (has("assessor_info")) {
    heading("Assessor Information");
    table(["Name", "Role", "Contact"], m.assessors.map((u) => [u.name, u.title, u.email]));
  }

  /* Running header, footer and watermark */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (m.watermark) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.06 }));
      doc.setTextColor(15, 23, 42).setFont("helvetica", "bold").setFontSize(56);
      doc.text("DEMO DATA", W / 2, H / 2, { align: "center", angle: 35 });
      doc.restoreGraphicsState();
    }
    if (i > 1) {
      if (logo) doc.addImage(logo, "PNG", M, 30, 13, 13);
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...ink).text("AIVERA", M + (logo ? 18 : 0), 40, { charSpace: 1 });
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...muted);
      doc.text(doc.splitTextToSize(m.report.title, W / 2) as string[], M + (logo ? 64 : 46), 40);
      doc.text(m.report.code, W - M, 40, { align: "right" });
      doc.setDrawColor(226, 232, 240).setLineWidth(0.5).line(M, 52, W - M, 52);
    }
    doc.setDrawColor(226, 232, 240).setLineWidth(0.5).line(M, H - 34, W - M, H - 34);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...muted);
    doc.text(`Confidential  ·  AIVERA security assessment${m.hasSimulated ? "  ·  includes demo data" : ""}`, M, H - 22);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  return doc.output("blob");
}
