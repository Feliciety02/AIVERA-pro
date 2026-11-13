import { Router } from "express";
import { z } from "zod";
import type { AIMode, AssessmentCategoryId, ScanConfig, Severity, VerificationStatus } from "@/types";
import { CATEGORIES, SEVERITIES } from "@/lib/constants";
import { defaultRiskInputs } from "@/lib/risk";
import { generateSimulation } from "@/features/simulation/generator";
import { parseZapJson, MAX_IMPORT_BYTES } from "@/features/imports/parsers";
import { buildImport } from "@/features/imports/buildImport";
import { demoAIAdapter } from "@/services/ai/aiService";
import { newId, nextCode, prisma } from "../db.ts";
import { requireAuth, requirePermission } from "../auth.ts";
import { log, notify } from "../audit.ts";
import { fail, me, param, parse } from "../http.ts";
import * as M from "../mappers.ts";
import { parseNmapXmlServer } from "../nmap.ts";
import { aiConfigured, analyzeWithGemini } from "../ai/gemini.ts";
import { approvedScanHosts } from "../egress.ts";
import { runToolInWorker } from "../workerClient.ts";
import { open as openSecret } from "../secretBox.ts";
import { ACTIVE_SCAN_ACTIVITY, AUTH_SCAN_ACTIVITY, TOOL_ACTIVITY, hasActivity, isLoopbackUrl, toolPermitted, urlHostInScope, type LiveTool } from "@/features/scanPermissions";
import { uniqueFindings } from "@/features/scanLifecycle";
import { assertProjectAccess, assignNewFindings, createFixTask, projectLeads, promptReportWhenReviewed } from "../workflowRules.ts";
import { can } from "@/lib/permissions";

export const router = Router();
router.use(requireAuth);

const categoryEnum = z.enum(CATEGORIES.map((c) => c.id) as [AssessmentCategoryId, ...AssessmentCategoryId[]]);
const severityEnum = z.enum(SEVERITIES as [Severity, ...Severity[]]);

export async function authorizedTarget(id: string) {
  const t = (await prisma.target.findUnique({ where: { id } })) ?? fail(404, "Target not found");
  if (t.authorizationStatus !== "authorized" || !t.authorizationConfirmed) fail(403, "This target does not have confirmed authorization.");
  if (!t.projectId) fail(400, "Add this target to a project before testing it.");
  return { ...M.toTarget(t), projectId: t.projectId! };
}

/**
 * Scan and finding codes (SCN-0001, FND-0001) are read, then inserted. One AIVERA server writes
 * them, so running those steps one at a time keeps codes unique even when two scans or imports
 * finish at the same moment. It also stops two "start scan" clicks from both passing the
 * "no scan already running" check.
 */
let recordQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = recordQueue.then(fn, fn);
  recordQueue = run.catch(() => undefined);
  return run;
}

const nextFindingIndex = async () => {
  const codes = (await prisma.finding.findMany({ select: { code: true } })).map((finding) => finding.code);
  return Number(nextCode("FND", codes).slice(4));
};

/** Persists records produced by simulation or import in one transaction. */
async function persistBundle(b: {
  scan: ReturnType<typeof M.toScan>; results: ReturnType<typeof M.toScanResult>[]; hosts: ReturnType<typeof M.toHost>[]; ports: ReturnType<typeof M.toPort>[];
  dns: ReturnType<typeof M.toDns>[]; endpoints: ReturnType<typeof M.toEndpoint>[]; findings: ReturnType<typeof M.toFinding>[]; evidence: ReturnType<typeof M.toEvidence>[];
}, includeScan = true): Promise<{ newFindings: number; repeatedFindings: number; newIds: string[] }> {
  const s = b.scan;
  const existing = await prisma.finding.findMany({ where: { targetId: s.targetId }, select: { targetId: true, sourceTool: true, templateKey: true, affectedAsset: true, parameter: true, title: true } });
  const novel = uniqueFindings(b.findings, existing);
  const novelIds = new Set(novel.map((f) => f.id));
  const repeatedFindings = b.findings.length - novel.length;
  const results = b.results.map((r) => ({ ...r, summary: `${r.summary}; ${novel.length} new, ${repeatedFindings} previously recorded finding(s)` }));
  await prisma.$transaction([
    ...(includeScan ? [prisma.scan.create({ data: { ...s, config: s.config as object, stage: s.stage ?? null, errorMessage: s.errorMessage ?? null, createdAt: new Date(s.createdAt), startedAt: s.startedAt ? new Date(s.startedAt) : null, completedAt: s.completedAt ? new Date(s.completedAt) : null } })] : []),
    prisma.scanResult.createMany({ data: results.map((r) => ({ ...r, recordedAt: new Date(r.recordedAt) })) }),
    prisma.host.createMany({ data: b.hosts.map((h) => ({ ...h, scanId: h.scanId ?? null, osGuess: h.osGuess ?? null, observedAt: new Date(h.observedAt) })) }),
    prisma.port.createMany({ data: b.ports.map((p) => ({ ...p, observedAt: new Date(p.observedAt) })) }),
    prisma.dnsRecord.createMany({ data: b.dns.map((d) => ({ ...d, observedAt: new Date(d.observedAt) })) }),
    prisma.endpoint.createMany({ data: b.endpoints.map((e) => ({ ...e, observedAt: new Date(e.observedAt) })) }),
    prisma.finding.createMany({ data: novel.map(M.findingColumns) }),
    prisma.evidence.createMany({ data: b.evidence.filter((e) => novelIds.has(e.findingId)).map(M.evidenceColumns) }),
  ]);
  return { newFindings: novel.length, repeatedFindings, newIds: novel.map((f) => f.id) };
}

