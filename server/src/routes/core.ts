import { Router } from "express";
import { z } from "zod";
import type { ApplicationSettings, AssessmentCategoryId } from "@/types";
import { CATEGORIES } from "@/lib/constants";
import { newId, nextCode, prisma } from "../db.ts";
import { can, createSession, destroySession, loginThrottle, requireAuth, requirePermission, verifyPassword } from "../auth.ts";
import { log, notify } from "../audit.ts";
import { fail, me, param, parse } from "../http.ts";
import * as M from "../mappers.ts";
import { seedDatabase } from "../seedData.ts";
import { aiConfigured, GEMINI_MODEL } from "../ai/gemini.ts";

export const router = Router();

/* --------------------------------- Auth ---------------------------------- */
router.post("/auth/login", async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }), req.body);
  const throttle = loginThrottle(`${req.ip}|${email.toLowerCase()}`);
  if (throttle.blocked) fail(429, "Too many failed attempts. Try again in 15 minutes.");
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Same message for unknown user and wrong password (no account enumeration).
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throttle.fail();
    fail(401, "Incorrect email or password.");
  }
  if (user!.status !== "active") fail(403, "This account is not active.");
  throttle.reset();
  await createSession(res, user!.id, req.get("user-agent"));
  await prisma.user.update({ where: { id: user!.id }, data: { lastActiveAt: new Date() } });
  await log(user!.id, "user_login", "user", user!.id, user!.name, "Signed in");
  res.json({ user: M.toUser(user!) });
});

router.post("/auth/logout", async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

router.use(requireAuth);

router.get("/auth/me", (req, res) => {
  res.json({ user: M.toUser(me(req)) });
});

/* ------------------------------- Bootstrap -------------------------------- */
/** Everything the SPA needs, filtered by role. The SPA keeps it as a read cache. */
router.get("/bootstrap", async (req, res) => {
  const user = me(req);
  await raiseOverdueNotifications();
  const [users, projects, targets, assessments, scans, scanResults, hosts, ports, dnsRecords, endpoints, reconRuns, findings, evidence, verifications, aiAnalyses, risks, remediation, reports, activity, notifications, integrations, settings] =
    await Promise.all([
      prisma.user.findMany(), prisma.project.findMany({ include: { members: true }, orderBy: { updatedAt: "desc" } }), prisma.target.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.assessment.findMany({ include: { checklist: true } }), prisma.scan.findMany({ orderBy: { createdAt: "desc" } }), prisma.scanResult.findMany({ orderBy: { recordedAt: "desc" } }),
      prisma.host.findMany(), prisma.port.findMany(), prisma.dnsRecord.findMany(), prisma.endpoint.findMany(), prisma.reconRun.findMany({ orderBy: { ranAt: "desc" } }),
      prisma.finding.findMany({ orderBy: { discoveredAt: "desc" } }), prisma.evidence.findMany(), prisma.verification.findMany({ orderBy: { decidedAt: "desc" } }),
      prisma.aIAnalysis.findMany({ orderBy: { generatedAt: "desc" } }), prisma.risk.findMany(), prisma.remediationTask.findMany({ include: { history: true }, orderBy: { createdAt: "desc" } }),
      prisma.report.findMany({ orderBy: { createdAt: "desc" } }), prisma.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 500 }),
      prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 100 }), prisma.integration.findMany(), prisma.appSetting.findUnique({ where: { id: "app" } }),
    ]);
  res.json({
    me: M.toUser(user),
    users: users.map(M.toUser),
    projects: projects.map(M.toProject),
    targets: targets.map(M.toTarget),
    assessments: assessments.map(M.toAssessment),
    scans: scans.map(M.toScan),
    scanResults: scanResults.map(M.toScanResult),
    hosts: hosts.map(M.toHost),
    ports: ports.map(M.toPort),
    dnsRecords: dnsRecords.map(M.toDns),
    endpoints: endpoints.map(M.toEndpoint),
    reconRuns: reconRuns.map(M.toReconRun),
    findings: findings.map(M.toFinding),
    evidence: evidence.map(M.toEvidence),
    verifications: verifications.map(M.toVerification),
    aiAnalyses: can(user.role, "use_ai") ? aiAnalyses.map(M.toAnalysis) : [],
    risks: risks.map(M.toRisk),
    remediation: remediation.map(M.toTask),
    reports: reports.filter((r) => user.role !== "viewer" || r.status === "final").map(M.toReport),
    activity: can(user.role, "view_activity") ? activity.map(M.toActivity) : [],
    notifications: notifications.map(M.toNotification),
    integrations: integrations.map(M.toIntegration).map((i) =>
      i.id === "ai_service"
        ? aiConfigured()
          ? { ...i, name: "AI Analysis Service (Google Gemini)", status: "connected" as const, integrationType: `Server-side Gemini API · ${GEMINI_MODEL}`, futureEndpoint: "POST /api/ai/analyses (live)" }
          : { ...i, status: "demo_adapter" as const, integrationType: "Demo adapter — set GEMINI_API_KEY in server/.env to enable Gemini" }
        : i,
    ),
    settings: settings?.value as unknown as ApplicationSettings,
  });
});

