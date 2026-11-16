-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedProjectIds" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "userAgent" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "leadId" TEXT,
    "remediationOwnerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusBeforeArchive" TEXT,
    "startDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "objectives" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    PRIMARY KEY ("projectId", "userId"),
    CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Target" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "authorizationStatus" TEXT NOT NULL,
    "authorizationReference" TEXT NOT NULL,
    "authorizationConfirmed" BOOLEAN NOT NULL,
    "authorizationConfirmedBy" TEXT,
    "authorizationConfirmedAt" DATETIME,
    "inScopeHosts" JSONB NOT NULL,
    "allowedPaths" JSONB NOT NULL,
    "excludedPaths" JSONB NOT NULL,
    "allowedCategories" JSONB NOT NULL,
    "allowedActivities" JSONB NOT NULL,
    "restrictedActivities" JSONB NOT NULL,
    "testingNotes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL,
    CONSTRAINT "Target_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assessment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tool" TEXT,
    "result" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "evidenceNote" TEXT NOT NULL,
    "updatedAt" DATETIME,
    "updatedBy" TEXT,
    CONSTRAINT "ChecklistItem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "stage" TEXT,
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ScanResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "itemsFound" INTEGER NOT NULL,
    "rawOutput" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Host" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "scanId" TEXT,
    "hostname" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "osGuess" TEXT,
    "source" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Port" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostId" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DnsRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "ttl" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Endpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "authRequired" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ReconRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "recordsAdded" INTEGER NOT NULL,
    "ranAt" DATETIME NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "signoffStatus" TEXT NOT NULL DEFAULT 'not_required',
    "signoffBy" TEXT,
    "signoffAt" DATETIME,
    "signoffNote" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scanId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "affectedAsset" TEXT NOT NULL,
    "parameter" TEXT,
    "sourceTool" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "assignedAssessorId" TEXT NOT NULL,
    "discoveredAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "impact" TEXT NOT NULL,
    "remediation" TEXT NOT NULL,
    "cwe" TEXT,
    "owasp" TEXT,
    "templateKey" TEXT NOT NULL,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FindingAlias" (
    "oldId" TEXT NOT NULL PRIMARY KEY,
    "canonicalId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "reviewed" BOOLEAN NOT NULL,
    "reviewedBy" TEXT,
    "dataOrigin" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "evidenceReviewed" BOOLEAN NOT NULL,
    "decidedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetId" TEXT,
    "scanId" TEXT,
    "findingId" TEXT,
    "title" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "suggestedSeverity" TEXT,
    "potentialImpact" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "verificationSteps" JSONB NOT NULL,
    "reasoning" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "confidenceCaveat" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "model" TEXT,
    "sentContext" TEXT,
    "redactionCount" INTEGER
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mitigationStatus" TEXT NOT NULL,
    "reviewDate" DATETIME NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RemediationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "retestAssigneeId" TEXT,
    "findingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "retestRequired" BOOLEAN NOT NULL,
    "retestResult" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RemediationHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "by" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    CONSTRAINT "RemediationHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RemediationTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "reviewNote" TEXT,
    "title" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetIds" JSONB NOT NULL,
    "templateId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "findingIds" JSONB NOT NULL,
    "includeUnverified" BOOLEAN NOT NULL,
    "sections" JSONB NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "seq" INTEGER,
    "prevHash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "read" BOOLEAN NOT NULL,
    "link" TEXT
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "integrationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "features" JSONB NOT NULL,
    "setupSteps" JSONB NOT NULL,
    "futureEndpoint" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "ScanCredential" (
    "targetId" TEXT NOT NULL PRIMARY KEY,
    "headerName" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_projectId_category_key" ON "Assessment"("projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Scan_code_key" ON "Scan"("code");

-- CreateIndex
CREATE INDEX "ScanResult_scanId_idx" ON "ScanResult"("scanId");

-- CreateIndex
CREATE INDEX "Port_hostId_idx" ON "Port"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_code_key" ON "Finding"("code");

-- CreateIndex
CREATE INDEX "Finding_projectId_idx" ON "Finding"("projectId");

-- CreateIndex
CREATE INDEX "Finding_targetId_idx" ON "Finding"("targetId");

-- CreateIndex
CREATE INDEX "Evidence_findingId_idx" ON "Evidence"("findingId");

-- CreateIndex
CREATE INDEX "Verification_findingId_idx" ON "Verification"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_findingId_key" ON "Risk"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "RemediationTask_code_key" ON "RemediationTask"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Report_code_key" ON "Report"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityLog_seq_key" ON "ActivityLog"("seq");

-- CreateIndex
CREATE INDEX "ActivityLog_timestamp_idx" ON "ActivityLog"("timestamp");