async function requireReviewComplete(targetId: string) {
  const active = await prisma.scan.count({ where: { targetId, status: { in: ["queued", "running", "paused"] } } });
  if (active) fail(409, "A scan is already in progress for this target.");
  const pending = await prisma.finding.count({ where: { targetId, verificationStatus: { in: ["pending", "needs_review"] } } });
  if (pending) fail(409, `Review the ${pending} pending finding(s) for this target before starting another scan or import.`);
}

/* ------------------------------- Simulation ------------------------------- */
const scanConfig = z.object({
  tools: z.array(z.enum(["nmap", "owasp_zap", "dns_utils", "http_inspector"])).min(1),
  categories: z.array(categoryEnum).min(1),
  profile: z.enum(["passive", "baseline", "standard", "thorough"]),
  timeLimitMinutes: z.number().int().min(5).max(240),
  requestsPerSecond: z.number().int().min(1).max(20),
  maxConcurrency: z.number().int().min(1).max(8),
  outputFormat: z.enum(["json", "xml", "html"]),
  respectExclusions: z.literal(true),
  scopeConfirmed: z.literal(true),
  authenticated: z.boolean().optional(),
});

const liveScansEnabled = () => (process.env.AIVERA_LIVE_SCANS_ENABLED ?? process.env.AEGIS_LIVE_SCANS_ENABLED) === "true";
export const LIVE_TOOLS: LiveTool[] = ["nmap", "owasp_zap", "http_inspector"];
const TOOL_LABEL: Record<LiveTool, string> = { nmap: "Nmap", owasp_zap: "OWASP ZAP", http_inspector: "the HTTP security inspector" };

router.get("/scans/automated/capabilities", (_req, res) => {
  res.json({ enabled: liveScansEnabled() && approvedScanHosts().size > 0, tools: LIVE_TOOLS, profiles: ["passive", "baseline", "standard"], isolatedWorker: true });
});

/**
 * Every rule an automated run must pass. Checked when the run is queued and again
 * before each tool starts, so a scope change mid-run stops it.
 */
export function assertAutomatedRunAllowed(target: Awaited<ReturnType<typeof authorizedTarget>>, config: ScanConfig, hasCredential: boolean) {
  if (!liveScansEnabled()) fail(503, "Live scanning is disabled. Set AIVERA_LIVE_SCANS_ENABLED=true on a dedicated lab server.");
  if (!approvedScanHosts().has(new URL(target.url).hostname.replace(/^\[|\]$/g, "").toLowerCase())) fail(403, "The target host is not on the server administrator's live scan allowlist.");
  if (!urlHostInScope(target.url, target.scope.inScopeHosts)) fail(400, "The target host must be explicitly in scope.");
  if (config.tools.some((tool) => !LIVE_TOOLS.includes(tool as LiveTool))) fail(400, "Automated runs support Nmap, OWASP ZAP and the HTTP security inspector only.");
  for (const tool of config.tools as LiveTool[])
    if (!toolPermitted(tool, target.scope.allowedActivities)) fail(403, `The target's scope must allow "${TOOL_ACTIVITY[tool]}" to run ${TOOL_LABEL[tool]}.`);
  if (config.profile === "thorough") fail(400, "The thorough profile is not available for automated runs.");
  if (config.profile === "standard") {
    if (!isLoopbackUrl(target.url)) fail(403, "The active profile sends attack payloads, so it only runs against a copy on this machine (127.0.0.1 or localhost), never a hosted site.");
    if (!hasActivity(ACTIVE_SCAN_ACTIVITY, target.scope.allowedActivities)) fail(403, `The target's scope must allow "${ACTIVE_SCAN_ACTIVITY}" for the active profile.`);
    if (!config.tools.includes("owasp_zap")) fail(400, "The active profile needs OWASP ZAP.");
  }
  if (config.authenticated) {
    if (!hasActivity(AUTH_SCAN_ACTIVITY, target.scope.allowedActivities)) fail(403, `The target's scope must allow "${AUTH_SCAN_ACTIVITY}" for a signed-in scan.`);
    if (!hasCredential) fail(400, "Save a test-account session for this website before running a signed-in scan.");
  }
  if (!config.categories.some((c) => target.scope.allowedCategories.includes(c))) fail(400, "No selected assessment category is permitted by the target scope.");
}

export const hasScanCredential = async (targetId: string) => (await prisma.scanCredential.count({ where: { targetId } })) > 0;

export type AutomatedConfig = z.infer<typeof scanConfig>;

/** Queues an automated run and starts it in the background. */
export async function startAutomatedScan(input: { name: string; targetId: string; projectId?: string; config: AutomatedConfig; userId: string }) {
  const target = await authorizedTarget(input.targetId);
  const starter = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  await assertProjectAccess(starter, target.projectId);
  if (input.projectId && target.projectId !== input.projectId) fail(400, "Target does not belong to this project.");
  assertAutomatedRunAllowed(target, input.config, await hasScanCredential(target.id));
  const now = new Date();
  const scan = await oneAtATime(async () => {
    await requireReviewComplete(target.id);
    return prisma.scan.create({ data: {
      id: newId("scn"), code: nextCode("SCN", (await prisma.scan.findMany({ select: { code: true } })).map((s) => s.code)),
      name: input.name, projectId: target.projectId, targetId: target.id, status: "queued", progress: 0,
      stage: "Waiting for scan worker", config: input.config, createdBy: input.userId, createdAt: now, dataOrigin: "real",
    } });
  });
  const kind = `${input.config.profile === "standard" ? "Active" : "Passive"}${input.config.authenticated ? ", signed-in" : ""}`;
  await log(input.userId, "scan_queued", "scan", scan.id, scan.code, `${kind} scan of ${target.name} queued`);
  void executeAutomatedScan(scan.id).catch((e) => console.error("Automated scan job failed", e));
  return { id: scan.id, code: scan.code };
}