async function raiseOverdueNotifications() {
  const tasks = await prisma.remediationTask.findMany({ where: { status: { notIn: ["resolved", "accepted_risk"] }, dueDate: { lt: new Date() } } });
  for (const t of tasks) {
    const link = `/remediation?task=${t.id}`;
    if (await prisma.notification.findFirst({ where: { link, title: "Remediation overdue" } })) continue;
    const days = Math.max(1, Math.floor((Date.now() - t.dueDate.getTime()) / 86400_000));
    await notify({ title: "Remediation overdue", message: `${t.code} (${t.title}) is ${days} day(s) past its due date.`, tone: "critical", link }, "remediationDue");
  }
}

/* -------------------------------- Projects -------------------------------- */
const statuses = ["draft", "planning", "in_progress", "under_review", "completed", "archived"] as const;
const projectBody = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(600),
  assessmentType: z.enum(["web_application", "api", "external_perimeter", "authenticated_webapp", "retest"]),
  ownerId: z.string().min(1),
  memberIds: z.array(z.string()).max(50),
  status: z.enum(statuses),
  startDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  objectives: z.string().trim().min(10).max(2000),
  notes: z.string().max(2000),
});

router.post("/projects", requirePermission("manage_projects"), async (req, res) => {
  const b = parse(projectBody, req.body);
  if (b.dueDate < b.startDate) fail(400, "Completion date must be on or after the start date.");
  const year = new Date().getFullYear();
  const codes = (await prisma.project.findMany({ where: { code: { startsWith: `AEG-${year}` } }, select: { code: true } })).map((p) => p.code);
  const { memberIds, ...rest } = b;
  const p = await prisma.project.create({
    data: { ...rest, id: newId("prj"), code: nextCode(`AEG-${year}`, codes, 3), startDate: new Date(b.startDate), dueDate: new Date(b.dueDate), dataOrigin: "user_created", members: { create: [...new Set([...memberIds, b.ownerId])].map((userId) => ({ userId })) } },
    include: { members: true },
  });
  await log(me(req).id, "project_created", "project", p.id, p.code, `Created project ${p.name}`);
  res.status(201).json(M.toProject(p));
});

router.patch("/projects/:id", requirePermission("manage_projects"), async (req, res) => {
  const b = parse(projectBody.partial(), req.body);
  const { memberIds, ...rest } = b;
  const p = await prisma.project.update({
    where: { id: param(req) },
    data: {
      ...rest, startDate: b.startDate ? new Date(b.startDate) : undefined, dueDate: b.dueDate ? new Date(b.dueDate) : undefined,
      members: memberIds ? { deleteMany: {}, create: [...new Set(memberIds)].map((userId) => ({ userId })) } : undefined,
    },
    include: { members: true },
  });
  await log(me(req).id, "project_updated", "project", p.id, p.code, `Updated project ${p.name}`);
  res.json(M.toProject(p));
});

router.post("/projects/:id/archive", requirePermission("manage_projects"), async (req, res) => {
  const cur = (await prisma.project.findUnique({ where: { id: param(req) } })) ?? fail(404, "Project not found");
  if (cur.status === "archived") return res.json({ ok: true });
  await prisma.project.update({ where: { id: cur.id }, data: { status: "archived", statusBeforeArchive: cur.status } });
  await log(me(req).id, "project_archived", "project", cur.id, cur.code, `Archived project ${cur.name}`);
  res.json({ ok: true });
});

router.post("/projects/:id/restore", requirePermission("manage_projects"), async (req, res) => {
  const cur = (await prisma.project.findUnique({ where: { id: param(req) } })) ?? fail(404, "Project not found");
  await prisma.project.update({ where: { id: cur.id }, data: { status: cur.statusBeforeArchive ?? "planning", statusBeforeArchive: null } });
  await log(me(req).id, "project_restored", "project", cur.id, cur.code, `Restored project ${cur.name}`);
  res.json({ ok: true });
});

