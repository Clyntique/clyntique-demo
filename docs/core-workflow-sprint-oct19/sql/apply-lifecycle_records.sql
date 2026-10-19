-- APPLY script for migration 20261019190000_lifecycle_records on an EXISTING database.
-- Body = prisma/migrations/20261019190000_lifecycle_records/migration.sql, unchanged
-- (tests/shared-db-apply-scripts.test.ts fails if the two ever differ).
--
-- Why not "prisma migrate deploy" on the shared database: migrate deploy does
-- not wrap a migration in a transaction (verified locally on Oct 19: a failing
-- migration left its first table behind). "prisma db execute --file" sends the
-- whole file as ONE command, so PostgreSQL runs it as one transaction: it
-- either completes or changes nothing. lock_timeout makes it fail fast instead
-- of queueing behind a long-running transaction; statement_timeout bounds it.
--
-- Run (after the read-only preflight, the export and the target check):
--   npx prisma db execute --file docs/core-workflow-sprint-oct19/sql/apply-lifecycle_records.sql
--   npx prisma migrate resolve --applied 20261019190000_lifecycle_records
--   npx prisma migrate status
SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- Oct 19 sprint: lifecycle records (AI scan history, external submissions and
-- outcomes, policy rule events, re-review reason on ReviewCycle).
-- Additive only: new enums and tables, two nullable columns on ReviewCycle.
-- Nothing dropped, renamed, modified, updated or deleted.

-- CreateEnum
CREATE TYPE "ReviewCycleReason" AS ENUM ('POLICY_CHANGE', 'EXTERNAL_OUTCOME', 'CLIENT_UPDATE', 'EVIDENCE_EXPIRED', 'TEAM_REQUEST');

-- CreateEnum
CREATE TYPE "AIScanStatus" AS ENUM ('SUCCESS', 'INSUFFICIENT_COVERAGE', 'RATE_LIMITED', 'ERROR');

-- CreateEnum
CREATE TYPE "ExternalDestinationType" AS ENUM ('AD_PLATFORM', 'REGULATOR');

-- CreateEnum
CREATE TYPE "ExternalRecordBasis" AS ENUM ('CLIENT_REPORTED', 'TEAM_VERIFIED');

-- CreateEnum
CREATE TYPE "ExternalOutcomeKind" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PolicyRuleEventKind" AS ENUM ('RULE_CREATED', 'VERSION_PROPOSED', 'VERSION_APPROVED', 'RULE_RETIRED');

-- AlterTable
ALTER TABLE "ReviewCycle" ADD COLUMN     "reasonKind" "ReviewCycleReason",
ADD COLUMN     "triggerRuleVersionId" TEXT;

-- CreateTable
CREATE TABLE "AIScanRun" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "cycleId" TEXT,
    "roundId" TEXT,
    "initiatedById" TEXT NOT NULL,
    "status" "AIScanStatus" NOT NULL,
    "modelUsed" TEXT,
    "promptVersion" TEXT,
    "summary" TEXT NOT NULL,
    "errorName" TEXT,
    "extractedVisualText" JSONB NOT NULL DEFAULT '[]',
    "detectedClaims" JSONB NOT NULL DEFAULT '[]',
    "suggestedFindings" JSONB NOT NULL DEFAULT '[]',
    "discardedSuggestions" INTEGER NOT NULL DEFAULT 0,
    "executionTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIScanRuleCheck" (
    "scanId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "ruleVersionNumber" INTEGER NOT NULL,

    CONSTRAINT "AIScanRuleCheck_pkey" PRIMARY KEY ("scanId","ruleVersionId")
);

-- CreateTable
CREATE TABLE "ExternalSubmission" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "cycleId" TEXT,
    "destinationType" "ExternalDestinationType" NOT NULL,
    "destinationName" TEXT NOT NULL,
    "platformCode" TEXT,
    "marketCode" TEXT,
    "submittedOn" TIMESTAMP(3) NOT NULL,
    "externalReference" TEXT,
    "note" TEXT,
    "basis" "ExternalRecordBasis" NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOutcome" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kind" "ExternalOutcomeKind" NOT NULL,
    "outcomeOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "evidenceId" TEXT,
    "basis" "ExternalRecordBasis" NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyRuleEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "versionId" TEXT,
    "kind" "PolicyRuleEventKind" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyRuleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIScanRun_creativeId_createdAt_idx" ON "AIScanRun"("creativeId", "createdAt");

-- CreateIndex
CREATE INDEX "AIScanRun_versionId_idx" ON "AIScanRun"("versionId");

-- CreateIndex
CREATE INDEX "AIScanRuleCheck_ruleVersionId_idx" ON "AIScanRuleCheck"("ruleVersionId");

-- CreateIndex
CREATE INDEX "ExternalSubmission_creativeId_createdAt_idx" ON "ExternalSubmission"("creativeId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalSubmission_versionId_idx" ON "ExternalSubmission"("versionId");

-- CreateIndex
CREATE INDEX "ExternalOutcome_submissionId_createdAt_idx" ON "ExternalOutcome"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyRuleEvent_ruleId_createdAt_idx" ON "PolicyRuleEvent"("ruleId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_triggerRuleVersionId_fkey" FOREIGN KEY ("triggerRuleVersionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScanRun" ADD CONSTRAINT "AIScanRun_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScanRun" ADD CONSTRAINT "AIScanRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScanRun" ADD CONSTRAINT "AIScanRun_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScanRun" ADD CONSTRAINT "AIScanRun_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SubmissionRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScanRun" ADD CONSTRAINT "AIScanRun_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScanRuleCheck" ADD CONSTRAINT "AIScanRuleCheck_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "AIScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIScanRuleCheck" ADD CONSTRAINT "AIScanRuleCheck_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubmission" ADD CONSTRAINT "ExternalSubmission_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubmission" ADD CONSTRAINT "ExternalSubmission_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubmission" ADD CONSTRAINT "ExternalSubmission_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubmission" ADD CONSTRAINT "ExternalSubmission_platformCode_fkey" FOREIGN KEY ("platformCode") REFERENCES "AdPlatform"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubmission" ADD CONSTRAINT "ExternalSubmission_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSubmission" ADD CONSTRAINT "ExternalSubmission_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOutcome" ADD CONSTRAINT "ExternalOutcome_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ExternalSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOutcome" ADD CONSTRAINT "ExternalOutcome_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOutcome" ADD CONSTRAINT "ExternalOutcome_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRuleEvent" ADD CONSTRAINT "PolicyRuleEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PolicyRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRuleEvent" ADD CONSTRAINT "PolicyRuleEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRuleEvent" ADD CONSTRAINT "PolicyRuleEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

