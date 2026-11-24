ALTER TABLE "Finding" ADD COLUMN "possiblyFixedAt" DATETIME;
ALTER TABLE "Finding" ADD COLUMN "possiblyFixedScanId" TEXT;
ALTER TABLE "RemediationTask" ADD COLUMN "autoRetestStatus" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "RemediationTask" ADD COLUMN "autoRetestSuggestion" TEXT;
ALTER TABLE "RemediationTask" ADD COLUMN "autoRetestEvidenceId" TEXT;
ALTER TABLE "RemediationTask" ADD COLUMN "autoRetestNote" TEXT;
ALTER TABLE "RemediationTask" ADD COLUMN "autoRetestCheckedAt" DATETIME;
