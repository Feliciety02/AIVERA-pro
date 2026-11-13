import { Router } from "express";
import { z } from "zod";
import type { ApplicationSettings, AssessmentCategoryId, UserRole } from "@/types";
import { CATEGORIES } from "@/lib/constants";
import { ROLE_ORDER } from "@/lib/permissions";
import { newId, nextCode, prisma, retryOnDuplicateCode } from "../db.ts";
import type { Prisma } from "../../prisma/generated/prisma/client.ts";
import { can, createSession, destroySession, hashPassword, loginThrottle, requireAuth, requirePermission, verifyPassword } from "../auth.ts";
import { log, notify } from "../audit.ts";
import { fail, me, param, parse } from "../http.ts";
import * as M from "../mappers.ts";
import { seedDatabase } from "../seedData.ts";
import { detectScope } from "../scopeDiscovery.ts";
import { verifyChain } from "../auditChain.ts";
import { aiConfigured, aiProviderStatus } from "../ai/gemini.ts";
import { assertProjectAccess, handOverWork, pickLeadForNewProject, projectLeads, remindOverdueFixes, visibleProjectIds } from "../workflowRules.ts";

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
  if (user!.status === "invited") fail(403, "Your account is waiting for an administrator to approve it.");
  if (user!.status !== "active") fail(403, "This account is not active.");
  throttle.reset();
  await createSession(res, user!.id, req.get("user-agent"));
  await prisma.user.update({ where: { id: user!.id }, data: { lastActiveAt: new Date() } });
  await log(user!.id, "user_login", "user", user!.id, user!.name, "Signed in");
  res.json({ user: M.toUser(user!) });
});

/**
 * Self-service sign-up. New accounts are read-only viewers and stay pending ("invited")
 * until an administrator activates them on the Users page, nobody can sign up and
 * start testing websites on their own.
 */
