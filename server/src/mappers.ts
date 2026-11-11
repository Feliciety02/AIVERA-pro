/**
 * Row ⇄ DTO mapping. DTOs are exactly the frontend domain types in src/types,
 * so the browser and the API share one model.
 */
import type * as P from "../prisma/generated/prisma/client.ts";
import type * as T from "@/types";
import { iso } from "./db.ts";

const arr = <X>(v: unknown): X[] => (Array.isArray(v) ? (v as X[]) : []);
const req = (d: Date) => d.toISOString();

export const toUser = (u: P.User): T.User => ({
  id: u.id, name: u.name, email: u.email, role: u.role as T.UserRole, title: u.title, status: u.status as T.AccountStatus,
  assignedProjectIds: arr(u.assignedProjectIds), createdAt: req(u.createdAt), lastActiveAt: req(u.lastActiveAt),
});

export const toProject = (p: P.Project & { members: P.ProjectMember[] }): T.Project => ({
  id: p.id, code: p.code, name: p.name, description: p.description, assessmentType: p.assessmentType as T.AssessmentType,
  ownerId: p.ownerId, memberIds: p.members.map((m) => m.userId), status: p.status as T.ProjectStatus,
  statusBeforeArchive: (p.statusBeforeArchive ?? undefined) as T.ProjectStatus | undefined,
  startDate: req(p.startDate), dueDate: req(p.dueDate), objectives: p.objectives, notes: p.notes,
  createdAt: req(p.createdAt), updatedAt: req(p.updatedAt), dataOrigin: p.dataOrigin as T.DataOrigin,
});

export const toTarget = (t: P.Target): T.Target => ({
  id: t.id, projectId: t.projectId ?? undefined, name: t.name, url: t.url, description: t.description, assetType: t.assetType as T.AssetType,
  environment: t.environment as T.TargetEnvironment, owner: t.owner, authorizationStatus: t.authorizationStatus as T.AuthorizationStatus,
  authorizationReference: t.authorizationReference, authorizationConfirmed: t.authorizationConfirmed,
  authorizationConfirmedBy: t.authorizationConfirmedBy ?? undefined, authorizationConfirmedAt: iso(t.authorizationConfirmedAt),
  scope: {
    inScopeHosts: arr(t.inScopeHosts), allowedPaths: arr(t.allowedPaths), excludedPaths: arr(t.excludedPaths),
    allowedCategories: arr(t.allowedCategories), allowedActivities: arr(t.allowedActivities), restrictedActivities: arr(t.restrictedActivities),
  },
  testingNotes: t.testingNotes, createdAt: req(t.createdAt), updatedAt: req(t.updatedAt), dataOrigin: t.dataOrigin as T.DataOrigin,
});

export const scopeColumns = (s: T.TargetScope) => ({
  inScopeHosts: s.inScopeHosts, allowedPaths: s.allowedPaths, excludedPaths: s.excludedPaths,
  allowedCategories: s.allowedCategories, allowedActivities: s.allowedActivities, restrictedActivities: s.restrictedActivities,
});

export const toAssessment = (a: P.Assessment & { checklist: P.ChecklistItem[] }): T.Assessment => ({
  id: a.id, projectId: a.projectId, category: a.category as T.AssessmentCategoryId, status: a.status as T.AssessmentStatus,
  assessorId: a.assessorId, updatedAt: req(a.updatedAt),
  checklist: [...a.checklist].sort((x, y) => x.position - y.position).map((c) => ({
    id: c.id, title: c.title, kind: c.kind as T.ChecklistItem["kind"], tool: (c.tool ?? undefined) as T.ScanTool | undefined,
    result: c.result as T.ChecklistResult, observation: c.observation, evidenceNote: c.evidenceNote, updatedAt: iso(c.updatedAt), updatedBy: c.updatedBy ?? undefined,
  })),
});

export const toScan = (s: P.Scan): T.Scan => ({
  id: s.id, code: s.code, name: s.name, projectId: s.projectId, targetId: s.targetId, status: s.status as T.ScanStatus, progress: s.progress,
  stage: s.stage ?? undefined, config: s.config as unknown as T.ScanConfig, createdBy: s.createdBy, createdAt: req(s.createdAt),
  startedAt: iso(s.startedAt), completedAt: iso(s.completedAt), errorMessage: s.errorMessage ?? undefined, dataOrigin: s.dataOrigin as T.Scan["dataOrigin"],
});

