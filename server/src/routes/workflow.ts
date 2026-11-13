import { Router } from "express";
import { z } from "zod";
import type { ReportSectionKey, Severity } from "@/types";
import { REPORT_SECTIONS, SEVERITIES } from "@/lib/constants";
import { newId, nextCode, prisma, retryOnDuplicateCode } from "../db.ts";
import { requireAuth, requirePermission } from "../auth.ts";
import { log, notify } from "../audit.ts";
import { fail, me, param, parse } from "../http.ts";
import * as M from "../mappers.ts";
import { can } from "@/lib/permissions";
import { assertProjectAccess, pickAssessor, projectLeads } from "../workflowRules.ts";
import type { User } from "../../prisma/generated/prisma/client.ts";

export const router = Router();
router.use(requireAuth);

const severityEnum = z.enum(SEVERITIES as [Severity, ...Severity[]]);
const statusEnum = z.enum(["open", "in_progress", "awaiting_retest", "pending_approval", "resolved", "accepted_risk"]);
const CLOSED = ["resolved", "accepted_risk"];

async function taskProject(findingId: string) {
  return (await prisma.finding.findUnique({ where: { id: findingId }, select: { projectId: true, code: true, title: true } })) ?? fail(404, "Finding not found");
}

async function checkFixOwner(ownerId: string) {
  const u = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!u || u.status !== "active" || !can(u.role, "work_remediation")) fail(400, "The owner must be an active person who can work on fixes.");
}

/** Whoever confirmed the finding checks the fix; if they are gone, the assessor with the lightest load. */
async function retestAssessor(findingId: string, projectId: string, exclude: string[]) {
  const v = await prisma.verification.findFirst({ where: { findingId, toStatus: "confirmed" }, orderBy: { decidedAt: "desc" } });
  if (v && !exclude.includes(v.assessorId)) {
    const u = await prisma.user.findUnique({ where: { id: v.assessorId } });
    if (u?.status === "active" && can(u.role, "verify_findings")) return u.id;
  }
  return pickAssessor(projectId, exclude);
}

async function askForApproval(t: { id: string; code: string; title: string; ownerId: string }, projectId: string, by: User) {
  const leads = await projectLeads(projectId, [t.ownerId]);
  await notify({ title: "Fix waiting for your approval", message: `${t.code} ${t.title} is ready to close (${by.name}). Approve it or send it back.`, tone: "info", link: `/remediation?task=${t.id}` }, "remediationDue", leads.length ? leads : undefined);
}

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
  await assertProjectAccess(me(req), f.projectId);
  if (f.verificationStatus !== "confirmed") fail(400, "Remediation tasks can only be created for confirmed findings.");
  await checkFixOwner(b.ownerId);
  const now = new Date();
  const t = await retryOnDuplicateCode(async () => prisma.remediationTask.create({
    data: { ...b, id: newId("rem"), code: nextCode("REM", (await prisma.remediationTask.findMany({ select: { code: true } })).map((t) => t.code)), dueDate: new Date(b.dueDate), status: "open", retestResult: b.retestRequired ? "pending" : "not_required", createdAt: now, updatedAt: now, history: { create: [{ at: now, by: me(req).id, to: "open", note: "Task created." }] } },
    include: { history: true },
  }));
  await log(me(req).id, "remediation_created", "remediation", t.id, t.code, `Created remediation task for ${f.code}`);
  if (t.ownerId !== me(req).id) await notify({ title: "New fix assigned to you", message: `${t.code}: ${t.title}. Due ${t.dueDate.toISOString().slice(0, 10)}.`, tone: "info", link: `/remediation?task=${t.id}` }, "remediationDue", [t.ownerId]);
  res.status(201).json(M.toTask(t));
});

