-- Clyntique M1A: submission-review workflow (ADDITIVE ONLY).
--
-- Prepared offline from prisma/schema.prisma with `prisma migrate diff
-- --from-schema <pre-M1A schema> --to-schema prisma/schema.prisma`, then
-- hand-edited in two places, both marked below:
--   1. Creative.workflow: added with DEFAULT 'LEGACY_CLIENT_APPROVAL' so all
--      existing rows are labelled legacy, then the default is switched to
--      'SUBMISSION_REVIEW' for new rows. (The generated SQL would have marked
--      existing rows SUBMISSION_REVIEW.)
--   2. Reference rows for markets (US, CA, AE) and advertising platforms.
--      These are review context only; they imply no rule coverage or approval.
--
-- No table, column, enum value, index or row is dropped, renamed or rewritten.
-- Existing columns are untouched apart from new nullable columns / defaults.
-- Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction; the
-- new enum values are not used within this migration).
--
-- DO NOT apply without operator approval (docs/audit/m1a-report.md).

-- CreateEnum
CREATE TYPE "CreativeWorkflow" AS ENUM ('LEGACY_CLIENT_APPROVAL', 'SUBMISSION_REVIEW');

-- CreateEnum
CREATE TYPE "EvidenceOrigin" AS ENUM ('CLIENT_SUBMITTED', 'REVIEWER_ADDED');