/**
 * Automated runs live in this process. If the server stops or restarts mid-run (including a
 * dev-mode reload after a file change), the run is gone but its record would stay "running"
 * forever and block new scans of that website. On startup, mark such runs as interrupted.
 */
export async function recoverInterruptedScans(): Promise<number> {
  const stuck = await prisma.scan.findMany({ where: { dataOrigin: "real", status: { in: ["queued", "running"] } } });
  const message = "Interrupted: the AIVERA server stopped or restarted while this scan was running. Start the scan again.";
  for (const s of stuck) {
    await prisma.scan.update({ where: { id: s.id }, data: { status: "failed", stage: "Interrupted", errorMessage: message, completedAt: new Date() } });
    await log(s.createdBy, "scan_failed", "scan", s.id, s.code, message);
    await scanNotice(s.id, { title: "Scan interrupted", message: `${s.code} on ${await targetName(s.targetId)} was cut off because the AIVERA server stopped or restarted. Results saved before that point are kept; start the scan again when you're ready.`, tone: "warning" });
  }
  return stuck.length;
}

/** One click starts a bounded run. The assessor still verifies findings. */
router.post("/scans/automated", requirePermission("run_demo_scans"), async (req, res) => {
  if (!liveScansEnabled()) fail(503, "Live scanning is disabled. Set AIVERA_LIVE_SCANS_ENABLED=true on a dedicated lab server.");
  const b = parse(z.object({ name: z.string().trim().min(1).max(160), projectId: z.string(), targetId: z.string(), config: scanConfig }), req.body);
  res.status(202).json(await startAutomatedScan({ ...b, userId: me(req).id }));
});

const STAGE: Record<LiveTool, (c: ScanConfig) => string> = {
  nmap: () => "Running Nmap",
  owasp_zap: (c) => `Running OWASP ZAP ${c.profile === "standard" ? "active" : "passive"} assessment${c.authenticated ? " (signed in)" : ""}`,
  http_inspector: () => "Checking HTTP headers and TLS",
};

async function executeAutomatedScan(id: string) {
  const row = await prisma.scan.findUniqueOrThrow({ where: { id } });
  const config = row.config as unknown as ScanConfig;
  try {
    await prisma.scan.update({ where: { id }, data: { status: "running", startedAt: new Date(), stage: "Checking approved scope", progress: 5 } });
    const selected = config.tools as LiveTool[];
    let findings = 0;
    for (const [index, tool] of selected.entries()) {
      const target = await authorizedTarget(row.targetId);
      const credential = config.authenticated ? await prisma.scanCredential.findUnique({ where: { targetId: target.id } }) : null;
      try {
        assertAutomatedRunAllowed(target, config, !!credential);
      } catch (e) {
        throw new Error(`Stopped: ${(e as Error).message}`);
      }
      await prisma.scan.update({ where: { id }, data: { stage: STAGE[tool](config), progress: 10 + Math.round(index / selected.length * 75) } });
      // The tool runs in a separate worker process without database access or server secrets.
      const auth = credential ? { headerName: credential.headerName, value: openSecret(credential.valueEnc) } : undefined;
      const out = await runToolInWorker(tool, target, config, { auth });
      const project = await prisma.project.findUniqueOrThrow({ where: { id: row.projectId } });
      const part = `${id}-${tool}`;
      const real = <T extends { dataOrigin: string }>(items: T[]) => items.map((item) => ({ ...item, dataOrigin: "real" as const }));
      const { bundle, saved } = await oneAtATime(async () => {
      const bundle = buildImport(out.parsed, target, {
        scanId: part, scanCode: row.code, findingStartIndex: await nextFindingIndex(), createdBy: row.createdBy,
        assessorId: project.ownerId, now: new Date().toISOString(), raw: out.raw, fileName: `automated-${tool}`,
      });
      const saved = await persistBundle({
        scan: bundle.scan,
        results: [{ ...bundle.result, scanId: id, dataOrigin: "real", summary: bundle.result.summary.replace(/^Imported /, "Automated ") }],
        hosts: real(bundle.hosts).map((h) => ({ ...h, scanId: id })), ports: real(bundle.ports), dns: [], endpoints: real(bundle.endpoints),
        findings: real(bundle.findings).map((f) => ({ ...f, scanId: id })), evidence: real(bundle.evidence),
      }, false);
      return { bundle, saved };
      });
      findings += saved.newFindings;
      await assignNewFindings(row.projectId, saved.newIds, row.code);
      await log(row.createdBy, "tool_output_captured", "scan", id, row.code, `${tool} produced ${saved.newFindings} new finding(s), ${saved.repeatedFindings} previously recorded; ${bundle.skipped.length} out-of-scope item(s) discarded`);
    }
    let aiMissed = 0;
    if (aiConfigured()) {
      await prisma.scan.update({ where: { id }, data: { stage: "Generating advisory AI analysis", progress: 90 } });
      aiMissed = await analyzeAutomatedScan(id, row.createdBy);
    }
    await prisma.scan.update({ where: { id }, data: { status: "completed", progress: 100, stage: "Awaiting assessor verification", completedAt: new Date() } });
    const aiNote = aiMissed ? ` AI notes could not be written for ${aiMissed} item${aiMissed === 1 ? "" : "s"}; you can ask again from the finding.` : "";
    await scanNotice(id, findings
      ? { title: "Scan finished", message: `${row.code} on ${await targetName(row.targetId)}: ${findings} new finding${findings === 1 ? "" : "s"} to review.${aiNote}`, tone: "info" }
      : { title: "Scan finished, nothing new", message: `${row.code} on ${await targetName(row.targetId)} found no new issues.${aiNote}`, tone: "success" });
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    const stopped = message.startsWith("Stopped: ");
    await prisma.scan.update({ where: { id }, data: { status: "failed", stage: stopped ? "Stopped by scope check" : "Tool adapter failed", errorMessage: message, completedAt: new Date() } });
    await log(row.createdBy, "scan_failed", "scan", id, row.code, message);
    await scanNotice(id, stopped
      ? { title: "Scan stopped", message: `${row.code} on ${await targetName(row.targetId)} was stopped because the website's scope or permissions changed. ${message.slice(9, 220)}`, tone: "warning" }
      : { title: "Scan failed", message: `${row.code} on ${await targetName(row.targetId)} could not finish: ${message.slice(0, 220)}`, tone: "critical" });
  }
}

