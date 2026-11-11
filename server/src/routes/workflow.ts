import { Router } from "express";
import { z } from "zod";
import type { ReportSectionKey, Severity } from "@/types";
import { REPORT_SECTIONS, SEVERITIES } from "@/lib/constants";
import { newId, nextCode, prisma } from "../db.ts";
import { requireAuth, requirePermission } from "../auth.ts";
import { log, notify } from "../audit.ts";
import { fail, me, param, parse } from "../http.ts";
import * as M from "../mappers.ts";

export const router = Router();
router.use(requireAuth);

const severityEnum = z.enum(SEVERITIES as [Severity, ...Severity[]]);
const statusEnum = z.enum(["open", "in_progress", "awaiting_retest", "resolved", "accepted_risk"]);

/* ------------------------------ Remediation ------------------------------- */
const taskBody = z.object({
  findingId: z.string(),
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(5).max(1000),
  recommendation: z.string().trim().min(5).max(4000),
  ownerId: z.string(),
  priority: severityEnum,
  dueDate: z.string().datetime(),
  retestRequired: z.boolean(),
});

router.post("/remediation", requirePermission("manage_remediation"), async (req, res) => {
  const b = parse(taskBody, req.body);
  const f = (await prisma.finding.findUnique({ where: { id: b.findingId } })) ?? fail(404, "Finding not found");
  if (f.verificationStatus !== "confirmed") fail(400, "Remediation tasks can only be created for confirmed findings.");
  const now = new Date();
  const code = nextCode("REM", (await prisma.remediationTask.findMany({ select: { code: true } })).map((t) => t.code));
  const t = await prisma.remediationTask.create({
    data: { ...b, id: newId("rem"), code, dueDate: new Date(b.dueDate), status: "open", retestResult: b.retestRequired ? "pending" : "not_required", createdAt: now, updatedAt: now, history: { create: [{ at: now, by: me(req).id, to: "open", note: "Task created." }] } },
    include: { history: true },
  });
  await log(me(req).id, "remediation_created", "remediation", t.id, t.code, `Created remediation task for ${f.code}`);
  res.status(201).json(M.toTask(t));
});

router.patch("/remediation/:id", requirePermission("manage_remediation"), async (req, res) => {
  const b = parse(taskBody.omit({ findingId: true }).partial(), req.body);
  const cur = (await prisma.remediationTask.findUnique({ where: { id: param(req) } })) ?? fail(404, "Task not found");
  const retestResult = b.retestRequired === undefined ? undefined : b.retestRequired ? (cur.retestResult === "not_required" ? "pending" : cur.retestResult) : "not_required";
  const t = await prisma.remediationTask.update({ where: { id: cur.id }, data: { ...b, dueDate: b.dueDate ? new Date(b.dueDate) : undefined, retestResult, updatedAt: new Date() }, include: { history: true } });
  await log(me(req).id, "remediation_updated", "remediation", t.id, t.code, "Updated remediation task details");
  res.json(M.toTask(t));
});

/** Status transitions. "Resolved" requires a human approval and, if required, a passed retest. */
router.post("/remediation/:id/status", requirePermission("manage_remediation"), async (req, res) => {
  const { to, note } = parse(z.object({ to: statusEnum, note: z.string().max(2000) }), req.body);
  const cur = (await prisma.remediationTask.findUnique({ where: { id: param(req) } })) ?? fail(404, "Task not found");
  if (to === "resolved" && cur.retestRequired && cur.retestResult !== "passed") fail(409, "A passed retest is required before this task can be resolved.");
  if ((to === "resolved" || to === "accepted_risk" || cur.status === "resolved" || cur.status === "accepted_risk") && note.trim().length < 5) fail(400, "A note is required for this transition.");
  const now = new Date();
  const closing = to === "resolved" || to === "accepted_risk";
  const t = await prisma.remediationTask.update({
    where: { id: cur.id },
    data: {
      status: to, updatedAt: now, ...(closing ? { approvedBy: me(req).id, approvedAt: now } : {}),
      ...(to === "awaiting_retest" && cur.retestRequired ? { retestResult: "pending" } : {}),
      history: { create: { at: now, by: me(req).id, from: cur.status, to, note: note.trim() } },
    },
    include: { history: true },
  });
  if (to === "resolved") await prisma.risk.updateMany({ where: { findingId: cur.findingId }, data: { mitigationStatus: "mitigated", updatedAt: now } });
  await log(me(req).id, "remediation_updated", "remediation", t.id, t.code, `Status ${cur.status.replace("_", " ")} → ${to.replace("_", " ")}${note ? `, ${note}` : ""}`);
  res.json(M.toTask(t));
});