const signupBody = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200)
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use a mix of letters and numbers"),
});
router.post("/auth/register", async (req, res) => {
  const throttle = loginThrottle(`register|${req.ip}`);
  if (throttle.blocked) fail(429, "Too many sign-up attempts. Try again in 15 minutes.");
  throttle.fail(); // every attempt counts, successful or not
  const b = parse(signupBody, req.body);
  if (await prisma.user.findUnique({ where: { email: b.email } })) fail(409, "An account with this email already exists. Try signing in.");
  const now = new Date();
  const user = await prisma.user.create({
    data: { id: newId("usr"), name: b.name, email: b.email, passwordHash: await hashPassword(b.password), role: "viewer", title: "New member", status: "invited", assignedProjectIds: [], createdAt: now, lastActiveAt: now },
  });
  await log(user.id, "user_signup", "user", user.id, user.name, "Created an account (pending administrator approval)");
  await notify({ title: "New account waiting for approval", message: `${user.name} (${user.email}) signed up. Activate it on the Users page.`, tone: "info", link: "/users" });
  res.status(201).json({ ok: true, status: "pending" });
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
  await remindOverdueFixes();
  const visible = await visibleProjectIds(user);
  const [users, allProjects, allTargets, allAssessments, allScans, allScanResults, allHosts, allPorts, allDns, allEndpoints, allRecon, allFindings, allEvidence, allVerifications, allAnalyses, allRisks, allRemediation, allReports, activity, notifications, integrations, settings] =
    await Promise.all([
      prisma.user.findMany(), prisma.project.findMany({ include: { members: true }, orderBy: { updatedAt: "desc" } }), prisma.target.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.assessment.findMany({ include: { checklist: true } }), prisma.scan.findMany({ orderBy: { createdAt: "desc" } }), prisma.scanResult.findMany({ orderBy: { recordedAt: "desc" } }),
      prisma.host.findMany(), prisma.port.findMany(), prisma.dnsRecord.findMany(), prisma.endpoint.findMany(), prisma.reconRun.findMany({ orderBy: { ranAt: "desc" } }),
      prisma.finding.findMany({ orderBy: { discoveredAt: "desc" } }), prisma.evidence.findMany(), prisma.verification.findMany({ orderBy: { decidedAt: "desc" } }),
      prisma.aIAnalysis.findMany({ orderBy: { generatedAt: "desc" } }), prisma.risk.findMany(), prisma.remediationTask.findMany({ include: { history: true }, orderBy: { createdAt: "desc" } }),
      prisma.report.findMany({ orderBy: { createdAt: "desc" } }), prisma.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 500 }),
      prisma.notification.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, orderBy: { createdAt: "desc" }, take: 100 }), prisma.integration.findMany(), prisma.appSetting.findUnique({ where: { id: "app" } }),
    ]);
  // Each person only receives the projects they work on (administrators see everything).
  // A developer sees only their own fix tasks and what those tasks point at.
  const inProject = (projectId: string | null) => visible === null || (projectId !== null && visible.has(projectId));
  const developer = !can(user.role, "verify_findings") && can(user.role, "work_remediation");
  const remediation = allRemediation.filter((t) => !developer || t.ownerId === user.id);
  const fixFindingIds = new Set(remediation.map((t) => t.findingId));
  const findings = allFindings.filter((f) => inProject(f.projectId) && (!developer || fixFindingIds.has(f.id)));
  const findingIds = new Set(findings.map((f) => f.id));
  const projects = allProjects.filter((p) => inProject(p.id));
  const targets = allTargets.filter((t) => (t.projectId === null ? can(user.role, "manage_targets") : inProject(t.projectId)));
  const targetIds = new Set(targets.map((t) => t.id));
  const scans = allScans.filter((s) => inProject(s.projectId) && !developer);
  const scanIds = new Set(scans.map((s) => s.id));
  const hosts = allHosts.filter((h) => targetIds.has(h.targetId));
  const hostIds = new Set(hosts.map((h) => h.id));
  const viewerOnly = !can(user.role, "generate_reports");
  const assessments = allAssessments.filter((a) => inProject(a.projectId));
  const scanResults = allScanResults.filter((r) => scanIds.has(r.scanId));
  const ports = allPorts.filter((p) => hostIds.has(p.hostId));
  const dnsRecords = allDns.filter((d) => targetIds.has(d.targetId));
  const endpoints = allEndpoints.filter((e) => targetIds.has(e.targetId));
  const reconRuns = allRecon.filter((r) => targetIds.has(r.targetId));
  const evidence = allEvidence.filter((e) => findingIds.has(e.findingId));
  const verifications = allVerifications.filter((v) => findingIds.has(v.findingId));
  const aiAnalyses = allAnalyses.filter((a) => inProject(a.projectId) && (!a.findingId || findingIds.has(a.findingId)));
  const risks = allRisks.filter((r) => findingIds.has(r.findingId));
  const reports = allReports.filter((r) => inProject(r.projectId) && (!viewerOnly || r.status === "final"));
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
    reports: reports.map(M.toReport),
    activity: can(user.role, "view_activity") ? activity.map(M.toActivity) : [],
    notifications: notifications.map(M.toNotification),
    integrations: integrations.map(M.toIntegration).map((i) =>
      i.id === "ai_service"
        ? aiConfigured()
          ? { ...i, name: "AI Analysis Service", status: "connected" as const, integrationType: `Server-side AI, tried in order: ${aiProviderStatus().map((p) => (p.resting ? `${p.name} (busy, retried in ${p.secondsLeft}s)` : p.name)).join(" → ")}`, futureEndpoint: "POST /api/ai/analyses (live)" }
          : { ...i, status: "demo_adapter" as const, integrationType: "Demo adapter, set GEMINI_API_KEY in server/.env to enable Gemini" }
        : i,
    ),
    settings: settings?.value as unknown as ApplicationSettings,
  });
});

/* -------------------------------- Projects -------------------------------- */
const statuses = ["draft", "planning", "in_progress", "under_review", "completed", "archived"] as const;
const projectBody = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(600),
  assessmentType: z.enum(["web_application", "api", "external_perimeter", "authenticated_webapp", "retest"]),
  ownerId: z.string().min(1),
  leadId: z.string().min(1).nullish(),
  remediationOwnerId: z.string().min(1).nullish(),
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
  const { memberIds, ...rest } = b;
  // A lead who creates a project leads it unless they named someone else.
  if (rest.leadId === undefined) rest.leadId = me(req).role === "lead" ? me(req).id : await pickLeadForNewProject();
  await checkTeamRoles(rest.leadId, rest.remediationOwnerId);
  const p = await inTransactionWithCodeRetry(async (tx) => tx.project.create({
    data: { ...rest, id: newId("prj"), code: await nextProjectCode(tx), startDate: new Date(b.startDate), dueDate: new Date(b.dueDate), dataOrigin: "user_created", members: { create: [...new Set([...memberIds, b.ownerId, ...(rest.leadId ? [rest.leadId] : []), ...(rest.remediationOwnerId ? [rest.remediationOwnerId] : [])])].map((userId) => ({ userId })) } },
    include: { members: true },
  }));
  await log(me(req).id, "project_created", "project", p.id, p.code, `Created project ${p.name}`);
  res.status(201).json(M.toProject(p));
});

