-- ROLLBACK for migration 20261102200000_content_library.
--
-- RECOVERY ONLY. Not run by any script or build. Needs explicit CEO approval
-- and a fresh export first (npm run db:export -- --out <folder outside repo>).
-- Removes ONLY the objects that migration added: the nullable column
-- "EvidenceRecord"."documentId" (with its index and foreign key), the tables
-- "KnowledgeQuery", "LibraryChunk" and "LibraryDocument", the two enum types,
-- and its row in "_prisma_migrations". No pre-existing table, column, type or
-- row is touched.
--
-- Run it as ONE script (npx prisma db execute --file <this file>): the whole
-- file executes in a single transaction, so it either completes or changes
-- nothing. Every statement uses IF EXISTS, so it also cleans up a partial apply.
--
-- Record protection: it REFUSES to run while any library document (deleted
-- ones included, they are history), knowledge query, or evidence record
-- linked to a document exists. To drop those anyway, export first, then run
-- the script with the confirmation line below uncommented. Evidence records
-- themselves are never deleted: only their "documentId" link goes.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- Uncomment ONLY to discard library records that were exported already:
-- SET LOCAL clyntique.rollback_confirm = 'drop-new-records';

DO $$
DECLARE
  n bigint;
  total bigint := 0;
  confirmed text := current_setting('clyntique.rollback_confirm', true);
BEGIN
  IF to_regclass('public."LibraryDocument"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "LibraryDocument"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'LibraryDocument rows: %', n; END IF; total := total + n;
  END IF;
  IF to_regclass('public."KnowledgeQuery"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "KnowledgeQuery"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'KnowledgeQuery rows: %', n; END IF; total := total + n;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'EvidenceRecord' AND column_name = 'documentId') THEN
    EXECUTE 'SELECT count(*) FROM "EvidenceRecord" WHERE "documentId" IS NOT NULL' INTO n;
    IF n > 0 THEN RAISE NOTICE 'EvidenceRecord rows linked to a document: %', n; END IF; total := total + n;
  END IF;
  IF total > 0 AND coalesce(confirmed, '') <> 'drop-new-records' THEN
    RAISE EXCEPTION 'Refusing: % library record(s) or link(s) exist. Export them (npm run db:export) and uncomment the SET LOCAL confirmation line to drop them.', total;
  END IF;
END $$;

-- The link from EvidenceRecord to its document (column, index, foreign key).
ALTER TABLE "EvidenceRecord" DROP CONSTRAINT IF EXISTS "EvidenceRecord_documentId_fkey";
DROP INDEX IF EXISTS "EvidenceRecord_documentId_idx";
ALTER TABLE "EvidenceRecord" DROP COLUMN IF EXISTS "documentId";

-- New tables, children first (LibraryChunk cascades from LibraryDocument anyway).
DROP TABLE IF EXISTS "KnowledgeQuery";
DROP TABLE IF EXISTS "LibraryChunk";
DROP TABLE IF EXISTS "LibraryDocument";

-- New enum types (no column uses them once the tables are gone).
DROP TYPE IF EXISTS "LibraryVisibility";
DROP TYPE IF EXISTS "LibraryDocumentStatus";

-- Prisma's history row, so `prisma migrate status` shows the migration as pending again.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261102200000_content_library';

COMMIT;
