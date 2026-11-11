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

export const router = Router();
router.use(requireAuth);

const categoryEnum = z.enum(CATEGORIES.map((c) => c.id) as [AssessmentCategoryId, ...AssessmentCategoryId[]]);
const severityEnum = z.enum(SEVERITIES as [Severity, ...Severity[]]);

async function authorizedTarget(id: string) {
  const t = (await prisma.target.findUnique({ where: { id } })) ?? fail(404, "Target not found");
  if (t.authorizationStatus !== "authorized" || !t.authorizationConfirmed) fail(403, "This target does not have confirmed authorization.");
  return M.toTarget(t);
}

const nextFindingIndex = async () => (await prisma.finding.count()) + 1;

/** Persists records produced by simulation or import in one transaction. */
async function persistBundle(b: {
  scan: ReturnType<typeof M.toScan>; results: ReturnType<typeof M.toScanResult>[]; hosts: ReturnType<typeof M.toHost>[]; ports: ReturnType<typeof M.toPort>[];
  dns: ReturnType<typeof M.toDns>[]; endpoints: ReturnType<typeof M.toEndpoint>[]; findings: ReturnType<typeof M.toFinding>[]; evidence: ReturnType<typeof M.toEvidence>[];
}) {
  const s = b.scan;
  await prisma.$transaction([
    prisma.scan.create({ data: { ...s, config: s.config as object, stage: s.stage ?? null, errorMessage: s.errorMessage ?? null, createdAt: new Date(s.createdAt), startedAt: s.startedAt ? new Date(s.startedAt) : null, completedAt: s.completedAt ? new Date(s.completedAt) : null } }),
    prisma.scanResult.createMany({ data: b.results.map((r) => ({ ...r, recordedAt: new Date(r.recordedAt) })) }),
    prisma.host.createMany({ data: b.hosts.map((h) => ({ ...h, scanId: h.scanId ?? null, osGuess: h.osGuess ?? null, observedAt: new Date(h.observedAt) })) }),
    prisma.port.createMany({ data: b.ports.map((p) => ({ ...p, observedAt: new Date(p.observedAt) })) }),
    prisma.dnsRecord.createMany({ data: b.dns.map((d) => ({ ...d, observedAt: new Date(d.observedAt) })) }),
    prisma.endpoint.createMany({ data: b.endpoints.map((e) => ({ ...e, observedAt: new Date(e.observedAt) })) }),
    prisma.finding.createMany({ data: b.findings.map(M.findingColumns) }),
    prisma.evidence.createMany({ data: b.evidence.map(M.evidenceColumns) }),
  ]);
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
});

/** Generates a clearly-labelled SIMULATED scan server-side. No network activity. */
router.post("/scans/simulate", requirePermission("run_demo_scans"), async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(160), projectId: z.string(), targetId: z.string(), config: scanConfig }), req.body);
  const target = await authorizedTarget(b.targetId);
  if (target.projectId !== b.projectId) fail(400, "Target does not belong to this project.");
  const config: ScanConfig = { ...b.config, categories: b.config.categories.filter((c) => target.scope.allowedCategories.includes(c)) };
  if (!config.categories.length) fail(400, "None of the selected categories are permitted by the target's scope.");
  const now = new Date().toISOString();
  const project = await prisma.project.findUniqueOrThrow({ where: { id: b.projectId } });
  const scan = {
    id: newId("scn"), code: nextCode("SCN", (await prisma.scan.findMany({ select: { code: true } })).map((s) => s.code)), name: b.name, projectId: b.projectId, targetId: b.targetId,
    status: "completed" as const, progress: 100, stage: "Simulation complete", config, createdBy: me(req).id, createdAt: now, startedAt: now, completedAt: now, dataOrigin: "simulated" as const,
  };
  const out = generateSimulation(scan, target, await nextFindingIndex(), project.ownerId, now);
  await persistBundle({ scan, results: out.results, hosts: out.hosts, ports: out.ports, dns: out.dns, endpoints: out.endpoints, findings: out.findings, evidence: out.evidence });
  await log(me(req).id, "demo_scan_completed", "scan", scan.id, scan.code, `Demo simulation produced ${out.findings.length} SIMULATED finding(s) awaiting human verification`);
  await notify({ title: "Demo simulation finished", message: `${scan.code}: ${out.findings.length} simulated findings require verification.`, tone: "info", link: `/scans/${scan.id}` }, "scanEvents");
  res.status(201).json({ scan, findingCount: out.findings.length });
});

