-- ROLLBACK for migration 20261019180000_reviewer_chat.
--
-- RECOVERY ONLY. Not run by any script or build. Needs explicit CEO approval
-- and a fresh export first (npm run db:export -- --out <folder outside repo>).
-- Removes ONLY the two tables that migration added ("Message", "Conversation")
-- and its row in "_prisma_migrations". No pre-existing object is touched.
--
-- Run it as ONE script (npx prisma db execute --file <this file>): single
-- transaction, all or nothing. IF EXISTS makes it safe after a partial apply.
-- Run rollback-lifecycle-records.sql FIRST if that migration is applied too
-- (the two are independent, but keeping history in reverse order is cleaner).
--
-- Record protection: refuses while any conversation or message exists unless
-- the confirmation line below is uncommented (export first).

BEGIN;

-- Uncomment ONLY to discard chat records that were exported already:
-- SET LOCAL clyntique.rollback_confirm = 'drop-new-records';

DO $$
DECLARE
  n bigint := 0;
BEGIN
  IF to_regclass('public."Conversation"') IS NOT NULL THEN
    EXECUTE 'SELECT (SELECT count(*) FROM "Conversation") + (SELECT count(*) FROM "Message")' INTO n;
  END IF;
  IF n > 0 AND coalesce(current_setting('clyntique.rollback_confirm', true), '') <> 'drop-new-records' THEN
    RAISE EXCEPTION 'Refusing: % chat record(s) exist. Export them (npm run db:export) and uncomment the SET LOCAL confirmation line to drop them.', n;
  END IF;
END $$;

DROP TABLE IF EXISTS "Message";
DROP TABLE IF EXISTS "Conversation";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261019180000_reviewer_chat';

COMMIT;
