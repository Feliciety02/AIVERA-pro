-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "firstAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LoginAttempt_firstAt_idx" ON "LoginAttempt"("firstAt");