router.patch("/remediation/:id", requirePermission("manage_remediation"), async (req, res) => {
  const b = parse(taskBody.omit({ findingId: true }).partial(), req.body);
  const cur = (await prisma.remediationTask.findUnique({ where: { id: param(req) } })) ?? fail(404, "Task not found");
  await assertProjectAccess(me(req), (await taskProject(cur.findingId)).projectId);
  if (CLOSED.includes(cur.status)) fail(409, "This fix is closed. Reopen it before editing.");
  if (b.ownerId && b.ownerId !== cur.ownerId) await checkFixOwner(b.ownerId);
  const retestResult = b.retestRequired === undefined ? undefined : b.retestRequired ? (cur.retestResult === "not_required" ? "pending" : cur.retestResult) : "not_required";
  const t = await prisma.remediationTask.update({ where: { id: cur.id }, data: { ...b, dueDate: b.dueDate ? new Date(b.dueDate) : undefined, retestResult, updatedAt: new Date() }, include: { history: true } });
  await log(me(req).id, "remediation_updated", "remediation", t.id, t.code, "Updated remediation task details");
  if (b.ownerId && b.ownerId !== cur.ownerId) await notify({ title: "Fix assigned to you", message: `${t.code}: ${t.title}`, tone: "info", link: `/remediation?task=${t.id}` }, "remediationDue", [b.ownerId]);
  res.json(M.toTask(t));
});

/**
 * Status transitions, by role:
 *   the owner (developer) or an assessor moves the fix along: open, in progress, ready for retest
 *   "ready for retest" goes to the assessor who confirmed the finding; with no retest it waits for approval
 *   closing it (resolved, accepted risk) or reopening it needs a lead, and never the fix's own owner
 */
router.post("/remediation/:id/status", requirePermission("work_remediation"), async (req, res) => {
  const { to: asked, note } = parse(z.object({ to: statusEnum, note: z.string().max(2000) }), req.body);
  const user = me(req);
  const cur = (await prisma.remediationTask.findUnique({ where: { id: param(req) } })) ?? fail(404, "Task not found");
  const f = await taskProject(cur.findingId);
  await assertProjectAccess(user, f.projectId);
  const isOwner = cur.ownerId === user.id;
  if (!isOwner && !can(user.role, "manage_remediation")) fail(403, "Only the fix's owner or an assessor can update it.");
  const closing = asked === "resolved" || asked === "accepted_risk";
  const reopening = CLOSED.includes(cur.status);
  if (closing || reopening) {
    if (!can(user.role, "approve_remediation")) fail(403, "A Security Lead approves closing or reopening a fix.");
    if (isOwner) fail(403, "You own this fix, so someone else has to approve it.");
    if (note.trim().length < 5) fail(400, "A note is required for this transition.");
  }
  if (asked === "resolved" && cur.retestRequired && cur.retestResult !== "passed") fail(409, "A passed retest is required before this task can be resolved.");
  if (asked === "pending_approval" && cur.retestRequired && cur.retestResult !== "passed") fail(409, "This fix needs a passed retest before it can go for approval.");
  // Without a retest there is nothing to check, so "ready for retest" goes straight to approval.
  const to = asked === "awaiting_retest" && !cur.retestRequired ? "pending_approval" : asked;
  const retester = to === "awaiting_retest" ? await retestAssessor(cur.findingId, f.projectId, [cur.ownerId]) : undefined;
  const now = new Date();
  const t = await prisma.remediationTask.update({
    where: { id: cur.id },
    data: {
      status: to, updatedAt: now, ...(closing ? { approvedBy: user.id, approvedAt: now } : {}),
      ...(to === "awaiting_retest" ? { retestResult: "pending", retestAssigneeId: retester ?? null } : {}),
      history: { create: { at: now, by: user.id, from: cur.status, to, note: note.trim() } },
    },
    include: { history: true },
  });
  if (asked === "resolved") await prisma.risk.updateMany({ where: { findingId: cur.findingId }, data: { mitigationStatus: "mitigated", updatedAt: now } });
  if (asked === "accepted_risk") await prisma.risk.updateMany({ where: { findingId: cur.findingId }, data: { mitigationStatus: "accepted", updatedAt: now } });
  await log(user.id, "remediation_updated", "remediation", t.id, t.code, `Status ${cur.status.replaceAll("_", " ")} → ${to.replaceAll("_", " ")}${note ? `, ${note}` : ""}`);
  const link = `/remediation?task=${t.id}`;
  if (retester) await notify({ title: "Retest assigned to you", message: `${t.code} ${t.title} is fixed and ready for you to check.`, tone: "info", link }, "remediationDue", [retester]);
  if (to === "pending_approval") await askForApproval(t, f.projectId, user);
  if (closing && !isOwner) await notify({ title: asked === "resolved" ? "Fix approved and closed" : "Risk accepted", message: `${t.code} ${t.title}${note ? `: ${note.trim()}` : ""}`, tone: "success", link }, "remediationDue", [t.ownerId]);
  if (reopening) await notify({ title: "Fix reopened", message: `${t.code} ${t.title}: ${note.trim()}`, tone: "warning", link }, "remediationDue", [t.ownerId]);
  res.json(M.toTask(t));
});

