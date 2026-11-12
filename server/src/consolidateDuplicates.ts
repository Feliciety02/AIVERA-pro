/** One-time cleanup for repeated findings created before scan deduplication. */
import { findingKey } from "@/features/scanLifecycle";
import { newId, prisma } from "./db.ts";

const apply = process.argv.includes("--apply");

try {
  const active = await prisma.scan.count({ where: { status: { in: ["queued", "running", "paused"] } } });
  if (active) throw new Error("Wait for active scans to finish before consolidating findings.");
  const findings = await prisma.finding.findMany({ orderBy: { discoveredAt: "asc" } });
  const groups = new Map<string, typeof findings>();
  for (const finding of findings) {
    const key = findingKey(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  let consolidated = 0;
  let skipped = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const decided = group.filter((finding) => ["confirmed", "rejected"].includes(finding.verificationStatus));
    if (decided.length > 1) { skipped += group.length - 1; continue; }
    const keeper = decided[0] ?? group[0]!;
    for (const duplicate of group.filter((finding) => finding.id !== keeper.id)) {
      if (duplicate.verificationStatus !== "pending") { skipped++; continue; }
      const [decisions, tasks, risk] = await Promise.all([
        prisma.verification.count({ where: { findingId: duplicate.id } }),
        prisma.remediationTask.count({ where: { findingId: duplicate.id } }),
        prisma.risk.count({ where: { findingId: duplicate.id } }),
      ]);
      if (decisions || tasks || risk) { skipped++; continue; }
      if (apply) {
        await prisma.$transaction(async (tx) => {
          const [existingEvidence, duplicateEvidence] = await Promise.all([
            tx.evidence.findMany({ where: { findingId: keeper.id } }),
            tx.evidence.findMany({ where: { findingId: duplicate.id } }),
          ]);
          const evidenceKeys = new Set(existingEvidence.map((item) => `${item.type}\u0000${item.title}\u0000${item.content}`));
          for (const item of duplicateEvidence) {
            const key = `${item.type}\u0000${item.title}\u0000${item.content}`;
            if (evidenceKeys.has(key)) await tx.evidence.delete({ where: { id: item.id } });
            else { await tx.evidence.update({ where: { id: item.id }, data: { findingId: keeper.id } }); evidenceKeys.add(key); }
          }
          await tx.aIAnalysis.updateMany({ where: { findingId: duplicate.id }, data: { findingId: keeper.id } });
          await tx.findingAlias.create({ data: { oldId: duplicate.id, canonicalId: keeper.id } });
          await tx.finding.delete({ where: { id: duplicate.id } });
          await tx.activityLog.create({ data: { id: newId("act"), type: "finding_reviewed", userId: "system", timestamp: new Date(), entityType: "finding", entityId: keeper.id, entityLabel: keeper.code, description: `Consolidated repeated unreviewed finding ${duplicate.code} into ${keeper.code}` } });
        });
      }
      consolidated++;
    }
  }
  const [remaining, awaitingReview] = await Promise.all([
    prisma.finding.count(),
    prisma.finding.count({ where: { verificationStatus: { in: ["pending", "needs_review"] } } }),
  ]);
  console.log(`${apply ? "Consolidated" : "Would consolidate"} ${consolidated} repeated, unreviewed finding(s); skipped ${skipped} with decisions or linked work. ${remaining} findings remain, ${awaitingReview} awaiting review.`);
} finally {
  await prisma.$disconnect();
}