const targetName = async (targetId: string) => (await prisma.target.findUnique({ where: { id: targetId }, select: { name: true } }))?.name ?? "a deleted website";

/** Every way an automated scan can end gets a notification that links to the scan. */
function scanNotice(scanId: string, n: { title: string; message: string; tone: "info" | "success" | "warning" | "critical" }) {
  return notify({ ...n, link: `/scans/${scanId}` }, "scanEvents").catch((e) => console.error("[scan] notification failed", e));
}

/** Returns how many AI notes could not be written. The scan itself still counts as finished. */
async function analyzeAutomatedScan(scanId: string, requestedBy: string): Promise<number> {
  const scanRow = await prisma.scan.findUniqueOrThrow({ where: { id: scanId } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: scanRow.projectId }, include: { members: true } });
  const target = await prisma.target.findUniqueOrThrow({ where: { id: scanRow.targetId } });
  const scan = M.toScan(scanRow);
  const scanResults = (await prisma.scanResult.findMany({ where: { scanId } })).map(M.toScanResult);
  const base = { project: M.toProject(project), target: M.toTarget(target), scan, scanResults, requestedBy };
  const findings = await prisma.finding.findMany({ where: { scanId }, take: 3 });
  const tasks = [
    { mode: "scan_interpretation" as const, evidence: [] },
    ...findings.map((row) => ({ mode: "remediation" as const, finding: M.toFinding(row) })),
  ];
  let missed = 0;
  for (const task of tasks) {
    try {
      const evidence = "finding" in task && task.finding
        ? (await prisma.evidence.findMany({ where: { findingId: task.finding.id } })).map(M.toEvidence) : [];
      const analysis = await analyzeWithGemini({ ...base, ...task, evidence });
      await prisma.aIAnalysis.create({ data: M.analysisColumns(analysis) });
      await log(requestedBy, "ai_analysis_generated", analysis.findingId ? "finding" : "scan", analysis.findingId ?? scanId, analysis.title, `Automatic ${task.mode} analysis generated; assessor verification remains required`);
    } catch (e) {
      missed++;
      await log(requestedBy, "scan_failed", "scan", scanId, scan.code, `AI ${task.mode} could not complete: ${(e as Error).message.slice(0, 180)}`);
    }
  }
  return missed;
}

/** Generates a clearly-labelled SIMULATED scan server-side. No network activity. */
router.post("/scans/simulate", requirePermission("run_demo_scans"), async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(160), projectId: z.string(), targetId: z.string(), config: scanConfig }), req.body);
  const target = await authorizedTarget(b.targetId);
  if (target.projectId !== b.projectId) fail(400, "Target does not belong to this project.");
  await assertProjectAccess(me(req), target.projectId);
  const config: ScanConfig = { ...b.config, categories: b.config.categories.filter((c) => target.scope.allowedCategories.includes(c)) };
  if (!config.categories.length) fail(400, "None of the selected categories are permitted by the target's scope.");
  const now = new Date().toISOString();
  const project = await prisma.project.findUniqueOrThrow({ where: { id: b.projectId } });
  const { scan, saved } = await oneAtATime(async () => {
  await requireReviewComplete(target.id);
  const scan = {
    id: newId("scn"), code: nextCode("SCN", (await prisma.scan.findMany({ select: { code: true } })).map((s) => s.code)), name: b.name, projectId: b.projectId, targetId: b.targetId,
    status: "completed" as const, progress: 100, stage: "Simulation complete", config, createdBy: me(req).id, createdAt: now, startedAt: now, completedAt: now, dataOrigin: "simulated" as const,
  };
  const out = generateSimulation(scan, target, await nextFindingIndex(), project.ownerId, now);
  const saved = await persistBundle({ scan, results: out.results, hosts: out.hosts, ports: out.ports, dns: out.dns, endpoints: out.endpoints, findings: out.findings, evidence: out.evidence });
  return { scan, saved };
  });
  await assignNewFindings(b.projectId, saved.newIds, scan.code);
  await log(me(req).id, "demo_scan_completed", "scan", scan.id, scan.code, `Demo simulation produced ${saved.newFindings} new finding(s), ${saved.repeatedFindings} previously recorded`);
  await notify({ title: "Demo simulation finished", message: `${scan.code}: ${saved.newFindings} new finding(s) require verification.`, tone: "info", link: `/scans/${scan.id}` }, "scanEvents");
  res.status(201).json({ scan, findingCount: saved.newFindings });
});