router.post("/remediation/:id/retest", requirePermission("manage_remediation"), async (req, res) => {
  const { result, note } = parse(z.object({ result: z.enum(["passed", "failed"]), note: z.string().trim().min(5).max(2000) }), req.body);
  const cur = (await prisma.remediationTask.findUnique({ where: { id: param(req) } })) ?? fail(404, "Task not found");
  const f = await taskProject(cur.findingId);
  await assertProjectAccess(me(req), f.projectId);
  if (cur.ownerId === me(req).id) fail(403, "You own this fix, so someone else has to retest it.");
  if (CLOSED.includes(cur.status)) fail(409, "This fix is already closed.");
  const now = new Date();
  // Passed: a lead approves closing it. Failed: back to the developer.
  const status = result === "failed" ? "in_progress" : "pending_approval";
  const t = await prisma.remediationTask.update({
    where: { id: cur.id },
    data: { retestResult: result, status, updatedAt: now, history: { create: { at: now, by: me(req).id, from: cur.status, to: status, note: `Manual retest ${result}. ${note}` } } },
    include: { history: true },
  });
  await log(me(req).id, "remediation_updated", "remediation", t.id, t.code, `Recorded manual retest result: ${result}`);
  if (result === "passed") await askForApproval(t, f.projectId, me(req));
  else await notify({ title: "Retest failed", message: `${t.code} ${t.title} is still open: ${note}`, tone: "warning", link: `/remediation?task=${t.id}` }, "remediationDue", [t.ownerId]);
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
  // Reports are written as drafts; only a lead's approval makes one final.
  status: z.literal("draft").optional(),
});

async function validateReportSelection(b: Pick<z.infer<typeof reportBody>, "projectId" | "targetIds" | "findingIds">) {
  const targetIds = [...new Set(b.targetIds)];
  const findingIds = [...new Set(b.findingIds)];
  if (targetIds.length !== b.targetIds.length || findingIds.length !== b.findingIds.length) fail(400, "Duplicate report target or finding IDs.");
  const [project, targets, findings] = await Promise.all([
    prisma.project.findUnique({ where: { id: b.projectId }, select: { id: true } }),
    prisma.target.findMany({ where: { id: { in: targetIds }, projectId: b.projectId }, select: { id: true } }),
    prisma.finding.findMany({ where: { id: { in: findingIds }, projectId: b.projectId, targetId: { in: targetIds }, verificationStatus: "confirmed" }, select: { id: true } }),
  ]);
  if (!project) fail(400, "Report project does not exist.");
  if (targets.length !== targetIds.length) fail(400, "Every report target must belong to the selected project.");
  if (findings.length !== findingIds.length) fail(400, "Every report finding must be confirmed and belong to the selected project and targets.");
}

router.post("/reports", requirePermission("generate_reports"), async (req, res) => {
  const b = parse(reportBody, req.body);
  await assertProjectAccess(me(req), b.projectId);
  await validateReportSelection(b);
  const now = new Date();
  const r = await retryOnDuplicateCode(async () => prisma.report.create({
    data: { ...b, status: "draft", id: newId("rpt"), code: nextCode("RPT", (await prisma.report.findMany({ select: { code: true } })).map((r) => r.code)), periodStart: new Date(b.periodStart), periodEnd: new Date(b.periodEnd), createdBy: me(req).id, createdAt: now, updatedAt: now },
  }));
  await log(me(req).id, "report_generated", "report", r.id, r.code, `Drafted report "${r.title}"`);
  res.status(201).json(M.toReport(r));
});

