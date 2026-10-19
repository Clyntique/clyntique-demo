-- ROLLBACK for migration 20261019190000_lifecycle_records.
--
-- RECOVERY ONLY. Not run by any script or build. Needs explicit CEO approval
-- and a fresh export first (npm run db:export -- --out <folder outside repo>).
-- Removes ONLY the objects that migration added: five tables, two nullable
-- columns on "ReviewCycle", six enum types, and its row in "_prisma_migrations".
-- No pre-existing table, column, type or row is touched.
--
-- Run it as ONE script (npx prisma db execute --file <this file>): the whole
-- file executes in a single transaction, so it either completes or changes
-- nothing. Every statement uses IF EXISTS, so it also cleans up a partial apply.
--
-- Record protection: it REFUSES to run while any lifecycle record exists
-- (AI scan runs, external submissions/outcomes, rule events, or a re-review
-- cycle with a reason). To drop those records anyway, export first, then run
-- the script with the confirmation line below uncommented. Dropped records can
-- be re-inserted from the export after the migration is re-applied.

BEGIN;

-- Uncomment ONLY to discard lifecycle records that were exported already:
-- SET LOCAL clyntique.rollback_confirm = 'drop-new-records';

DO $$
DECLARE
  n bigint;
  total bigint := 0;
  confirmed text := current_setting('clyntique.rollback_confirm', true);
BEGIN
  IF to_regclass('public."AIScanRun"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "AIScanRun"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'AIScanRun rows: %', n; END IF; total := total + n;
  END IF;
  IF to_regclass('public."ExternalSubmission"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "ExternalSubmission"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'ExternalSubmission rows: %', n; END IF; total := total + n;
  END IF;
  IF to_regclass('public."ExternalOutcome"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "ExternalOutcome"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'ExternalOutcome rows: %', n; END IF; total := total + n;
  END IF;
  IF to_regclass('public."PolicyRuleEvent"') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM "PolicyRuleEvent"' INTO n;
    IF n > 0 THEN RAISE NOTICE 'PolicyRuleEvent rows: %', n; END IF; total := total + n;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ReviewCycle' AND column_name = 'reasonKind') THEN
    EXECUTE 'SELECT count(*) FROM "ReviewCycle" WHERE "reasonKind" IS NOT NULL OR "triggerRuleVersionId" IS NOT NULL' INTO n;
    IF n > 0 THEN RAISE NOTICE 'ReviewCycle rows with a re-review reason: %', n; END IF; total := total + n;
  END IF;
  IF total > 0 AND coalesce(confirmed, '') <> 'drop-new-records' THEN
    RAISE EXCEPTION 'Refusing: % lifecycle record(s) exist. Export them (npm run db:export) and uncomment the SET LOCAL confirmation line to drop them.', total;
  END IF;
END $$;

-- New tables, children first.
DROP TABLE IF EXISTS "ExternalOutcome";
DROP TABLE IF EXISTS "ExternalSubmission";
DROP TABLE IF EXISTS "AIScanRuleCheck";
DROP TABLE IF EXISTS "AIScanRun";
DROP TABLE IF EXISTS "PolicyRuleEvent";

-- New columns on the existing ReviewCycle table (the FK goes with the column).
ALTER TABLE "ReviewCycle" DROP CONSTRAINT IF EXISTS "ReviewCycle_triggerRuleVersionId_fkey";
ALTER TABLE "ReviewCycle"
  DROP COLUMN IF EXISTS "reasonKind",
  DROP COLUMN IF EXISTS "triggerRuleVersionId";

-- New enum types (only after every column that used them is gone).
DROP TYPE IF EXISTS "ReviewCycleReason";
DROP TYPE IF EXISTS "AIScanStatus";
DROP TYPE IF EXISTS "ExternalDestinationType";
DROP TYPE IF EXISTS "ExternalRecordBasis";
DROP TYPE IF EXISTS "ExternalOutcomeKind";
DROP TYPE IF EXISTS "PolicyRuleEventKind";

-- Migration history: Prisma refuses to mark a successfully applied migration
-- as rolled back, so the history row is removed here, in the same transaction.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261019190000_lifecycle_records';

COMMIT;