/** Removes every SIMULATED record and anything attached to it. Real scans, findings and evidence are untouched. */
router.post("/simulated-data/reset", requirePermission("run_demo_scans"), async (req, res) => {
  const scans = await prisma.scan.findMany({ where: { dataOrigin: "simulated" }, select: { id: true } });
  const scanIds = scans.map((s) => s.id);
  const findings = await prisma.finding.findMany({ where: { OR: [{ dataOrigin: "simulated" }, { scanId: { in: scanIds } }] }, select: { id: true } });
  const findingIds = findings.map((f) => f.id);
  const hosts = await prisma.host.findMany({ where: { OR: [{ dataOrigin: "simulated" }, { scanId: { in: scanIds } }] }, select: { id: true } });
  const hostIds = hosts.map((h) => h.id);
  const tasks = await prisma.remediationTask.findMany({ where: { findingId: { in: findingIds } }, select: { id: true } });
  const taskIds = tasks.map((t) => t.id);
  await prisma.$transaction([
    prisma.remediationHistory.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.remediationTask.deleteMany({ where: { id: { in: taskIds } } }),
    prisma.verification.deleteMany({ where: { findingId: { in: findingIds } } }),
    prisma.risk.deleteMany({ where: { findingId: { in: findingIds } } }),
    prisma.aIAnalysis.deleteMany({ where: { OR: [{ findingId: { in: findingIds } }, { scanId: { in: scanIds } }] } }),
    prisma.evidence.deleteMany({ where: { OR: [{ findingId: { in: findingIds } }, { dataOrigin: "simulated" }] } }),
    prisma.finding.deleteMany({ where: { id: { in: findingIds } } }),
    prisma.port.deleteMany({ where: { OR: [{ hostId: { in: hostIds } }, { dataOrigin: "simulated" }] } }),
    prisma.host.deleteMany({ where: { id: { in: hostIds } } }),
    prisma.dnsRecord.deleteMany({ where: { dataOrigin: "simulated" } }),
    prisma.endpoint.deleteMany({ where: { dataOrigin: "simulated" } }),
    prisma.reconRun.deleteMany({ where: { dataOrigin: "simulated" } }),
    prisma.scanResult.deleteMany({ where: { OR: [{ scanId: { in: scanIds } }, { dataOrigin: "simulated" }] } }),
    prisma.scan.deleteMany({ where: { id: { in: scanIds } } }),
  ]);
  await log(me(req).id, "simulated_data_removed", "settings", undefined, "Simulated data", `Removed ${scanIds.length} simulated scan(s) and ${findingIds.length} simulated finding(s). Real data was not changed.`);
  res.json({ scans: scanIds.length, findings: findingIds.length });
});

/* --------------------------------- Imports -------------------------------- */
/** Parses tool output on the server and re-enforces the target's scope. Never runs the tool. */
router.post("/imports", requirePermission("run_demo_scans"), async (req, res) => {
  const b = parse(z.object({ targetId: z.string(), format: z.enum(["nmap_xml", "zap_json"]), raw: z.string().min(1).max(MAX_IMPORT_BYTES), fileName: z.string().trim().min(1).max(200) }), req.body);
  const target = await authorizedTarget(b.targetId);
  await assertProjectAccess(me(req), target.projectId);
  let parsed;
  try {
    parsed = b.format === "nmap_xml" ? parseNmapXmlServer(b.raw) : parseZapJson(b.raw);
  } catch (e) {
    fail(400, (e as Error).message);
  }
  const project = await prisma.project.findUniqueOrThrow({ where: { id: target.projectId } });
  const scanId = newId("scn");
  const { bundle, saved } = await oneAtATime(async () => {
  await requireReviewComplete(target.id);
  const bundle = buildImport(parsed!, target, {
    scanId, scanCode: nextCode("SCN", (await prisma.scan.findMany({ select: { code: true } })).map((s) => s.code)), findingStartIndex: await nextFindingIndex(),
    createdBy: me(req).id, assessorId: project.ownerId, now: new Date().toISOString(), raw: b.raw, fileName: b.fileName.replace(/[^\w.\- ]/g, "_"),
  });
  if (bundle.hosts.length + bundle.findings.length + bundle.endpoints.length === 0) fail(400, `Nothing in scope to import (${bundle.skipped.length} item(s) skipped by scope).`);
  const saved = await persistBundle({ scan: bundle.scan, results: [bundle.result], hosts: bundle.hosts, ports: bundle.ports, dns: [], endpoints: bundle.endpoints, findings: bundle.findings, evidence: bundle.evidence });
  return { bundle, saved };
  });
  await assignNewFindings(target.projectId, saved.newIds, bundle.scan.code);
  await prisma.reconRun.create({ data: { id: newId("rcn"), targetId: target.id, tool: bundle.result.tool, label: `Imported ${b.fileName} (${bundle.scan.code})`, recordsAdded: bundle.hosts.length + bundle.ports.length + bundle.endpoints.length, ranAt: new Date(), dataOrigin: "imported" } });
  await prisma.integration.update({ where: { id: bundle.result.tool }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  await log(me(req).id, "tool_output_imported", "scan", scanId, bundle.scan.code, `Imported ${b.fileName} for ${target.name}: ${saved.newFindings} new finding(s), ${saved.repeatedFindings} previously recorded, ${bundle.skipped.length} out-of-scope item(s) skipped`);
  await notify({ title: "Tool output imported", message: `${bundle.scan.code}: ${saved.newFindings} new finding(s) await verification.`, tone: "info", link: `/scans/${scanId}` }, "scanEvents");
  res.status(201).json({ scanId, scanCode: bundle.scan.code, findings: saved.newFindings, skipped: bundle.skipped });
});

/* -------------------------------- Findings -------------------------------- */
router.get("/findings/:id/alias", async (req, res) => {
  const alias = (await prisma.findingAlias.findUnique({ where: { oldId: param(req) } })) ?? fail(404, "Finding alias not found");
  res.json({ canonicalId: alias.canonicalId });
});

router.post("/findings/manual", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({
    targetId: z.string(), title: z.string().trim().min(5).max(160), category: categoryEnum, severity: severityEnum, affectedAsset: z.string().trim().min(1).max(500),
    parameter: z.string().max(100).optional(), cwe: z.string().regex(/^(CWE-\d+)?$/).optional(), description: z.string().trim().min(10).max(8000), impact: z.string().trim().min(5).max(4000),
    remediation: z.string().trim().min(5).max(4000), evidenceTitle: z.string().trim().min(3).max(200), evidenceContent: z.string().trim().min(10).max(20000),
    checklistRef: z.object({ assessmentId: z.string(), itemId: z.string() }).optional(),
  }), req.body);
  const target = await authorizedTarget(b.targetId);
  await assertProjectAccess(me(req), target.projectId);
  if (!target.scope.allowedCategories.includes(b.category)) fail(400, "That category is not permitted by the target's approved scope.");
  const now = new Date();
  const id = newId("fnd");
  const code = await oneAtATime(async () => {
  const code = `FND-${String(await nextFindingIndex()).padStart(4, "0")}`;
  await prisma.$transaction([
    prisma.finding.create({ data: {
      id, code, title: b.title, description: b.description, projectId: target.projectId, targetId: target.id, category: b.category, severity: b.severity, affectedAsset: b.affectedAsset,
      parameter: b.parameter || null, sourceTool: "manual", verificationStatus: "pending", assignedAssessorId: me(req).id, discoveredAt: now, updatedAt: now, impact: b.impact,
      remediation: b.remediation, cwe: b.cwe || null, owasp: CATEGORIES.find((c) => c.id === b.category)?.owasp ?? null, templateKey: "manual", dataOrigin: "user_created",
    } }),
    prisma.evidence.create({ data: { id: `ev-${id}-1`, findingId: id, type: "manual_note", title: b.evidenceTitle, content: b.evidenceContent, source: "manual", capturedAt: now, reviewed: false, dataOrigin: "user_created" } }),
  ]);
  return code;
  });
  if (b.checklistRef) {
    const item = await prisma.checklistItem.findUnique({ where: { id: b.checklistRef.itemId } });
    if (item && item.assessmentId === b.checklistRef.assessmentId)
      await prisma.checklistItem.update({ where: { id: item.id }, data: { result: "fail", evidenceNote: [item.evidenceNote, code].filter(Boolean).join(" · "), updatedAt: now, updatedBy: me(req).id } });
  }
  await log(me(req).id, "finding_recorded", "finding", id, code, `Recorded manual finding "${b.title}" (pending verification)`);
  res.status(201).json({ id, code });
});