-- CreateEnum
CREATE TYPE "EvidenceVisibility" AS ENUM ('SHARED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ReviewDecisionKind" AS ENUM ('CHANGES_REQUESTED', 'FINAL');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('NO_ISSUES_IDENTIFIED', 'ISSUES_RESOLVED', 'COMPLETED_WITH_OPEN_ISSUES', 'NOT_REVIEWABLE');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DRAFT', 'OPEN', 'RESPONDED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'ADVISORY');

-- CreateEnum
CREATE TYPE "FindingAction" AS ENUM ('REVISE_CONTENT', 'PROVIDE_EVIDENCE', 'CLARIFY', 'ACKNOWLEDGE');

-- CreateEnum
CREATE TYPE "MarketKind" AS ENUM ('COUNTRY', 'SUBDIVISION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CreativeStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "CreativeStatus" ADD VALUE 'REVIEW_COMPLETE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'SUBMISSION_SUBMITTED';
ALTER TYPE "ActivityType" ADD VALUE 'EVIDENCE_SUBMITTED';
ALTER TYPE "ActivityType" ADD VALUE 'REVIEW_STARTED';
ALTER TYPE "ActivityType" ADD VALUE 'FINDING_RECORDED';
ALTER TYPE "ActivityType" ADD VALUE 'RESUBMITTED';
ALTER TYPE "ActivityType" ADD VALUE 'REVIEW_COMPLETED';

-- AlterTable
ALTER TABLE "Creative" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
-- Hand-edited (see header): every EXISTING creative is LEGACY_CLIENT_APPROVAL ...
ADD COLUMN     "workflow" "CreativeWorkflow" NOT NULL DEFAULT 'LEGACY_CLIENT_APPROVAL';

-- ... and every NEW creative defaults to SUBMISSION_REVIEW from here on.
ALTER TABLE "Creative" ALTER COLUMN "workflow" SET DEFAULT 'SUBMISSION_REVIEW';

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "origin" "EvidenceOrigin",
ADD COLUMN     "versionId" TEXT,
ADD COLUMN     "visibility" "EvidenceVisibility" NOT NULL DEFAULT 'SHARED',
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnById" TEXT;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "creativeId" TEXT;

-- CreateTable
CREATE TABLE "ReviewCycle" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "openedById" TEXT NOT NULL,
    "openedReason" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionRound" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "versionId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "SubmissionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "kind" "ReviewDecisionKind" NOT NULL,
    "outcome" "ReviewOutcome",
    "summary" TEXT NOT NULL,
    "scopeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "versionId" TEXT,
    "createdById" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "requiredAction" "FindingAction" NOT NULL,
    "actionDetails" TEXT NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "resolvedInVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingEvent" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "fromStatus" "FindingStatus",
    "toStatus" "FindingStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingResponse" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "versionId" TEXT,
    "roundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingEvidence" (
    "findingId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "linkedById" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingEvidence_pkey" PRIMARY KEY ("findingId","evidenceId")
);

-- CreateTable
CREATE TABLE "Market" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MarketKind" NOT NULL DEFAULT 'COUNTRY',
    "parentCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "AdPlatform" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdPlatform_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "SubmissionMarket" (
    "creativeId" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,

    CONSTRAINT "SubmissionMarket_pkey" PRIMARY KEY ("creativeId","marketCode")
);

-- CreateTable
CREATE TABLE "SubmissionPlatform" (
    "creativeId" TEXT NOT NULL,
    "platformCode" TEXT NOT NULL,

    CONSTRAINT "SubmissionPlatform_pkey" PRIMARY KEY ("creativeId","platformCode")
);

-- CreateTable
CREATE TABLE "FindingMarket" (
    "findingId" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,

    CONSTRAINT "FindingMarket_pkey" PRIMARY KEY ("findingId","marketCode")
);

-- CreateTable
CREATE TABLE "FindingPlatform" (
    "findingId" TEXT NOT NULL,
    "platformCode" TEXT NOT NULL,

    CONSTRAINT "FindingPlatform_pkey" PRIMARY KEY ("findingId","platformCode")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCycle_creativeId_number_key" ON "ReviewCycle"("creativeId", "number");

-- CreateIndex
CREATE INDEX "SubmissionRound_creativeId_idx" ON "SubmissionRound"("creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionRound_cycleId_number_key" ON "SubmissionRound"("cycleId", "number");

-- CreateIndex
CREATE INDEX "ReviewDecision_creativeId_idx" ON "ReviewDecision"("creativeId");

-- CreateIndex
CREATE INDEX "ReviewDecision_versionId_idx" ON "ReviewDecision"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDecision_roundId_key" ON "ReviewDecision"("roundId");

-- CreateIndex
CREATE INDEX "Finding_creativeId_idx" ON "Finding"("creativeId");

-- CreateIndex
CREATE INDEX "Finding_cycleId_idx" ON "Finding"("cycleId");

-- CreateIndex
CREATE INDEX "FindingEvent_findingId_idx" ON "FindingEvent"("findingId");

-- CreateIndex
CREATE INDEX "FindingResponse_findingId_idx" ON "FindingResponse"("findingId");

-- CreateIndex
CREATE INDEX "FindingEvidence_evidenceId_idx" ON "FindingEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "SubmissionMarket_marketCode_idx" ON "SubmissionMarket"("marketCode");

-- CreateIndex
CREATE INDEX "SubmissionPlatform_platformCode_idx" ON "SubmissionPlatform"("platformCode");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");

-- CreateIndex
CREATE INDEX "Creative_createdById_idx" ON "Creative"("createdById");

-- CreateIndex
CREATE INDEX "Activity_creativeId_createdAt_idx" ON "Activity"("creativeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRound" ADD CONSTRAINT "SubmissionRound_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRound" ADD CONSTRAINT "SubmissionRound_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRound" ADD CONSTRAINT "SubmissionRound_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionRound" ADD CONSTRAINT "SubmissionRound_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SubmissionRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_resolvedInVersionId_fkey" FOREIGN KEY ("resolvedInVersionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvent" ADD CONSTRAINT "FindingEvent_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvent" ADD CONSTRAINT "FindingEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingResponse" ADD CONSTRAINT "FindingResponse_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingResponse" ADD CONSTRAINT "FindingResponse_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingResponse" ADD CONSTRAINT "FindingResponse_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingResponse" ADD CONSTRAINT "FindingResponse_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SubmissionRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionMarket" ADD CONSTRAINT "SubmissionMarket_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionMarket" ADD CONSTRAINT "SubmissionMarket_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionPlatform" ADD CONSTRAINT "SubmissionPlatform_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionPlatform" ADD CONSTRAINT "SubmissionPlatform_platformCode_fkey" FOREIGN KEY ("platformCode") REFERENCES "AdPlatform"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingMarket" ADD CONSTRAINT "FindingMarket_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingMarket" ADD CONSTRAINT "FindingMarket_marketCode_fkey" FOREIGN KEY ("marketCode") REFERENCES "Market"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingPlatform" ADD CONSTRAINT "FindingPlatform_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingPlatform" ADD CONSTRAINT "FindingPlatform_platformCode_fkey" FOREIGN KEY ("platformCode") REFERENCES "AdPlatform"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-edited (2): reference data. Review context only.
INSERT INTO "Market" ("code", "name", "kind", "parentCode", "active", "sortOrder") VALUES
  ('US', 'United States', 'COUNTRY', NULL, true, 10),
  ('CA', 'Canada', 'COUNTRY', NULL, true, 20),
  ('AE', 'United Arab Emirates', 'COUNTRY', NULL, true, 30)
ON CONFLICT ("code") DO NOTHING;

-- Platform list pending product confirmation (plan §16.1). Codes are stable;
-- names can be edited and rows deactivated without a schema change.
INSERT INTO "AdPlatform" ("code", "name", "active", "sortOrder") VALUES
  ('META', 'Meta (Facebook / Instagram)', true, 10),
  ('TIKTOK', 'TikTok', true, 20),
  ('GOOGLE', 'Google / YouTube', true, 30),
  ('SNAPCHAT', 'Snapchat', true, 40),
  ('LINKEDIN', 'LinkedIn', true, 50),
  ('X', 'X', true, 60),
  ('OTHER', 'Other', true, 1000)
ON CONFLICT ("code") DO NOTHING;
