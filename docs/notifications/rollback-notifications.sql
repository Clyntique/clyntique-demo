-- Rollback for 20261116180000_notifications (PR D). Run ONLY with the CEO's
-- approval, after redeploying code that no longer uses these tables.
-- Removes only the objects that migration created, plus its history row.
-- Every notification and preference row is lost (they are derived data:
-- the workflow records they point to are untouched).
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "NotificationPreference";
DROP TABLE IF EXISTS "Notification";
DROP TYPE IF EXISTS "NotificationKind";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261116180000_notifications';
COMMIT;