const VERIFICATION_ACTIVITY = { confirmed: "finding_confirmed", rejected: "finding_rejected", needs_review: "finding_needs_review", pending: "finding_reviewed" } as const;

/** Human verification. Only this endpoint can change a finding's verification status. */
router.post("/findings/:id/verifications", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({ toStatus: z.enum(["pending", "confirmed", "rejected", "needs_review"]), notes: z.string().max(8000), decisionReason: z.string().trim().max(2000), evidenceReviewed: z.boolean() }), req.body);
  const f = (await prisma.finding.findUnique({ where: { id: param(req) } })) ?? fail(404, "Finding not found");
  await assertProjectAccess(me(req), f.projectId);
  if (f.signoffStatus === "approved" && b.toStatus !== "confirmed") fail(409, "A lead has signed this finding off. Ask the lead to return it before changing the decision.");
  const settings = (await prisma.appSetting.findUnique({ where: { id: "app" } }))?.value as { security?: { requireEvidenceReview?: boolean } } | undefined;
  if (b.decisionReason.length < 5) fail(400, "A decision reason is required.");
  if (b.toStatus !== "pending" && b.notes.trim().length < 10) fail(400, "Verification notes are required.");
  if (settings?.security?.requireEvidenceReview !== false && (b.toStatus === "confirmed" || b.toStatus === "rejected") && !b.evidenceReviewed) fail(400, "Evidence review must be attested before confirming or rejecting.");
  const now = new Date();
  await prisma.$transaction([
    prisma.verification.create({ data: { id: newId("ver"), findingId: f.id, fromStatus: f.verificationStatus, toStatus: b.toStatus, assessorId: me(req).id, notes: b.notes.trim(), decisionReason: b.decisionReason, evidenceReviewed: b.evidenceReviewed, decidedAt: now } }),
    prisma.finding.update({ where: { id: f.id }, data: { verificationStatus: b.toStatus as VerificationStatus, updatedAt: now, ...signoffFields(f, b.toStatus) } }),
    ...(b.evidenceReviewed ? [prisma.evidence.updateMany({ where: { findingId: f.id }, data: { reviewed: true, reviewedBy: me(req).id } })] : []),
  ]);
  await log(me(req).id, VERIFICATION_ACTIVITY[b.toStatus], "finding", f.id, f.code, `Marked "${f.title}" as ${b.toStatus.replace("_", " ")}. Reason: ${b.decisionReason}`);
  if (b.toStatus === "confirmed") {
    if (!(await prisma.risk.findUnique({ where: { findingId: f.id } }))) {
      const base = defaultRiskInputs(f.severity as Severity);
      await prisma.risk.create({ data: { id: newId("rsk"), findingId: f.id, title: f.title, ...base, ownerId: f.assignedAssessorId, mitigationStatus: "not_started", reviewDate: new Date(Date.now() + 30 * 86400_000), notes: "Demo risk rating derived from severity (likelihood × impact). Not a CVSS score.", createdAt: now, updatedAt: now } });
    }
    if (needsSignoff(f.severity) && f.signoffStatus !== "approved") {
      const leads = await projectLeads(f.projectId, [me(req).id]);
      await notify({ title: `${f.severity === "critical" ? "Critical" : "High"} finding needs your sign-off`, message: `${f.code} ${f.title} was confirmed by ${me(req).name}. Check the evidence and sign it off or return it.`, tone: "critical", link: `/findings/${f.id}` }, "findingUpdates", leads.length ? leads : undefined);
    }
    await createFixTask(f.id, me(req).id);
  } else if (f.verificationStatus === "confirmed") {
    await removeUntouchedFixTask(f.id, me(req).id, `${f.code} is no longer confirmed`);
  }
  await promptReportWhenReviewed(f.projectId);
  res.json({ ok: true });
});

