-- APPLY script for migration 20261019180000_reviewer_chat on an EXISTING database.
-- Body = prisma/migrations/20261019180000_reviewer_chat/migration.sql, unchanged
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
--   npx prisma db execute --file docs/core-workflow-sprint-oct19/sql/apply-reviewer_chat.sql
--   npx prisma migrate resolve --applied 20261019180000_reviewer_chat
--   npx prisma migrate status
SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- Reviewer chat: a client's conversations with the Clyntique human reviewers.
-- Purely additive: two new tables, their indexes and foreign keys. No existing
-- table or column is changed, nothing is dropped, renamed or updated, and no
-- rows are inserted. Chat is separate from the formal review and from the
-- project Activity timeline.

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "creativeId" TEXT,
    "subjectKey" TEXT NOT NULL,
    "assignedReviewerId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "readById" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_assignedReviewerId_lastMessageAt_idx" ON "Conversation"("assignedReviewerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_creativeId_idx" ON "Conversation"("creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_clientId_subjectKey_key" ON "Conversation"("clientId", "subjectKey");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_senderRole_readAt_idx" ON "Message"("conversationId", "senderRole", "readAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_readById_fkey" FOREIGN KEY ("readById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

