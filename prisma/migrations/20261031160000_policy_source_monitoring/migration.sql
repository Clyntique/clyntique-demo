-- Policy source monitoring (Oct 31, 2026).
-- Additive only: three new enums, three new enum values, seven nullable or
-- defaulted columns on PolicySource, and two new append-only tables
-- (PolicySourceSnapshot, PolicySourceChangeProposal). Nothing dropped,
-- renamed, updated or deleted. Existing sources keep monitoring OFF.
-- Every reference to history is ON DELETE RESTRICT. IF NOT EXISTS on the enum
-- values keeps a re-apply after a rollback working.
-- CreateEnum
CREATE TYPE "PolicySourceFetchOutcome" AS ENUM ('OK', 'REDIRECTED', 'NOT_FOUND', 'BLOCKED', 'UNREACHABLE', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PolicyChangeKind" AS ENUM ('CONTENT_CHANGED', 'REDIRECTED', 'NOT_FOUND', 'ACCESS_PROBLEM');

-- CreateEnum
CREATE TYPE "PolicyChangeProposalStatus" AS ENUM ('PENDING_REVIEW', 'NO_RULE_CHANGE', 'RULE_UPDATE_STARTED', 'DISMISSED');

-- AlterEnum


ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'SOURCE_CHANGE_DETECTED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'SOURCE_CHANGE_REVIEWED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'SOURCE_MONITORING_UPDATED';

-- AlterTable
ALTER TABLE "PolicySource" ADD COLUMN     "checkIntervalHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discontinuedAt" TIMESTAMP(3),
ADD COLUMN     "discontinuedNote" TEXT,
ADD COLUMN     "lastCheckOutcome" "PolicySourceFetchOutcome",
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PolicySourceSnapshot" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "outcome" "PolicySourceFetchOutcome" NOT NULL,
    "httpStatus" INTEGER,
    "contentType" TEXT,
    "byteLength" INTEGER,
    "contentHash" TEXT,
    "normalizedText" TEXT,
    "statedDate" TIMESTAMP(3),
    "errorMessage" TEXT,
    "triggeredById" TEXT,

    CONSTRAINT "PolicySourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicySourceChangeProposal" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" "PolicyChangeKind" NOT NULL,
    "status" "PolicyChangeProposalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "previousSnapshotId" TEXT,
    "newSnapshotId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "diff" JSONB,
    "affectedRuleCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "resultingVersionId" TEXT,

    CONSTRAINT "PolicySourceChangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicySourceSnapshot_sourceId_fetchedAt_idx" ON "PolicySourceSnapshot"("sourceId", "fetchedAt");

-- CreateIndex
CREATE INDEX "PolicySourceChangeProposal_status_createdAt_idx" ON "PolicySourceChangeProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PolicySourceChangeProposal_sourceId_createdAt_idx" ON "PolicySourceChangeProposal"("sourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "PolicySourceSnapshot" ADD CONSTRAINT "PolicySourceSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PolicySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySourceSnapshot" ADD CONSTRAINT "PolicySourceSnapshot_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySourceChangeProposal" ADD CONSTRAINT "PolicySourceChangeProposal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PolicySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySourceChangeProposal" ADD CONSTRAINT "PolicySourceChangeProposal_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "PolicySourceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySourceChangeProposal" ADD CONSTRAINT "PolicySourceChangeProposal_newSnapshotId_fkey" FOREIGN KEY ("newSnapshotId") REFERENCES "PolicySourceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySourceChangeProposal" ADD CONSTRAINT "PolicySourceChangeProposal_detectedById_fkey" FOREIGN KEY ("detectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySourceChangeProposal" ADD CONSTRAINT "PolicySourceChangeProposal_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySourceChangeProposal" ADD CONSTRAINT "PolicySourceChangeProposal_resultingVersionId_fkey" FOREIGN KEY ("resultingVersionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

