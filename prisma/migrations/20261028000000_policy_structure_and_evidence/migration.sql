-- P0 (Oct 27): structured policy database and two-sided evidence.
-- Additive only: new enums and enum values, nullable (or defaulted) columns,
-- one new append-only table (EvidenceAssessment), one CHECK constraint.
-- Nothing dropped, renamed, updated or deleted. Existing rows keep their
-- values; the new columns are null, empty or REVIEWER.
-- New enum values are only added here, never used, so a single transaction
-- is fine on PostgreSQL 12+. IF NOT EXISTS keeps a re-apply after the
-- rollback working (PostgreSQL cannot drop enum values, so they stay).
-- CreateEnum
CREATE TYPE "FindingOrigin" AS ENUM ('REVIEWER', 'AI_SUGGESTION_ACCEPTED');

-- CreateEnum
CREATE TYPE "PolicyRestrictionLevel" AS ENUM ('PROHIBITED', 'RESTRICTED', 'CONDITIONAL', 'DISCLOSURE_REQUIRED');

-- CreateEnum
CREATE TYPE "PolicySourceKind" AS ENUM ('PLATFORM_POLICY_PAGE', 'PLATFORM_HELP_ARTICLE', 'STATUTE_OR_REGULATION', 'REGULATOR_GUIDANCE', 'OTHER_OFFICIAL');

-- CreateEnum
CREATE TYPE "EvidenceAssessmentResult" AS ENUM ('ACCEPTED_FOR_REVIEW', 'INSUFFICIENT', 'NOT_RELEVANT', 'NEEDS_CLARIFICATION');

-- AlterEnum


ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'CLINICAL_STUDY';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'CERTIFICATION';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'POLICY_REFERENCE';

-- AlterEnum


ALTER TYPE "PolicyCategory" ADD VALUE IF NOT EXISTS 'TARGETING_RESTRICTION';
ALTER TYPE "PolicyCategory" ADD VALUE IF NOT EXISTS 'PRESCRIPTION_MEDICINE';
ALTER TYPE "PolicyCategory" ADD VALUE IF NOT EXISTS 'CREDENTIALS_LICENSING';
ALTER TYPE "PolicyCategory" ADD VALUE IF NOT EXISTS 'TESTIMONIAL_ENDORSEMENT';
ALTER TYPE "PolicyCategory" ADD VALUE IF NOT EXISTS 'PERSONAL_HEALTH_ATTRIBUTES';

-- AlterEnum


ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'VERSION_EDITED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'VERSION_VERIFIED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'VERSION_RETURNED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'VERSION_REJECTED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'SOURCE_CREATED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'SOURCE_EDITED';
ALTER TYPE "PolicyRuleEventKind" ADD VALUE IF NOT EXISTS 'SOURCE_VERIFIED';

-- AlterEnum
ALTER TYPE "PolicyVerificationStatus" ADD VALUE IF NOT EXISTS 'REQUIRES_REVIEW';

-- AlterTable
ALTER TABLE "Creative" ADD COLUMN     "industry" TEXT;

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "claimLocation" TEXT,
ADD COLUMN     "claimText" TEXT,
ADD COLUMN     "policyRuleVersionId" TEXT;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "aiScanRunId" TEXT,
ADD COLUMN     "claimLocation" TEXT,
ADD COLUMN     "claimText" TEXT,
ADD COLUMN     "origin" "FindingOrigin" NOT NULL DEFAULT 'REVIEWER',
ADD COLUMN     "suggestedRevision" TEXT;

-- AlterTable
ALTER TABLE "PolicyRuleEvent" ADD COLUMN     "sourceId" TEXT,
ALTER COLUMN "ruleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PolicyRuleVersion" ADD COLUMN     "officialEffectiveDate" TIMESTAMP(3),
ADD COLUMN     "restrictedClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restrictionLevel" "PolicyRestrictionLevel",
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "substantiationRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- AlterTable
ALTER TABLE "PolicyRuleVersionSource" ADD COLUMN     "retrievedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PolicySource" ADD COLUMN     "accessNote" TEXT,
ADD COLUMN     "sourceKind" "PolicySourceKind",
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- AlterTable
ALTER TABLE "SubmissionRound" ADD COLUMN     "submittedIndustry" TEXT;

-- CreateTable
CREATE TABLE "EvidenceAssessment" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "result" "EvidenceAssessmentResult" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceAssessment_evidenceId_createdAt_idx" ON "EvidenceAssessment"("evidenceId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceAssessment_cycleId_idx" ON "EvidenceAssessment"("cycleId");

-- CreateIndex
CREATE INDEX "Evidence_policyRuleVersionId_idx" ON "Evidence"("policyRuleVersionId");

-- CreateIndex
CREATE INDEX "PolicyRuleEvent_sourceId_createdAt_idx" ON "PolicyRuleEvent"("sourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_policyRuleVersionId_fkey" FOREIGN KEY ("policyRuleVersionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_aiScanRunId_fkey" FOREIGN KEY ("aiScanRunId") REFERENCES "AIScanRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySource" ADD CONSTRAINT "PolicySource_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRuleVersion" ADD CONSTRAINT "PolicyRuleVersion_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRuleEvent" ADD CONSTRAINT "PolicyRuleEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PolicySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAssessment" ADD CONSTRAINT "EvidenceAssessment_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAssessment" ADD CONSTRAINT "EvidenceAssessment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAssessment" ADD CONSTRAINT "EvidenceAssessment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Every policy event names a rule or a source (ruleId became nullable above).
ALTER TABLE "PolicyRuleEvent" ADD CONSTRAINT "PolicyRuleEvent_subject_check" CHECK ("ruleId" IS NOT NULL OR "sourceId" IS NOT NULL);