export const toScanResult = (r: P.ScanResult): T.ScanResult => ({
  id: r.id, scanId: r.scanId, tool: r.tool as T.ScanTool, summary: r.summary, itemsFound: r.itemsFound, rawOutput: r.rawOutput, recordedAt: req(r.recordedAt), dataOrigin: r.dataOrigin as T.DataOrigin,
});

export const toHost = (h: P.Host): T.Host => ({
  id: h.id, targetId: h.targetId, scanId: h.scanId ?? undefined, hostname: h.hostname, ipAddress: h.ipAddress, state: h.state as T.Host["state"],
  osGuess: h.osGuess ?? undefined, source: h.source as T.ScanTool, observedAt: req(h.observedAt), dataOrigin: h.dataOrigin as T.DataOrigin,
});

export const toPort = (p: P.Port): T.Port => ({
  id: p.id, hostId: p.hostId, port: p.port, protocol: p.protocol as T.Port["protocol"], state: p.state as T.Port["state"], service: p.service,
  version: p.version, source: p.source as T.ScanTool, observedAt: req(p.observedAt), dataOrigin: p.dataOrigin as T.DataOrigin,
});

export const toDns = (d: P.DnsRecord): T.DnsRecord => ({
  id: d.id, targetId: d.targetId, name: d.name, type: d.type as T.DnsRecord["type"], value: d.value, ttl: d.ttl, source: d.source as T.ScanTool,
  observedAt: req(d.observedAt), dataOrigin: d.dataOrigin as T.DataOrigin,
});

export const toEndpoint = (e: P.Endpoint): T.Endpoint => ({
  id: e.id, targetId: e.targetId, method: e.method as T.Endpoint["method"], path: e.path, statusCode: e.statusCode, contentType: e.contentType,
  authRequired: e.authRequired, source: e.source as T.ScanTool, observedAt: req(e.observedAt), dataOrigin: e.dataOrigin as T.DataOrigin,
});

export const toReconRun = (r: P.ReconRun): T.ReconRun => ({
  id: r.id, targetId: r.targetId, tool: r.tool as T.ScanTool, label: r.label, recordsAdded: r.recordsAdded, ranAt: req(r.ranAt), dataOrigin: r.dataOrigin as T.DataOrigin,
});

export const toFinding = (f: P.Finding): T.VulnerabilityFinding => ({
  id: f.id, code: f.code, title: f.title, description: f.description, projectId: f.projectId, targetId: f.targetId, scanId: f.scanId ?? undefined,
  category: f.category as T.AssessmentCategoryId, severity: f.severity as T.Severity, affectedAsset: f.affectedAsset, parameter: f.parameter ?? undefined,
  sourceTool: f.sourceTool as T.FindingSource, verificationStatus: f.verificationStatus as T.VerificationStatus, assignedAssessorId: f.assignedAssessorId,
  discoveredAt: req(f.discoveredAt), updatedAt: req(f.updatedAt), impact: f.impact, remediation: f.remediation, cwe: f.cwe ?? undefined,
  owasp: f.owasp ?? undefined, templateKey: f.templateKey, dataOrigin: f.dataOrigin as T.DataOrigin,
});

export const findingColumns = (f: T.VulnerabilityFinding) => ({
  ...f, discoveredAt: new Date(f.discoveredAt), updatedAt: new Date(f.updatedAt), scanId: f.scanId ?? null, parameter: f.parameter ?? null, cwe: f.cwe ?? null, owasp: f.owasp ?? null,
});

export const toEvidence = (e: P.Evidence): T.Evidence => ({
  id: e.id, findingId: e.findingId, type: e.type as T.EvidenceType, title: e.title, content: e.content, source: e.source as T.FindingSource,
  capturedAt: req(e.capturedAt), reviewed: e.reviewed, reviewedBy: e.reviewedBy ?? undefined, dataOrigin: e.dataOrigin as T.DataOrigin,
});

export const evidenceColumns = (e: T.Evidence) => ({ ...e, capturedAt: new Date(e.capturedAt), reviewedBy: e.reviewedBy ?? null });

export const toVerification = (v: P.Verification): T.Verification => ({
  id: v.id, findingId: v.findingId, fromStatus: v.fromStatus as T.VerificationStatus, toStatus: v.toStatus as T.VerificationStatus, assessorId: v.assessorId,
  notes: v.notes, decisionReason: v.decisionReason, evidenceReviewed: v.evidenceReviewed, decidedAt: req(v.decidedAt),
});