/* --------------------------------- Imports -------------------------------- */
/** Parses tool output on the server and re-enforces the target's scope. Never runs the tool. */
router.post("/imports", requirePermission("run_demo_scans"), async (req, res) => {
  const b = parse(z.object({ targetId: z.string(), format: z.enum(["nmap_xml", "zap_json"]), raw: z.string().min(1).max(MAX_IMPORT_BYTES), fileName: z.string().trim().min(1).max(200) }), req.body);
  const target = await authorizedTarget(b.targetId);
  let parsed;
  try {
    parsed = b.format === "nmap_xml" ? parseNmapXmlServer(b.raw) : parseZapJson(b.raw);
  } catch (e) {
    fail(400, (e as Error).message);
  }
  const project = await prisma.project.findUniqueOrThrow({ where: { id: target.projectId } });
  const scanId = newId("scn");
  const bundle = buildImport(parsed!, target, {
    scanId, scanCode: nextCode("SCN", (await prisma.scan.findMany({ select: { code: true } })).map((s) => s.code)), findingStartIndex: await nextFindingIndex(),
    createdBy: me(req).id, assessorId: project.ownerId, now: new Date().toISOString(), raw: b.raw, fileName: b.fileName.replace(/[^\w.\- ]/g, "_"),
  });
  if (bundle.hosts.length + bundle.findings.length + bundle.endpoints.length === 0) fail(400, `Nothing in scope to import (${bundle.skipped.length} item(s) skipped by scope).`);
  await persistBundle({ scan: bundle.scan, results: [bundle.result], hosts: bundle.hosts, ports: bundle.ports, dns: [], endpoints: bundle.endpoints, findings: bundle.findings, evidence: bundle.evidence });
  await prisma.reconRun.create({ data: { id: newId("rcn"), targetId: target.id, tool: bundle.result.tool, label: `Imported ${b.fileName} (${bundle.scan.code})`, recordsAdded: bundle.hosts.length + bundle.ports.length + bundle.endpoints.length, ranAt: new Date(), dataOrigin: "imported" } });
  await prisma.integration.update({ where: { id: bundle.result.tool }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  await log(me(req).id, "tool_output_imported", "scan", scanId, bundle.scan.code, `Imported ${b.fileName} for ${target.name}: ${bundle.findings.length} finding(s) pending verification, ${bundle.skipped.length} out-of-scope item(s) skipped`);
  await notify({ title: "Tool output imported", message: `${bundle.scan.code}: ${bundle.findings.length} finding(s) await verification.`, tone: "info", link: `/scans/${scanId}` }, "scanEvents");
  res.status(201).json({ scanId, scanCode: bundle.scan.code, findings: bundle.findings.length, skipped: bundle.skipped });
});

/* -------------------------------- Findings -------------------------------- */
router.post("/findings/manual", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({
    targetId: z.string(), title: z.string().trim().min(5).max(160), category: categoryEnum, severity: severityEnum, affectedAsset: z.string().trim().min(1).max(500),
    parameter: z.string().max(100).optional(), cwe: z.string().regex(/^(CWE-\d+)?$/).optional(), description: z.string().trim().min(10).max(8000), impact: z.string().trim().min(5).max(4000),
    remediation: z.string().trim().min(5).max(4000), evidenceTitle: z.string().trim().min(3).max(200), evidenceContent: z.string().trim().min(10).max(20000),
    checklistRef: z.object({ assessmentId: z.string(), itemId: z.string() }).optional(),
  }), req.body);
  const target = await authorizedTarget(b.targetId);
  if (!target.scope.allowedCategories.includes(b.category)) fail(400, "That category is not permitted by the target's approved scope.");
  const now = new Date();
  const id = newId("fnd");
  const code = `FND-${String(await nextFindingIndex()).padStart(4, "0")}`;
  await prisma.$transaction([
    prisma.finding.create({ data: {
      id, code, title: b.title, description: b.description, projectId: target.projectId, targetId: target.id, category: b.category, severity: b.severity, affectedAsset: b.affectedAsset,
      parameter: b.parameter || null, sourceTool: "manual", verificationStatus: "pending", assignedAssessorId: me(req).id, discoveredAt: now, updatedAt: now, impact: b.impact,
      remediation: b.remediation, cwe: b.cwe || null, owasp: CATEGORIES.find((c) => c.id === b.category)?.owasp ?? null, templateKey: "manual", dataOrigin: "user_created",
    } }),
    prisma.evidence.create({ data: { id: `ev-${id}-1`, findingId: id, type: "manual_note", title: b.evidenceTitle, content: b.evidenceContent, source: "manual", capturedAt: now, reviewed: false, dataOrigin: "user_created" } }),
  ]);
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
  const settings = (await prisma.appSetting.findUnique({ where: { id: "app" } }))?.value as { security?: { requireEvidenceReview?: boolean } } | undefined;
  if (b.decisionReason.length < 5) fail(400, "A decision reason is required.");
  if (b.toStatus !== "pending" && b.notes.trim().length < 10) fail(400, "Verification notes are required.");
  if (settings?.security?.requireEvidenceReview !== false && (b.toStatus === "confirmed" || b.toStatus === "rejected") && !b.evidenceReviewed) fail(400, "Evidence review must be attested before confirming or rejecting.");
  const now = new Date();
  await prisma.$transaction([
    prisma.verification.create({ data: { id: newId("ver"), findingId: f.id, fromStatus: f.verificationStatus, toStatus: b.toStatus, assessorId: me(req).id, notes: b.notes.trim(), decisionReason: b.decisionReason, evidenceReviewed: b.evidenceReviewed, decidedAt: now } }),
    prisma.finding.update({ where: { id: f.id }, data: { verificationStatus: b.toStatus as VerificationStatus, updatedAt: now } }),
    ...(b.evidenceReviewed ? [prisma.evidence.updateMany({ where: { findingId: f.id }, data: { reviewed: true, reviewedBy: me(req).id } })] : []),
  ]);
  await log(me(req).id, VERIFICATION_ACTIVITY[b.toStatus], "finding", f.id, f.code, `Marked "${f.title}" as ${b.toStatus.replace("_", " ")}. Reason: ${b.decisionReason}`);
  if (b.toStatus === "confirmed") {
    if (!(await prisma.risk.findUnique({ where: { findingId: f.id } }))) {
      const base = defaultRiskInputs(f.severity as Severity);
      await prisma.risk.create({ data: { id: newId("rsk"), findingId: f.id, title: f.title, ...base, ownerId: f.assignedAssessorId, mitigationStatus: "not_started", reviewDate: new Date(Date.now() + 30 * 86400_000), notes: "Demo risk rating derived from severity (likelihood × impact). Not a CVSS score.", createdAt: now, updatedAt: now } });
    }
    if (f.severity === "critical" || f.severity === "high")
      await notify({ title: `${f.severity === "critical" ? "Critical" : "High"} vulnerability confirmed`, message: `${f.code} ${f.title}`, tone: "critical", link: `/findings/${f.id}` }, "findingUpdates");
  }
  res.json({ ok: true });
});

router.post("/findings/assign", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.string()).min(1).max(500), assessorId: z.string() }), req.body);
  const user = (await prisma.user.findUnique({ where: { id: b.assessorId } })) ?? fail(404, "User not found");
  await prisma.finding.updateMany({ where: { id: { in: b.ids } }, data: { assignedAssessorId: user.id, updatedAt: new Date() } });
  await log(me(req).id, "finding_reviewed", "finding", b.ids[0], `${b.ids.length} finding(s)`, `Assigned ${b.ids.length} finding(s) to ${user.name}`);
  res.json({ ok: true });
});

router.post("/findings/:id/evidence", requirePermission("verify_findings"), async (req, res) => {
  const b = parse(z.object({ title: z.string().trim().min(3).max(200), content: z.string().trim().min(10).max(20000) }), req.body);
  const f = (await prisma.finding.findUnique({ where: { id: param(req) } })) ?? fail(404, "Finding not found");
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
    analysis.adapter === "api" ? `Generated AI analysis with ${analysis.model} (${analysis.redactionCount ?? 0} value(s) redacted before sending)` : "Generated sample analysis (demo adapter — no AI model configured)",
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
