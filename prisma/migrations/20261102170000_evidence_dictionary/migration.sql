-- Evidence Dictionary (Nov 2, 2026): reusable evidence records with reviewer checks.
-- Additive only: two new enums, one nullable column on Evidence (recordId) and
-- two new tables (EvidenceRecord, EvidenceRecordCheck, the latter append-only).
-- Nothing dropped, renamed, updated or deleted. Existing evidence rows keep
-- working unchanged (recordId is null). Every reference to history is
-- ON DELETE RESTRICT. No row is inserted.
-- CreateEnum
CREATE TYPE "EvidenceRecordStatus" AS ENUM ('UNCHECKED', 'ACCEPTED', 'NEEDS_MORE_INFO', 'NOT_ACCEPTED');

-- CreateEnum
CREATE TYPE "EvidenceRecordCheckResult" AS ENUM ('ACCEPTED', 'NEEDS_MORE_INFO', 'NOT_ACCEPTED');

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "recordId" TEXT;

-- CreateTable
CREATE TABLE "EvidenceRecord" (
    "id" TEXT NOT NULL,
    "ownerClientId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "url" TEXT,
    "claimText" TEXT,
    "validUntil" TIMESTAMP(3),
    "status" "EvidenceRecordStatus" NOT NULL DEFAULT 'UNCHECKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRecordCheck" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "result" "EvidenceRecordCheckResult" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRecordCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceRecord_ownerClientId_createdAt_idx" ON "EvidenceRecord"("ownerClientId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceRecord_status_idx" ON "EvidenceRecord"("status");

-- CreateIndex
CREATE INDEX "EvidenceRecordCheck_recordId_createdAt_idx" ON "EvidenceRecordCheck"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_recordId_idx" ON "Evidence"("recordId");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "EvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecordCheck" ADD CONSTRAINT "EvidenceRecordCheck_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "EvidenceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecordCheck" ADD CONSTRAINT "EvidenceRecordCheck_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