/* -------------------------------- Targets --------------------------------- */
const HOST_RE = /^(localhost|(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]{2,}|\d{1,3}(\.\d{1,3}){3})(:\d{1,5})?$/i;
const categoryEnum = z.enum(CATEGORIES.map((c) => c.id) as [AssessmentCategoryId, ...AssessmentCategoryId[]]);
const scopeBody = z.object({
  inScopeHosts: z.array(z.string().regex(HOST_RE, "Invalid host")).min(1).max(50),
  allowedPaths: z.array(z.string().startsWith("/")).min(1).max(100),
  excludedPaths: z.array(z.string().startsWith("/")).max(100),
  allowedCategories: z.array(categoryEnum).min(1),
  allowedActivities: z.array(z.string().max(200)).max(30),
  restrictedActivities: z.array(z.string().max(200)).max(30),
});
const targetBody = z.object({
  name: z.string().trim().min(3).max(120),
  url: z.string().url().refine((u) => /^https?:$/.test(new URL(u).protocol), "Only http(s) URLs"),
  projectId: z.string().min(1),
  description: z.string().max(600),
  assetType: z.enum(["web_application", "rest_api", "single_page_app", "admin_portal", "cms"]),
  environment: z.enum(["development", "staging", "qa", "lab"]),
  owner: z.string().trim().min(2).max(200),
  authorizationStatus: z.enum(["authorized", "pending", "expired", "revoked"]),
  authorizationReference: z.string().trim().min(3).max(200),
  authorizationConfirmed: z.boolean(),
  testingNotes: z.string().max(2000),
  scope: scopeBody,
});

function hostCovered(url: string, hosts: string[]) {
  const h = new URL(url).hostname;
  return hosts.some((s) => s.split(":")[0] === h || (s.startsWith("*.") && h.endsWith(s.slice(1))));
}

router.post("/targets", requirePermission("manage_targets"), async (req, res) => {
  const b = parse(targetBody, req.body);
  if (!b.authorizationConfirmed) fail(400, "You must confirm that this application is authorized for security assessment.");
  if (!hostCovered(b.url, b.scope.inScopeHosts)) fail(400, "The application URL's host must be listed as an in-scope host.");
  const { scope, ...rest } = b;
  const now = new Date();
  // Metadata only: the server does not contact the URL.
  const t = await prisma.target.create({ data: { ...rest, ...M.scopeColumns(scope), id: newId("tgt"), authorizationConfirmedBy: me(req).id, authorizationConfirmedAt: now, dataOrigin: "user_created" } });
  await log(me(req).id, "target_registered", "target", t.id, t.name, `Registered target ${t.name} (metadata only — no connection made)`);
  res.status(201).json(M.toTarget(t));
});

router.patch("/targets/:id", requirePermission("manage_targets"), async (req, res) => {
  const b = parse(targetBody.partial(), req.body);
  const cur = (await prisma.target.findUnique({ where: { id: param(req) } })) ?? fail(404, "Target not found");
  const { scope, ...rest } = b;
  const confirmedNow = b.authorizationConfirmed && !cur.authorizationConfirmed;
  const t = await prisma.target.update({
    where: { id: cur.id },
    data: { ...rest, ...(scope ? M.scopeColumns(scope) : {}), ...(confirmedNow ? { authorizationConfirmedBy: me(req).id, authorizationConfirmedAt: new Date() } : {}) },
  });
  await log(me(req).id, "target_updated", "target", t.id, t.name, `Updated target ${t.name}`);
  res.json(M.toTarget(t));
});

router.put("/targets/:id/scope", requirePermission("manage_targets"), async (req, res) => {
  const scope = parse(scopeBody, req.body);
  const t = await prisma.target.update({ where: { id: param(req) }, data: M.scopeColumns(scope) });
  await log(me(req).id, "scope_updated", "target", t.id, t.name, `Updated scope: ${scope.inScopeHosts.length} host(s), ${scope.excludedPaths.length} exclusion(s)`);
  res.json(M.toTarget(t));
});

/* ------------------------------ Assessments ------------------------------- */
router.post("/assessments", requirePermission("verify_findings"), async (req, res) => {
  const { projectId, category } = parse(z.object({ projectId: z.string(), category: categoryEnum }), req.body);
  const existing = await prisma.assessment.findUnique({ where: { projectId_category: { projectId, category } }, include: { checklist: true } });
  if (existing) return res.json(M.toAssessment(existing));
  const project = (await prisma.project.findUnique({ where: { id: projectId } })) ?? fail(404, "Project not found");
  const meta = CATEGORIES.find((c) => c.id === category)!;
  const a = await prisma.assessment.create({
    data: {
      id: newId("asm"), projectId, category, status: "not_started", assessorId: project.ownerId,
      checklist: { create: meta.checklist.map((c, i) => ({ id: newId(`chk${i}`), position: i, title: c.title, kind: c.kind, tool: c.tool ?? null, result: "not_tested", observation: "", evidenceNote: "" })) },
    },
    include: { checklist: true },
  });
  res.status(201).json(M.toAssessment(a));
});