export const toAnalysis = (a: P.AIAnalysis): T.AIAnalysis => ({
  id: a.id, mode: a.mode as T.AIMode, projectId: a.projectId, targetId: a.targetId ?? undefined, scanId: a.scanId ?? undefined, findingId: a.findingId ?? undefined,
  title: a.title, interpretation: a.interpretation, explanation: a.explanation, suggestedSeverity: (a.suggestedSeverity ?? undefined) as T.Severity | undefined,
  potentialImpact: a.potentialImpact, recommendations: arr(a.recommendations), verificationSteps: arr(a.verificationSteps), reasoning: arr(a.reasoning),
  evidenceRefs: arr(a.evidenceRefs), confidenceCaveat: a.confidenceCaveat, status: a.status as T.AIAnalysisStatus, generatedAt: req(a.generatedAt),
  generatedBy: a.generatedBy, adapter: a.adapter as T.AIAnalysis["adapter"],
  model: a.model ?? undefined, sentContext: a.sentContext ?? undefined, redactionCount: a.redactionCount ?? undefined,
});

export const analysisColumns = (a: T.AIAnalysis) => ({
  ...a, generatedAt: new Date(a.generatedAt), targetId: a.targetId ?? null, scanId: a.scanId ?? null, findingId: a.findingId ?? null, suggestedSeverity: a.suggestedSeverity ?? null,
  model: a.model ?? null, sentContext: a.sentContext ?? null, redactionCount: a.redactionCount ?? null,
});

export const toRisk = (r: P.Risk): T.Risk => ({
  id: r.id, findingId: r.findingId, title: r.title, likelihood: r.likelihood as T.LikertScore, impact: r.impact as T.LikertScore, ownerId: r.ownerId,
  mitigationStatus: r.mitigationStatus as T.MitigationStatus, reviewDate: req(r.reviewDate), notes: r.notes, createdAt: req(r.createdAt), updatedAt: req(r.updatedAt),
});

export const toTask = (t: P.RemediationTask & { history: P.RemediationHistory[] }): T.RemediationTask => ({
  id: t.id, code: t.code, findingId: t.findingId, title: t.title, description: t.description, recommendation: t.recommendation, ownerId: t.ownerId,
  priority: t.priority as T.Severity, status: t.status as T.RemediationStatus, dueDate: req(t.dueDate), retestRequired: t.retestRequired,
  retestResult: t.retestResult as T.RetestResult, approvedBy: t.approvedBy ?? undefined, approvedAt: iso(t.approvedAt), createdAt: req(t.createdAt), updatedAt: req(t.updatedAt),
  history: [...t.history].sort((a, b) => a.id - b.id).map((h) => ({ at: req(h.at), by: h.by, from: (h.from ?? undefined) as T.RemediationStatus | undefined, to: h.to as T.RemediationStatus, note: h.note })),
});

export const toReport = (r: P.Report): T.Report => ({
  id: r.id, code: r.code, title: r.title, projectId: r.projectId, targetIds: arr(r.targetIds), templateId: r.templateId, periodStart: req(r.periodStart),
  periodEnd: req(r.periodEnd), findingIds: arr(r.findingIds), includeUnverified: r.includeUnverified, sections: arr(r.sections), executiveSummary: r.executiveSummary,
  status: r.status as T.ReportStatus, createdBy: r.createdBy, createdAt: req(r.createdAt), updatedAt: req(r.updatedAt), generatedFrom: "database_records",
});

export const toActivity = (a: P.ActivityLog): T.ActivityLog => ({
  id: a.id, type: a.type as T.ActivityType, userId: a.userId, timestamp: req(a.timestamp), entityType: a.entityType as T.EntityType,
  entityId: a.entityId ?? undefined, entityLabel: a.entityLabel, description: a.description,
});

export const toNotification = (n: P.Notification): T.Notification => ({
  id: n.id, title: n.title, message: n.message, tone: n.tone as T.Notification["tone"], createdAt: req(n.createdAt), read: n.read, link: n.link ?? undefined,
});

export const toIntegration = (i: P.Integration): T.Integration => ({
  id: i.id as T.Integration["id"], name: i.name, purpose: i.purpose, integrationType: i.integrationType, status: i.status as T.IntegrationStatus,
  lastUsedAt: iso(i.lastUsedAt), features: arr(i.features), setupSteps: arr(i.setupSteps), futureEndpoint: i.futureEndpoint,
});
