-- Content Library and knowledge search (Nov 2, 2026).
-- Additive only: two new enums, one nullable column on EvidenceRecord
-- (documentId), three new tables (LibraryDocument, LibraryChunk, KnowledgeQuery),
-- a generated tsvector column with a GIN index for full-text search.
-- Nothing dropped, renamed, updated or deleted. No row is inserted.
-- LibraryChunk rows cascade from their document on purpose: they are a
-- search index, not history. Every other reference is ON DELETE RESTRICT.
-- CreateEnum
CREATE TYPE "LibraryDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "LibraryVisibility" AS ENUM ('PRIVATE', 'TEAM');

-- AlterTable
ALTER TABLE "EvidenceRecord" ADD COLUMN     "documentId" TEXT;

-- CreateTable
CREATE TABLE "LibraryDocument" (
    "id" TEXT NOT NULL,
    "ownerClientId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileUrl" TEXT,
    "type" "EvidenceType" NOT NULL,
    "source" TEXT,
    "visibility" "LibraryVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "LibraryDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "pageCount" INTEGER,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "textChars" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "page" INTEGER,
    "text" TEXT NOT NULL,
    "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownerClientId" TEXT,
    "question" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryDocument_ownerClientId_createdAt_idx" ON "LibraryDocument"("ownerClientId", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryDocument_status_idx" ON "LibraryDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryChunk_documentId_index_key" ON "LibraryChunk"("documentId", "index");

-- CreateIndex
CREATE INDEX "LibraryChunk_tsv_idx" ON "LibraryChunk" USING GIN ("tsv");

-- CreateIndex
CREATE INDEX "KnowledgeQuery_ownerClientId_createdAt_idx" ON "KnowledgeQuery"("ownerClientId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceRecord_documentId_idx" ON "EvidenceRecord"("documentId");

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDocument" ADD CONSTRAINT "LibraryDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryChunk" ADD CONSTRAINT "LibraryChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQuery" ADD CONSTRAINT "KnowledgeQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