router.patch("/reports/:id", requirePermission("generate_reports"), async (req, res) => {
  const b = parse(reportBody.partial(), req.body);
  const current = (await prisma.report.findUnique({ where: { id: param(req) } })) ?? fail(404, "Report not found");
  await assertProjectAccess(me(req), current.projectId);
  if (current.status !== "draft") fail(409, current.status === "final" ? "This report is approved and locked." : "This report is with the lead for approval. Ask them to return it before editing.");
  const targetIds = b.targetIds ?? (current.targetIds as string[]);
  // Findings saved earlier may have been rejected since. Editing the report (even just its
  // title) quietly drops them instead of failing; newly chosen findings must still be confirmed.
  const findingIds = b.findingIds ?? (await prisma.finding.findMany({
    where: { id: { in: current.findingIds as string[] }, verificationStatus: "confirmed", targetId: { in: targetIds } }, select: { id: true },
  })).map((f) => f.id);
  await validateReportSelection({ projectId: b.projectId ?? current.projectId, targetIds, findingIds });
  const r = await prisma.report.update({
    where: { id: current.id },
    data: { ...b, findingIds, periodStart: b.periodStart ? new Date(b.periodStart) : undefined, periodEnd: b.periodEnd ? new Date(b.periodEnd) : undefined, updatedAt: new Date() },
  });
  res.json(M.toReport(r));
});

/* Approval: the author submits, a lead who did not write it approves or returns it. */
async function reportFor(req: Parameters<typeof me>[0], status: string) {
  const r = (await prisma.report.findUnique({ where: { id: param(req) } })) ?? fail(404, "Report not found");
  await assertProjectAccess(me(req), r.projectId);
  if (r.status !== status) fail(409, `This report is ${r.status.replace("_", " ")}.`);
  return r;
}

router.post("/reports/:id/submit", requirePermission("generate_reports"), async (req, res) => {
  const r = await reportFor(req, "draft");
  if (!(r.findingIds as string[]).length && !r.executiveSummary.trim()) fail(400, "Add findings or a summary before submitting.");
  const u = await prisma.report.update({ where: { id: r.id }, data: { status: "in_review", reviewNote: null, updatedAt: new Date() } });
  await log(me(req).id, "report_generated", "report", r.id, r.code, `Submitted "${r.title}" for approval`);
  const leads = await projectLeads(r.projectId, [r.createdBy]);
  await notify({ title: "Report waiting for your approval", message: `${r.code} ${r.title} from ${me(req).name}.`, tone: "info", link: `/reports/${r.id}` }, "reportReady", leads.length ? leads : undefined);
  res.json(M.toReport(u));
});

router.post("/reports/:id/approve", requirePermission("approve_reports"), async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().max(2000).default("") }), req.body);
  const r = await reportFor(req, "in_review");
  if (r.createdBy === me(req).id) fail(403, "You wrote this report, so another lead has to approve it.");
  const unsigned = await prisma.finding.findMany({ where: { id: { in: r.findingIds as string[] }, severity: { in: ["critical", "high"] }, signoffStatus: { not: "approved" } }, select: { code: true } });
  if (unsigned.length) fail(409, `Sign off ${unsigned.map((f) => f.code).join(", ")} before approving this report.`);
  const now = new Date();
  const u = await prisma.report.update({ where: { id: r.id }, data: { status: "final", approvedBy: me(req).id, approvedAt: now, reviewNote: note || null, updatedAt: now } });
  await log(me(req).id, "report_generated", "report", r.id, r.code, `Approved "${r.title}" as final`);
  await notify({ title: "Report approved", message: `${r.code} ${r.title} is final.`, tone: "success", link: `/reports/${r.id}` }, "reportReady", [r.createdBy]);
  res.json(M.toReport(u));
});

router.post("/reports/:id/return", requirePermission("approve_reports"), async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().min(5, "Say what needs changing.").max(2000) }), req.body);
  const r = await reportFor(req, "in_review");
  const u = await prisma.report.update({ where: { id: r.id }, data: { status: "draft", reviewNote: note, updatedAt: new Date() } });
  await log(me(req).id, "report_generated", "report", r.id, r.code, `Returned "${r.title}" for changes: ${note}`);
  await notify({ title: "Report returned for changes", message: `${r.code} ${r.title}: ${note}`, tone: "warning", link: `/reports/${r.id}` }, "reportReady", [r.createdBy]);
  res.json(M.toReport(u));
});

router.post("/reports/:id/export", async (req, res) => {
  const { format } = parse(z.object({ format: z.string().max(20) }), req.body);
  const r = (await prisma.report.findUnique({ where: { id: param(req) } })) ?? fail(404, "Report not found");
  await log(me(req).id, "report_exported", "report", r.id, r.code, `Exported report as ${format}`);
  res.json({ ok: true });
});