router.patch("/projects/:id", requirePermission("manage_projects"), async (req, res) => {
  const b = parse(projectBody.partial(), req.body);
  await assertProjectAccess(me(req), param(req));
  const { memberIds, ...rest } = b;
  await checkTeamRoles(rest.leadId, rest.remediationOwnerId);
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
  await assertProjectAccess(me(req), param(req));
  const cur = (await prisma.project.findUnique({ where: { id: param(req) } })) ?? fail(404, "Project not found");
  if (cur.status === "archived") return res.json({ ok: true });
  await prisma.project.update({ where: { id: cur.id }, data: { status: "archived", statusBeforeArchive: cur.status } });
  await log(me(req).id, "project_archived", "project", cur.id, cur.code, `Archived project ${cur.name}`);
  res.json({ ok: true });
});

router.post("/projects/:id/restore", requirePermission("manage_projects"), async (req, res) => {
  await assertProjectAccess(me(req), param(req));
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
  projectId: z.string().min(1).nullish(),
  description: z.string().max(600),
  assetType: z.enum(["web_application", "rest_api", "single_page_app", "admin_portal", "cms"]),
  environment: z.enum(["development", "staging", "qa", "lab"]),
  owner: z.string().trim().min(2).max(200),
  authorizationStatus: z.enum(["authorized", "pending", "expired", "revoked"]),
  // Optional: when empty, AIVERA assigns the next AUTH-YYYY-NNNN record number.
  authorizationReference: z.string().trim().max(200).optional(),
  authorizationConfirmed: z.boolean(),
  testingNotes: z.string().max(2000),
  scope: scopeBody,
});

async function nextAuthReference() {
  const prefix = `AUTH-${new Date().getFullYear()}-`;
  const refs = await prisma.target.findMany({ where: { authorizationReference: { startsWith: prefix } }, select: { authorizationReference: true } });
  const max = refs.reduce((m, r) => Math.max(m, Number(r.authorizationReference.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

type Tx = Prisma.TransactionClient;

async function nextProjectCode(db: Tx | typeof prisma = prisma) {
  const prefix = `AIV-${new Date().getFullYear()}`;
  const codes = (await db.project.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } })).map((p) => p.code);
  return nextCode(prefix, codes, 3);
}

/**
 * Runs `fn` in one transaction. Project codes are read then inserted, so two saves at the same
 * moment can pick the same code; the unique index rejects the second one and it simply retries
 * with a fresh code. Nothing half-saved is left behind, because each attempt rolls back fully.
 */
function inTransactionWithCodeRetry<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return retryOnDuplicateCode(() => prisma.$transaction(fn));
}

/**
 * Every website needs a project before it can be scanned. When none was chosen, AIVERA makes
 * one just for this website instead of guessing, so an unrelated site is never filed under
 * another system's assessment. Runs inside the caller's transaction.
 */
async function createProjectForTarget(tx: Tx, name: string, url: string, userId: string, leadId: string | null) {
  const start = new Date();
  return tx.project.create({
    data: {
      id: newId("prj"), code: await nextProjectCode(tx), name: `${name} Security Assessment`,
      description: `Security assessment of ${url}, created automatically when the website was added.`,
      assessmentType: "web_application", ownerId: userId, status: "planning",
      startDate: start, dueDate: new Date(start.getTime() + 30 * 86400_000),
      objectives: `Find, verify and fix security weaknesses in ${name} within the approved scope.`, notes: "",
      leadId, dataOrigin: "user_created", members: { create: [...new Set([userId, ...(leadId ? [leadId] : [])])].map((id) => ({ userId: id })) },
    },
  });
}

async function checkProject(user: { id: string; role: string }, projectId: string | null | undefined) {
  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId } }))) fail(400, "Selected project does not exist.");
  await assertProjectAccess(user, projectId);
}

/** The lead must be able to approve, and the remediation owner must be able to work on fixes. */
async function checkTeamRoles(leadId?: string | null, remediationOwnerId?: string | null) {
  if (leadId) {
    const u = await prisma.user.findUnique({ where: { id: leadId } });
    if (!u || !can(u.role, "signoff_findings")) fail(400, "The project lead must be a Security Lead or an administrator.");
  }
  if (remediationOwnerId) {
    const u = await prisma.user.findUnique({ where: { id: remediationOwnerId } });
    if (!u || !can(u.role, "work_remediation")) fail(400, "The remediation owner must be someone who can work on fixes.");
  }
}