router.post("/remediation/:id/retest", requirePermission("manage_remediation"), async (req, res) => {
  const { result, note } = parse(z.object({ result: z.enum(["passed", "failed"]), note: z.string().trim().min(5).max(2000) }), req.body);
  const cur = (await prisma.remediationTask.findUnique({ where: { id: param(req) } })) ?? fail(404, "Task not found");
  const now = new Date();
  const status = result === "failed" ? "in_progress" : cur.status;
  const t = await prisma.remediationTask.update({
    where: { id: cur.id },
    data: { retestResult: result, status, updatedAt: now, history: { create: { at: now, by: me(req).id, from: cur.status, to: status, note: `Manual retest ${result}. ${note}` } } },
    include: { history: true },
  });
  await log(me(req).id, "remediation_updated", "remediation", t.id, t.code, `Recorded manual retest result: ${result}`);
  res.json(M.toTask(t));
});

/* --------------------------------- Reports -------------------------------- */
const sectionKeys = REPORT_SECTIONS.map((s) => s.key) as [ReportSectionKey, ...ReportSectionKey[]];
const reportBody = z.object({
  title: z.string().trim().min(3).max(200),
  projectId: z.string(),
  targetIds: z.array(z.string()).min(1),
  templateId: z.string().max(40),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  findingIds: z.array(z.string()).max(1000),
  includeUnverified: z.boolean(),
  sections: z.array(z.enum(sectionKeys)).min(1),
  executiveSummary: z.string().max(10000),
  status: z.enum(["draft", "final"]),
});

router.post("/reports", requirePermission("generate_reports"), async (req, res) => {
  const b = parse(reportBody, req.body);
  // Only human-confirmed findings may be listed as verified.
  const confirmed = await prisma.finding.findMany({ where: { id: { in: b.findingIds }, verificationStatus: "confirmed" }, select: { id: true } });
  const now = new Date();
  const code = nextCode("RPT", (await prisma.report.findMany({ select: { code: true } })).map((r) => r.code));
  const r = await prisma.report.create({
    data: { ...b, id: newId("rpt"), code, findingIds: confirmed.map((f) => f.id), periodStart: new Date(b.periodStart), periodEnd: new Date(b.periodEnd), createdBy: me(req).id, createdAt: now, updatedAt: now },
  });
  await log(me(req).id, "report_generated", "report", r.id, r.code, `Generated report "${r.title}"`);
  await notify({ title: "Report generated", message: `${r.code} ${r.title}`, tone: "success", link: `/reports/${r.id}` }, "reportReady");
  res.status(201).json(M.toReport(r));
});

router.patch("/reports/:id", requirePermission("generate_reports"), async (req, res) => {
  const b = parse(reportBody.partial(), req.body);
  const r = await prisma.report.update({
    where: { id: param(req) },
    data: { ...b, periodStart: b.periodStart ? new Date(b.periodStart) : undefined, periodEnd: b.periodEnd ? new Date(b.periodEnd) : undefined, updatedAt: new Date() },
  });
  res.json(M.toReport(r));
});

router.post("/reports/:id/export", async (req, res) => {
  const { format } = parse(z.object({ format: z.string().max(20) }), req.body);
  const r = (await prisma.report.findUnique({ where: { id: param(req) } })) ?? fail(404, "Report not found");
  await log(me(req).id, "report_exported", "report", r.id, r.code, `Exported report as ${format}`);
  res.json({ ok: true });
});