const needsSignoff = (severity: string) => severity === "critical" || severity === "high";

/** Confirming a critical or high finding asks a lead to sign it off; any other decision clears that. */
function signoffFields(f: { severity: string; signoffStatus: string }, to: string) {
  if (to === "confirmed") return needsSignoff(f.severity) && f.signoffStatus !== "approved" ? { signoffStatus: "pending", signoffBy: null, signoffAt: null } : {};
  return { signoffStatus: "not_required", signoffBy: null, signoffAt: null };
}

/** A fix task nobody has started yet is removed when its finding stops being confirmed. */
async function removeUntouchedFixTask(findingId: string, actorId: string, why: string) {
  const tasks = await prisma.remediationTask.findMany({ where: { findingId, status: "open" }, include: { history: true } });
  for (const t of tasks.filter((t) => t.history.length <= 1)) {
    await prisma.$transaction([prisma.remediationHistory.deleteMany({ where: { taskId: t.id } }), prisma.remediationTask.delete({ where: { id: t.id } })]);
    await log(actorId, "remediation_updated", "remediation", t.id, t.code, `Removed the unstarted fix task: ${why}`);
  }
}

/**
 * Second pair of eyes on critical and high findings. The lead checks the assessor's evidence and
 * either signs it off or returns it for another look. Nobody signs off a finding they confirmed.
 */
router.post("/findings/:id/signoff", requirePermission("signoff_findings"), async (req, res) => {
  const b = parse(z.object({ decision: z.enum(["approve", "return"]), note: z.string().trim().max(2000) }), req.body);
  const f = (await prisma.finding.findUnique({ where: { id: param(req) } })) ?? fail(404, "Finding not found");
  await assertProjectAccess(me(req), f.projectId);
  if (f.verificationStatus !== "confirmed" || f.signoffStatus !== "pending") fail(409, "This finding is not waiting for sign-off.");
  const confirmer = await prisma.verification.findFirst({ where: { findingId: f.id, toStatus: "confirmed" }, orderBy: { decidedAt: "desc" } });
  if (confirmer?.assessorId === me(req).id) fail(403, "You confirmed this finding, so another lead has to sign it off.");
  if (b.decision === "return" && b.note.length < 5) fail(400, "Say what needs another look.");
  const now = new Date();
  if (b.decision === "approve") {
    await prisma.finding.update({ where: { id: f.id }, data: { signoffStatus: "approved", signoffBy: me(req).id, signoffAt: now, signoffNote: b.note || null, updatedAt: now } });
    await log(me(req).id, "finding_reviewed", "finding", f.id, f.code, `Signed off ${f.severity} finding "${f.title}"${b.note ? `: ${b.note}` : ""}`);
    if (confirmer) await notify({ title: "Finding signed off", message: `${me(req).name} signed off ${f.code} ${f.title}.`, tone: "success", link: `/findings/${f.id}` }, "findingUpdates", [confirmer.assessorId]);
  } else {
    await prisma.$transaction([
      prisma.verification.create({ data: { id: newId("ver"), findingId: f.id, fromStatus: "confirmed", toStatus: "needs_review", assessorId: me(req).id, notes: b.note, decisionReason: `Returned by the lead: ${b.note}`.slice(0, 2000), evidenceReviewed: true, decidedAt: now } }),
      prisma.finding.update({ where: { id: f.id }, data: { verificationStatus: "needs_review", signoffStatus: "returned", signoffBy: me(req).id, signoffAt: now, signoffNote: b.note, updatedAt: now } }),
    ]);
    await removeUntouchedFixTask(f.id, me(req).id, `the lead returned ${f.code}`);
    await log(me(req).id, "finding_needs_review", "finding", f.id, f.code, `Returned "${f.title}" for another look: ${b.note}`);
    await notify({ title: "Finding returned for another look", message: `${me(req).name} returned ${f.code} ${f.title}: ${b.note}`, tone: "warning", link: `/findings/${f.id}` }, "findingUpdates", [f.assignedAssessorId, ...(confirmer ? [confirmer.assessorId] : [])]);
  }
  res.json({ ok: true });
});

router.post("/findings/assign", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.string()).min(1).max(500), assessorId: z.string() }), req.body);
  const user = (await prisma.user.findUnique({ where: { id: b.assessorId } })) ?? fail(404, "User not found");
  if (!can(user.role, "verify_findings") || user.status !== "active") fail(400, "Findings can only be assigned to an active assessor or lead.");
  for (const f of await prisma.finding.findMany({ where: { id: { in: b.ids } }, select: { projectId: true }, distinct: ["projectId"] })) await assertProjectAccess(me(req), f.projectId);
  await prisma.finding.updateMany({ where: { id: { in: b.ids } }, data: { assignedAssessorId: user.id, updatedAt: new Date() } });
  await log(me(req).id, "finding_reviewed", "finding", b.ids[0], `${b.ids.length} finding(s)`, `Assigned ${b.ids.length} finding(s) to ${user.name}`);
  if (user.id !== me(req).id) await notify({ title: "Findings assigned to you", message: `${me(req).name} gave you ${b.ids.length} finding${b.ids.length === 1 ? "" : "s"} to review.`, tone: "info", link: "/my-work" }, "findingUpdates", [user.id]);
  res.json({ ok: true });
});

