-- ROLLBACK for migration 20261102170000_evidence_dictionary.
--
-- RECOVERY ONLY. Not run by any script or build. Needs explicit CEO approval
-- and a fresh export first (npm run db:export -- --out <folder outside repo>).
-- Removes ONLY the objects that migration added: the nullable column
-- "Evidence"."recordId" (with its index and foreign key), the tables
-- "EvidenceRecordCheck" and "EvidenceRecord", the two enum types, and its row
-- in "_prisma_migrations". No pre-existing table, column, type or row is touched.
--
-- Run it as ONE script (npx prisma db execute --file <this file>): the whole
-- file executes in a single transaction, so it either completes or changes
-- nothing. Every statement uses IF EXISTS, so it also cleans up a partial apply.
--
-- Record protection: it REFUSES to run while any evidence record, record check
-- or evidence row linked to a record exists. To drop those anyway, export
-- first, then run the script with the confirmation line below uncommented.
-- Evidence rows themselves are never deleted: only their "recordId" link goes.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- Uncomment ONLY to discard dictionary records that were exported already:
-- SET LOCAL clyntique.rollback_confirm = 'drop-new-records';

DO $$
DECLARE
  n bigint;
  total bigint := 0;
  confirmed text := current_setting('clyntique.rollback_confirm', true);
BEGIN
  IF to_regclass('public."EvidenceRecordCheck"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "EvidenceRecordCheck"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'EvidenceRecordCheck rows: %', n; END IF; total := total + n;
  END IF;
  IF to_regclass('public."EvidenceRecord"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "EvidenceRecord"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'EvidenceRecord rows: %', n; END IF; total := total + n;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Evidence' AND column_name = 'recordId') THEN
    EXECUTE 'SELECT count(*) FROM "Evidence" WHERE "recordId" IS NOT NULL' INTO n;
    IF n > 0 THEN RAISE NOTICE 'Evidence rows linked to a record: %', n; END IF; total := total + n;
  END IF;
  IF total > 0 AND coalesce(confirmed, '') <> 'drop-new-records' THEN
    RAISE EXCEPTION 'Refusing: % dictionary record(s) or link(s) exist. Export them (npm run db:export) and uncomment the SET LOCAL confirmation line to drop them.', total;
  END IF;
END $$;

-- The link from Evidence to its record (column, index, foreign key).
ALTER TABLE "Evidence" DROP CONSTRAINT IF EXISTS "Evidence_recordId_fkey";
DROP INDEX IF EXISTS "Evidence_recordId_idx";
ALTER TABLE "Evidence" DROP COLUMN IF EXISTS "recordId";

-- New tables, children first.
DROP TABLE IF EXISTS "EvidenceRecordCheck";
DROP TABLE IF EXISTS "EvidenceRecord";

-- New enum types (no column uses them once the tables are gone).
DROP TYPE IF EXISTS "EvidenceRecordCheckResult";
DROP TYPE IF EXISTS "EvidenceRecordStatus";

-- Prisma's history row, so `prisma migrate status` shows the migration as pending again.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261102170000_evidence_dictionary';

COMMIT;
