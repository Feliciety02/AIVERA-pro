/**
 * Loads the frontend's synthetic demo dataset (src/data/seed.ts) into the
 * database. Used by `npm run db:seed` and by the admin "reset demo data" route.
 */
import * as seed from "@/data/seed";
import { prisma } from "./db.ts";
import { env } from "./env.ts";
import { hashPassword } from "./auth.ts";
import { analysisColumns, evidenceColumns, findingColumns, scopeColumns } from "./mappers.ts";

const d = (s: string) => new Date(s);

export async function seedDatabase() {
  if (!env.seedPassword || env.seedPassword.length < 10) throw new Error("Set SEED_DEMO_PASSWORD (min. 10 characters) in server/.env before seeding.");
  const passwordHash = await hashPassword(env.seedPassword);

  await prisma.$transaction([
    prisma.session.deleteMany(), prisma.projectMember.deleteMany(), prisma.checklistItem.deleteMany(), prisma.assessment.deleteMany(),
    prisma.remediationHistory.deleteMany(), prisma.remediationTask.deleteMany(), prisma.verification.deleteMany(), prisma.evidence.deleteMany(),
    prisma.risk.deleteMany(), prisma.aIAnalysis.deleteMany(), prisma.finding.deleteMany(), prisma.port.deleteMany(), prisma.host.deleteMany(),
    prisma.dnsRecord.deleteMany(), prisma.endpoint.deleteMany(), prisma.reconRun.deleteMany(), prisma.scanResult.deleteMany(), prisma.scan.deleteMany(),
    prisma.report.deleteMany(), prisma.target.deleteMany(), prisma.project.deleteMany(), prisma.activityLog.deleteMany(), prisma.notification.deleteMany(),
    prisma.integration.deleteMany(), prisma.appSetting.deleteMany(), prisma.user.deleteMany(),
  ]);

  await prisma.user.createMany({ data: seed.seedUsers.map((u) => ({ ...u, passwordHash, createdAt: d(u.createdAt), lastActiveAt: d(u.lastActiveAt) })) });
  for (const p of seed.seedProjects) {
    const { memberIds, ...rest } = p;
    await prisma.project.create({
      data: { ...rest, statusBeforeArchive: rest.statusBeforeArchive ?? null, startDate: d(p.startDate), dueDate: d(p.dueDate), createdAt: d(p.createdAt), updatedAt: d(p.updatedAt), members: { create: memberIds.map((userId) => ({ userId })) } },
    });
  }
  await prisma.target.createMany({
    data: seed.seedTargets.map(({ scope, ...t }) => ({
      ...t, ...scopeColumns(scope), authorizationConfirmedBy: t.authorizationConfirmedBy ?? null,
      authorizationConfirmedAt: t.authorizationConfirmedAt ? d(t.authorizationConfirmedAt) : null, createdAt: d(t.createdAt), updatedAt: d(t.updatedAt),
    })),
  });
  for (const a of seed.seedAssessments) {
    await prisma.assessment.create({
      data: {
        id: a.id, projectId: a.projectId, category: a.category, status: a.status, assessorId: a.assessorId, updatedAt: d(a.updatedAt),
        checklist: { create: a.checklist.map((c, i) => ({ id: c.id, position: i, title: c.title, kind: c.kind, tool: c.tool ?? null, result: c.result, observation: c.observation, evidenceNote: c.evidenceNote })) },
      },
    });
  }
  await prisma.scan.createMany({
    data: seed.seedScans.map((s) => ({ ...s, config: s.config as object, stage: s.stage ?? null, errorMessage: s.errorMessage ?? null, createdAt: d(s.createdAt), startedAt: s.startedAt ? d(s.startedAt) : null, completedAt: s.completedAt ? d(s.completedAt) : null })),
  });
  await prisma.scanResult.createMany({ data: seed.seedScanResults.map((r) => ({ ...r, recordedAt: d(r.recordedAt) })) });
  await prisma.host.createMany({ data: seed.seedHosts.map((h) => ({ ...h, scanId: h.scanId ?? null, osGuess: h.osGuess ?? null, observedAt: d(h.observedAt) })) });
  await prisma.port.createMany({ data: seed.seedPorts.map((p) => ({ ...p, observedAt: d(p.observedAt) })) });
  await prisma.dnsRecord.createMany({ data: seed.seedDns.map((r) => ({ ...r, observedAt: d(r.observedAt) })) });
  await prisma.endpoint.createMany({ data: seed.seedEndpoints.map((e) => ({ ...e, observedAt: d(e.observedAt) })) });
  await prisma.reconRun.createMany({ data: seed.seedReconRuns.map((r) => ({ ...r, ranAt: d(r.ranAt) })) });
  await prisma.finding.createMany({ data: seed.seedFindings.map(findingColumns) });
  await prisma.evidence.createMany({ data: seed.seedEvidence.map(evidenceColumns) });
  await prisma.verification.createMany({ data: seed.seedVerifications.map((v) => ({ ...v, decidedAt: d(v.decidedAt) })) });
  await prisma.aIAnalysis.createMany({ data: seed.seedAIAnalyses.map(analysisColumns) });
  await prisma.risk.createMany({ data: seed.seedRisks.map((r) => ({ ...r, reviewDate: d(r.reviewDate), createdAt: d(r.createdAt), updatedAt: d(r.updatedAt) })) });
  for (const t of seed.seedRemediation) {
    const { history, ...rest } = t;
    await prisma.remediationTask.create({
      data: {
        ...rest, approvedBy: rest.approvedBy ?? null, approvedAt: rest.approvedAt ? d(rest.approvedAt) : null, dueDate: d(rest.dueDate), createdAt: d(rest.createdAt), updatedAt: d(rest.updatedAt),
        history: { create: history.map((h) => ({ at: d(h.at), by: h.by, from: h.from ?? null, to: h.to, note: h.note })) },
      },
    });
  }
  await prisma.report.createMany({
    data: seed.seedReports.map(({ generatedFrom: _g, ...r }) => ({ ...r, periodStart: d(r.periodStart), periodEnd: d(r.periodEnd), createdAt: d(r.createdAt), updatedAt: d(r.updatedAt) })),
  });
  await prisma.activityLog.createMany({ data: seed.seedActivity.map((a) => ({ ...a, entityId: a.entityId ?? null, timestamp: d(a.timestamp) })) });
  await prisma.notification.createMany({ data: seed.seedNotifications.map((n) => ({ ...n, link: n.link ?? null, createdAt: d(n.createdAt) })) });
  await prisma.integration.createMany({ data: seed.seedIntegrations.map((i) => ({ ...i, lastUsedAt: i.lastUsedAt ? d(i.lastUsedAt) : null })) });
  await prisma.appSetting.create({ data: { id: "app", value: seed.defaultSettings as object } });
}