/** Only a lead records that the owner gave permission; anyone else's website waits for a lead. */
async function askLeadToAuthorize(user: { id: string; name: string }, t: { id: string; name: string; projectId: string | null }) {
  const leads = t.projectId ? await projectLeads(t.projectId, [user.id]) : [];
  await notify({ title: "Website waiting for authorization", message: `${user.name} added ${t.name}. Check the owner's permission and mark it authorized before anyone scans it.`, tone: "warning", link: `/targets/${t.id}` }, undefined, leads.length ? leads : undefined);
}

function hostCovered(url: string, hosts: string[]) {
  const h = new URL(url).hostname;
  return hosts.some((s) => s.split(":")[0] === h || (s.startsWith("*.") && h.endsWith(s.slice(1))));
}

router.post("/targets", requirePermission("manage_targets"), async (req, res) => {
  const b = parse(targetBody, req.body);
  if (!b.authorizationConfirmed) fail(400, "You must confirm that this application is authorized for security assessment.");
  if (!hostCovered(b.url, b.scope.inScopeHosts)) fail(400, "The application URL's host must be listed as an in-scope host.");
  await checkProject(me(req), b.projectId);
  const needsLead = b.authorizationStatus === "authorized" && !can(me(req).role, "authorize_targets");
  if (needsLead) b.authorizationStatus = "pending";
  const { scope, ...rest } = b;
  const authorizationReference = rest.authorizationReference || (await nextAuthReference());
  const now = new Date();
  // Saving does not contact the URL (scope detection is a separate, explicit request).
  const userId = me(req).id;
  const leadForNew = can(me(req).role, "signoff_findings") ? userId : await pickLeadForNewProject();
  // The automatic project and the website are saved together or not at all.
  const { t, project } = await inTransactionWithCodeRetry(async (tx) => {
    const project = rest.projectId ? null : await createProjectForTarget(tx, rest.name, rest.url, userId, leadForNew);
    const t = await tx.target.create({ data: { ...rest, projectId: rest.projectId || project!.id, authorizationReference, ...M.scopeColumns(scope), id: newId("tgt"), authorizationConfirmedBy: userId, authorizationConfirmedAt: now, dataOrigin: "user_created" } });
    return { t, project };
  });
  if (project) await log(userId, "project_created", "project", project.id, project.code, `Created project ${project.name} for the website ${t.name}`);
  await log(userId, "target_registered", "target", t.id, t.name, `Registered target ${t.name} (details saved, no scan started)${needsLead ? "; waiting for a lead to authorize it" : ""}`);
  if (needsLead) await askLeadToAuthorize(me(req), t);
  res.status(201).json(M.toTarget(t));
});

router.patch("/targets/:id", requirePermission("manage_targets"), async (req, res) => {
  const b = parse(targetBody.partial(), req.body);
  const cur = (await prisma.target.findUnique({ where: { id: param(req) } })) ?? fail(404, "Target not found");
  await assertProjectAccess(me(req), cur.projectId);
  await checkProject(me(req), b.projectId);
  if (b.authorizationStatus === "authorized" && cur.authorizationStatus !== "authorized" && !can(me(req).role, "authorize_targets"))
    fail(403, "Only a Security Lead can mark a website as authorized.");
  if (b.authorizationReference === "") b.authorizationReference = cur.authorizationReference || (await nextAuthReference());
  const { scope, ...rest } = b;
  const confirmedNow = b.authorizationConfirmed && !cur.authorizationConfirmed;
  const t = await prisma.target.update({
    where: { id: cur.id },
    data: { ...rest, ...(scope ? M.scopeColumns(scope) : {}), ...(confirmedNow ? { authorizationConfirmedBy: me(req).id, authorizationConfirmedAt: new Date() } : {}) },
  });
  await log(me(req).id, "target_updated", "target", t.id, t.name, `Updated target ${t.name}`);
  res.json(M.toTarget(t));
});

