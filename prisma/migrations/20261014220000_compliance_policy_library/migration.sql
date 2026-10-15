-- Stage M6: Compliance Policy Library
-- Additive migration: new policy library tables, explicit policy admin permission,
-- permanent historical preservation (onDelete: Restrict), and unverified default.
-- Zero destructive statements: nothing dropped, renamed, or modified.

-- CreateEnum
CREATE TYPE "PolicyAuthorityType" AS ENUM ('REGULATION', 'PLATFORM_POLICY', 'INTERNAL_RISK');

-- CreateEnum
CREATE TYPE "PolicyVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PolicyRuleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PolicyCategory" AS ENUM ('EFFICACY_CLAIM', 'BEFORE_AFTER', 'DISCLOSURE', 'PRICING_PROMO', 'SUBSTANTIATION', 'RESTRICTED_PROCEDURES', 'MANDATORY_LABELING');

-- AlterTable User: Add explicit policy-administrator permission (zero lock, default false)
ALTER TABLE "User" ADD COLUMN "isPolicyAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable PolicySource (starts UNVERIFIED by default)
CREATE TABLE "PolicySource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authorityName" TEXT NOT NULL,
    "authorityType" "PolicyAuthorityType" NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "officialUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "lastAuditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "PolicyVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable PolicyRule
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authorityType" "PolicyAuthorityType" NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "subJurisdiction" TEXT,
    "platformCode" TEXT,
    "industry" TEXT NOT NULL DEFAULT 'HEALTHCARE',
    "category" "PolicyCategory" NOT NULL,
    "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable PolicyRuleVersion (starts UNVERIFIED by default)
CREATE TABLE "PolicyRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "legalExplanation" TEXT NOT NULL,
    "remediationAction" TEXT NOT NULL,
    "applicabilityConditions" TEXT[],
    "exceptions" TEXT[],
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" "PolicyRuleStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "verificationStatus" "PolicyVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "changeSummary" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable PolicyRuleVersionSource
CREATE TABLE "PolicyRuleVersionSource" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sectionReference" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "directUrl" TEXT NOT NULL,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyRuleVersionSource_pkey" PRIMARY KEY ("id")
);

-- AlterTable Finding: link to cited rule version (nullable, non-breaking)
ALTER TABLE "Finding" ADD COLUMN "ruleVersionId" TEXT;

-- CreateIndex
CREATE INDEX "PolicySource_authorityType_jurisdictionCode_idx" ON "PolicySource"("authorityType", "jurisdictionCode");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyRule_code_key" ON "PolicyRule"("code");

-- CreateIndex
CREATE INDEX "PolicyRule_jurisdictionCode_platformCode_idx" ON "PolicyRule"("jurisdictionCode", "platformCode");

-- CreateIndex
CREATE INDEX "PolicyRule_authorityType_category_idx" ON "PolicyRule"("authorityType", "category");

-- CreateIndex
CREATE INDEX "PolicyRuleVersion_status_verificationStatus_idx" ON "PolicyRuleVersion"("status", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyRuleVersion_ruleId_versionNumber_key" ON "PolicyRuleVersion"("ruleId", "versionNumber");

-- CreateIndex
CREATE INDEX "PolicyRuleVersionSource_versionId_idx" ON "PolicyRuleVersionSource"("versionId");

-- CreateIndex
CREATE INDEX "PolicyRuleVersionSource_sourceId_idx" ON "PolicyRuleVersionSource"("sourceId");

-- CreateIndex
CREATE INDEX "Finding_ruleVersionId_idx" ON "Finding"("ruleVersionId");

-- AddForeignKey: PolicyRuleVersion -> PolicyRule (Restrict deletion to permanently preserve history)
ALTER TABLE "PolicyRuleVersion" ADD CONSTRAINT "PolicyRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PolicyRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PolicyRuleVersion -> User (createdBy)
ALTER TABLE "PolicyRuleVersion" ADD CONSTRAINT "PolicyRuleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PolicyRuleVersion -> User (approvedBy)
ALTER TABLE "PolicyRuleVersion" ADD CONSTRAINT "PolicyRuleVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PolicyRuleVersionSource -> PolicyRuleVersion (Restrict deletion to permanently preserve citations)
ALTER TABLE "PolicyRuleVersionSource" ADD CONSTRAINT "PolicyRuleVersionSource_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PolicyRuleVersionSource -> PolicySource
ALTER TABLE "PolicyRuleVersionSource" ADD CONSTRAINT "PolicyRuleVersionSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PolicySource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Finding -> PolicyRuleVersion (Restrict deletion so historical findings retain references)
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
