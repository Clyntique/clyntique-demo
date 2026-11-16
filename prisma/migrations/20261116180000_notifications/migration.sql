-- In-app notifications (PR D, Nov 16, 2026).
-- Additive only: one enum and two new tables. No existing table, column or row changes.
-- Rollback: docs/notifications/rollback-notifications.sql (drops only these objects).

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('SUBMISSION_RECEIVED', 'RESUBMISSION_RECEIVED', 'REVIEW_STARTED', 'CHANGES_REQUESTED', 'REVIEW_COMPLETED', 'REVIEW_REOPENED', 'NEW_MESSAGE', 'EVIDENCE_REVIEWED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT NOT NULL,
    "creativeId" TEXT,
    "conversationId" TEXT,
    "evidenceRecordId" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_creativeId_idx" ON "Notification"("creativeId");

-- CreateIndex
CREATE INDEX "Notification_conversationId_idx" ON "Notification"("conversationId");

-- CreateIndex
CREATE INDEX "Notification_evidenceRecordId_idx" ON "Notification"("evidenceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientId_dedupeKey_key" ON "Notification"("recipientId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_kind_key" ON "NotificationPreference"("userId", "kind");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_evidenceRecordId_fkey" FOREIGN KEY ("evidenceRecordId") REFERENCES "EvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