router.post("/findings/:id/evidence", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({ title: z.string().trim().min(3).max(200), content: z.string().trim().min(10).max(20000) }), req.body);
  const f = (await prisma.finding.findUnique({ where: { id: param(req) } })) ?? fail(404, "Finding not found");
  await assertProjectAccess(me(req), f.projectId);
  const ev = await prisma.evidence.create({ data: { id: newId(`ev-${f.id}`), findingId: f.id, type: "manual_note", title: b.title, content: b.content, source: "manual", capturedAt: new Date(), reviewed: false, dataOrigin: "user_created" } });
  await log(me(req).id, "evidence_added", "finding", f.id, f.code, `Added manual evidence "${b.title}"`);
  res.status(201).json(M.toEvidence(ev));
});

router.patch("/evidence/:id", requirePermission("verify_findings"), async (req, res) => {
  const { reviewed } = parse(z.object({ reviewed: z.boolean() }), req.body);
  const ev = await prisma.evidence.update({ where: { id: param(req) }, data: { reviewed, reviewedBy: reviewed ? me(req).id : null } });
  if (reviewed) await log(me(req).id, "evidence_reviewed", "finding", ev.findingId, ev.title, "Marked evidence item as reviewed");
  res.json(M.toEvidence(ev));
});

/* ----------------------------------- AI ----------------------------------- */
/**
 * Runs an analysis on the server. Currently the deterministic demo adapter;
 * the next step swaps in a real model here, keeping keys server-side.
 * The result is advisory only and never changes a finding's status.
 */
router.post("/ai/analyses", requirePermission("use_ai"), async (req, res) => {
  const b = parse(z.object({ mode: z.enum(["scan_interpretation", "vulnerability_explanation", "risk_prioritization", "remediation", "test_recommendations", "assessment_summary"]), projectId: z.string(), findingId: z.string().optional(), scanId: z.string().optional() }), req.body);
  const project = (await prisma.project.findUnique({ where: { id: b.projectId }, include: { members: true } })) ?? fail(404, "Project not found");
  await assertProjectAccess(me(req), project.id);
  const finding = b.findingId ? M.toFinding((await prisma.finding.findUnique({ where: { id: b.findingId } })) ?? fail(404, "Finding not found")) : undefined;
  const scanRow = b.scanId ? await prisma.scan.findUnique({ where: { id: b.scanId } }) : null;
  const scan = scanRow ? M.toScan(scanRow) : undefined;
  const useScanOnly = b.mode === "scan_interpretation" && scan;
  if (b.mode === "scan_interpretation" && !scan && !finding) fail(400, "Select a scan to interpret.");
  if (["vulnerability_explanation", "risk_prioritization", "remediation", "test_recommendations"].includes(b.mode) && !finding) fail(400, "Select a finding for this analysis.");
  const targetId = finding?.targetId ?? scan?.targetId;
  const targetRow = targetId ? await prisma.target.findUnique({ where: { id: targetId } }) : null;
  const ctx = {
    mode: b.mode as AIMode,
    project: M.toProject(project),
    target: targetRow ? M.toTarget(targetRow) : undefined,
    scan,
    scanResults: scan ? (await prisma.scanResult.findMany({ where: { scanId: scan.id } })).map(M.toScanResult) : [],
    finding: useScanOnly ? undefined : finding,
    evidence: finding && !useScanOnly ? (await prisma.evidence.findMany({ where: { findingId: finding.id } })).map(M.toEvidence) : [],
    projectFindings: b.mode === "assessment_summary" ? (await prisma.finding.findMany({ where: { projectId: project.id } })).map(M.toFinding) : undefined,
    requestedBy: me(req).id,
  };
  // Real model when configured; otherwise the clearly-labelled demo samples. Errors are
  // reported, never silently replaced by demo output.
  const analysis = aiConfigured() ? await analyzeWithGemini(ctx) : await demoAIAdapter.analyze(ctx).catch((e: Error) => fail(400, e.message));
  await prisma.aIAnalysis.create({ data: M.analysisColumns(analysis) });
  await prisma.integration.update({ where: { id: "ai_service" }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  await log(
    me(req).id, "ai_analysis_generated", analysis.findingId ? "finding" : "project", analysis.findingId ?? analysis.projectId, analysis.title,
    analysis.adapter === "api" ? `Generated AI analysis with ${analysis.model} (${analysis.redactionCount ?? 0} value(s) redacted before sending)` : "Generated sample analysis (demo adapter, no AI model configured)",
  );
  res.status(201).json(analysis);
});

router.patch("/ai/analyses/:id", requirePermission("use_ai"), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["generated", "sent_to_verification", "acknowledged"]) }), req.body);
  await prisma.aIAnalysis.update({ where: { id: param(req) }, data: { status } });
  res.json({ ok: true });
});

/* ---------------------------------- Risks --------------------------------- */
router.patch("/risks/:id", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({
    likelihood: z.number().int().min(1).max(5).optional(), impact: z.number().int().min(1).max(5).optional(), ownerId: z.string().optional(),
    mitigationStatus: z.enum(["not_started", "in_progress", "mitigated", "accepted"]).optional(), reviewDate: z.string().datetime().optional(), notes: z.string().max(4000).optional(),
  }), req.body);
  const r = await prisma.risk.update({ where: { id: param(req) }, data: { ...b, reviewDate: b.reviewDate ? new Date(b.reviewDate) : undefined, updatedAt: new Date() } });
  await log(me(req).id, "risk_updated", "risk", r.id, r.title, `Updated risk record (L${r.likelihood} × I${r.impact})`);
  res.json(M.toRisk(r));
});