/** One click for a website saved without a project: give it its own. */
router.post("/targets/:id/own-project", requirePermission("manage_targets"), async (req, res) => {
  const userId = me(req).id;
  const leadForNew = can(me(req).role, "signoff_findings") ? userId : await pickLeadForNewProject();
  const p = await inTransactionWithCodeRetry(async (tx) => {
    // Checked inside the transaction so two clicks can't make two projects.
    const cur = (await tx.target.findUnique({ where: { id: param(req) } })) ?? fail(404, "Target not found");
    if (cur.projectId) fail(409, "This website is already in a project.");
    const project = await createProjectForTarget(tx, cur.name, cur.url, userId, leadForNew);
    await tx.target.update({ where: { id: cur.id }, data: { projectId: project.id } });
    return { ...project, targetName: cur.name, targetId: cur.id };
  });
  await log(userId, "project_created", "project", p.id, p.code, `Created project ${p.name} for the website ${p.targetName}`);
  res.json({ projectId: p.id, code: p.code });
});

/** Remove a target and its assessment history so the project can start fresh. */
router.delete("/targets/:id", requirePermission("manage_targets"), async (req, res) => {
  const target = (await prisma.target.findUnique({ where: { id: param(req) } })) ?? fail(404, "Target not found");
  await assertProjectAccess(me(req), target.projectId);
  const active = await prisma.scan.count({ where: { targetId: target.id, status: { in: ["queued", "running", "paused"] } } });
  if (active) fail(409, "Wait for the active scan to finish before deleting this target.");
  await prisma.$transaction(async (tx) => {
    const [scans, findings, hosts, reports] = await Promise.all([
      tx.scan.findMany({ where: { targetId: target.id }, select: { id: true } }),
      tx.finding.findMany({ where: { targetId: target.id }, select: { id: true } }),
      tx.host.findMany({ where: { targetId: target.id }, select: { id: true } }),
      target.projectId ? tx.report.findMany({ where: { projectId: target.projectId } }) : Promise.resolve([]),
    ]);
    const scanIds = scans.map((s) => s.id);
    const findingIds = findings.map((f) => f.id);
    const hostIds = hosts.map((h) => h.id);
    const tasks = await tx.remediationTask.findMany({ where: { findingId: { in: findingIds } }, select: { id: true } });
    await tx.remediationTask.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
    await tx.verification.deleteMany({ where: { findingId: { in: findingIds } } });
    await tx.risk.deleteMany({ where: { findingId: { in: findingIds } } });
    await tx.aIAnalysis.deleteMany({ where: { OR: [{ targetId: target.id }, { findingId: { in: findingIds } }, { scanId: { in: scanIds } }] } });
    await tx.findingAlias.deleteMany({ where: { canonicalId: { in: findingIds } } });
    await tx.evidence.deleteMany({ where: { findingId: { in: findingIds } } });
    await tx.finding.deleteMany({ where: { targetId: target.id } });
    await tx.port.deleteMany({ where: { hostId: { in: hostIds } } });
    await tx.host.deleteMany({ where: { targetId: target.id } });
    await tx.dnsRecord.deleteMany({ where: { targetId: target.id } });
    await tx.endpoint.deleteMany({ where: { targetId: target.id } });
    await tx.reconRun.deleteMany({ where: { targetId: target.id } });
    await tx.scanResult.deleteMany({ where: { scanId: { in: scanIds } } });
    await tx.scan.deleteMany({ where: { targetId: target.id } });
    await tx.notification.deleteMany({ where: { link: { in: [`/targets/${target.id}`, ...scanIds.map((id) => `/scans/${id}`), ...findingIds.map((id) => `/findings/${id}`)] } } });
    for (const report of reports) {
      const targetIds = (report.targetIds as string[]).filter((id) => id !== target.id);
      if (targetIds.length === (report.targetIds as string[]).length) continue;
      if (!targetIds.length) await tx.report.delete({ where: { id: report.id } });
      else await tx.report.update({ where: { id: report.id }, data: { targetIds, findingIds: (report.findingIds as string[]).filter((id) => !findingIds.includes(id)), updatedAt: new Date() } });
    }
    await tx.target.delete({ where: { id: target.id } });
  });
  await log(me(req).id, "target_updated", "target", target.id, target.name, `Deleted target ${target.name} and its assessment records`);
  res.json({ ok: true });
});