router.patch("/assessments/:id", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({ status: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional(), assessorId: z.string().optional() }), req.body);
  const a = await prisma.assessment.update({ where: { id: param(req) }, data: b, include: { checklist: true } });
  await log(me(req).id, "assessment_updated", "assessment", a.id, CATEGORIES.find((c) => c.id === a.category)?.name ?? a.category, `Updated assessment ${b.status ? `status to ${b.status.replace("_", " ")}` : "details"}`);
  res.json(M.toAssessment(a));
});

router.patch("/assessments/:id/items/:itemId", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({ result: z.enum(["not_tested", "pass", "fail", "not_applicable"]).optional(), observation: z.string().max(4000).optional(), evidenceNote: z.string().max(2000).optional() }), req.body);
  await prisma.checklistItem.update({ where: { id: param(req, "itemId") }, data: { ...b, updatedAt: new Date(), updatedBy: me(req).id } });
  const a = await prisma.assessment.findUniqueOrThrow({ where: { id: param(req) }, include: { checklist: true } });
  if (a.status === "not_started") await prisma.assessment.update({ where: { id: a.id }, data: { status: "in_progress" } });
  res.json({ ok: true });
});

/* ---------------------------- Users & settings ---------------------------- */
router.patch("/users/:id", requirePermission("manage_users"), async (req, res) => {
  const b = parse(z.object({ role: z.enum(["administrator", "assessor", "viewer"]).optional(), status: z.enum(["active", "suspended", "invited"]).optional(), title: z.string().max(120).optional(), assignedProjectIds: z.array(z.string()).optional() }), req.body);
  if (param(req) === me(req).id && (b.role || b.status)) fail(400, "You cannot change your own role or status.");
  const u = await prisma.user.update({ where: { id: param(req) }, data: b });
  if (b.status && b.status !== "active") await prisma.session.deleteMany({ where: { userId: u.id } });
  await log(me(req).id, "user_updated", "user", u.id, u.name, `Updated user ${u.name}${b.role ? ` (role → ${b.role})` : ""}${b.status ? ` (status → ${b.status})` : ""}`);
  res.json(M.toUser(u));
});

const PERSONAL_SECTIONS = new Set(["appearance", "table", "notifications"]);
router.patch("/settings/:section", async (req, res) => {
  const section = param(req, "section");
  if (!PERSONAL_SECTIONS.has(section) && !can(me(req).role, "manage_settings")) fail(403, "Only administrators can change this section.");
  const patch = parse(z.record(z.string(), z.unknown()), req.body);
  const row = (await prisma.appSetting.findUnique({ where: { id: "app" } })) ?? fail(500, "Settings missing");
  const value = row.value as Record<string, Record<string, unknown>>;
  if (!(section in value)) fail(400, "Unknown settings section");
  const next = { ...value, [section]: { ...value[section], ...patch } };
  await prisma.appSetting.update({ where: { id: "app" }, data: { value: next as object } });
  await log(me(req).id, "settings_changed", "settings", undefined, section, `Changed ${section} settings: ${Object.keys(patch).join(", ")}`);
  res.json(next);
});

/* ------------------------------ Notifications ----------------------------- */
router.post("/notifications/:id/read", async (req, res) => {
  await prisma.notification.update({ where: { id: param(req) }, data: { read: true } });
  res.json({ ok: true });
});
router.post("/notifications/read-all", async (_req, res) => {
  await prisma.notification.updateMany({ data: { read: true } });
  res.json({ ok: true });
});
router.delete("/notifications", async (_req, res) => {
  await prisma.notification.deleteMany();
  res.json({ ok: true });
});
router.post("/notifications/test", async (_req, res) => {
  await notify({ title: "Test notification", message: "Notifications are working.", tone: "info" });
  res.json({ ok: true });
});

/* ---------------------------------- Admin --------------------------------- */
router.post("/admin/reset-demo", requirePermission("manage_settings"), async (req, res) => {
  if (process.env.NODE_ENV === "production") fail(403, "Demo reset is disabled in production.");
  const actor = me(req).id;
  await seedDatabase();
  await log(actor, "demo_reset", "system", undefined, "Demo data", "Reset the database to the initial synthetic dataset");
  res.json({ ok: true, note: "All sessions were cleared; sign in again." });
});
