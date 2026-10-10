-- M5: optional uploaded file on Evidence. Additive only: four nullable
-- columns, no defaults, no backfill, no existing data rewritten.
ALTER TABLE "Evidence" ADD COLUMN "fileUrl" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "fileName" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Evidence" ADD COLUMN "fileSize" INTEGER;