// Automatic scope detection: DNS lookup + robots.txt + sitemap.xml, only after permission is confirmed.
router.post("/targets/detect-scope", requirePermission("manage_targets"), async (req, res) => {
  const b = parse(z.object({ url: targetBody.shape.url, authorizationConfirmed: z.literal(true, { error: "Confirm you have permission to test this website first." }) }), req.body);
  const result = await detectScope(b.url);
  await log(me(req).id, "scope_detected", "target", undefined, result.host, `Detected scope for ${result.host}: DNS ${result.dns?.status}, robots.txt ${result.robots?.status}, sitemap ${result.sitemap?.status}`);
  res.json(result);
});

router.put("/targets/:id/scope", requirePermission("manage_targets"), async (req, res) => {
  const scope = parse(scopeBody, req.body);
  await assertProjectAccess(me(req), (await prisma.target.findUnique({ where: { id: param(req) } }))?.projectId);
  const t = await prisma.target.update({ where: { id: param(req) }, data: M.scopeColumns(scope) });
  await log(me(req).id, "scope_updated", "target", t.id, t.name, `Updated scope: ${scope.inScopeHosts.length} host(s), ${scope.excludedPaths.length} exclusion(s)`);
  res.json(M.toTarget(t));
});

/* ------------------------------ Assessments ------------------------------- */
router.post("/assessments", requirePermission("verify_findings"), async (req, res) => {
  const { projectId, category } = parse(z.object({ projectId: z.string(), category: categoryEnum }), req.body);
  const existing = await prisma.assessment.findUnique({ where: { projectId_category: { projectId, category } }, include: { checklist: true } });
  await assertProjectAccess(me(req), projectId);
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
  const b = parse(z.object({ role: z.enum(ROLE_ORDER as [UserRole, ...UserRole[]]).optional(), status: z.enum(["active", "suspended", "invited"]).optional(), title: z.string().max(120).optional(), assignedProjectIds: z.array(z.string()).optional() }), req.body);
  if (param(req) === me(req).id && (b.role || b.status)) fail(400, "You cannot change your own role or status.");
  const before = (await prisma.user.findUnique({ where: { id: param(req) } })) ?? fail(404, "User not found");
  const u = await prisma.user.update({ where: { id: param(req) }, data: b });
  if (b.status && b.status !== "active") await prisma.session.deleteMany({ where: { userId: u.id } });
  // Open work never gets stuck with someone who left or can no longer do it.
  const gone = u.status !== "active";
  const moved = before.status !== u.status || before.role !== u.role
    ? await handOverWork(u.id, me(req).id, { reviews: !gone && can(u.role, "verify_findings"), fixes: !gone && can(u.role, "work_remediation"), leads: !gone && can(u.role, "signoff_findings") })
    : 0;
  await log(me(req).id, "user_updated", "user", u.id, u.name, `Updated user ${u.name}${b.role ? ` (role → ${b.role})` : ""}${b.status ? ` (status → ${b.status})` : ""}`);
  res.json({ ...M.toUser(u), handedOver: moved });
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
const mine = (req: Parameters<typeof me>[0]) => ({ OR: [{ userId: null }, { userId: me(req).id }] });
router.post("/notifications/:id/read", async (req, res) => {
  await prisma.notification.updateMany({ where: { id: param(req), ...mine(req) }, data: { read: true } });
  res.json({ ok: true });
});
router.post("/notifications/read-all", async (req, res) => {
  await prisma.notification.updateMany({ where: mine(req), data: { read: true } });
  res.json({ ok: true });
});
router.delete("/notifications", async (req, res) => {
  // Clears your own notifications; shared ones are cleared only by an administrator.
  await prisma.notification.deleteMany({ where: can(me(req).role, "manage_settings") ? mine(req) : { userId: me(req).id } });
  res.json({ ok: true });
});
router.post("/notifications/test", async (req, res) => {
  await notify({ title: "Test notification", message: "Notifications are working.", tone: "info" }, undefined, [me(req).id]);
  res.json({ ok: true });
});

/* ------------------------------- Audit chain ------------------------------ */
/** Recomputes every activity entry's HMAC and reports the first break, if any. */
router.get("/audit/verify", requirePermission("view_activity"), async (_req, res) => {
  res.json(await verifyChain());
});

/* ---------------------------------- Admin --------------------------------- */
router.post("/admin/reset-demo", requirePermission("manage_settings"), async (req, res) => {
  if (process.env.NODE_ENV === "production") fail(403, "Demo reset is disabled in production.");
  const actor = me(req).id;
  await seedDatabase();
  await log(actor, "demo_reset", "system", undefined, "Demo data", "Reset the database to the initial synthetic dataset");
  res.json({ ok: true, note: "All sessions were cleared; sign in again." });
});
