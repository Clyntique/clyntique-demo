-- ROLLBACK for migration 20261009180000_submission_workflow (M1A).
--
-- RECOVERY ONLY. NOT run by any script. Requires explicit operator approval.
-- Use only if the M1A migration failed part-way or must be undone, AFTER a
-- backup/export (npm run db:export). It removes ONLY objects that M1A added,
-- and any rows stored in them. Pre-M1A tables, columns and rows are not
-- touched.
--
-- Not reversible here: the values added to the existing enums
-- "CreativeStatus" (SUBMITTED, REVIEW_COMPLETE) and "ActivityType" (6 values).
-- PostgreSQL cannot drop enum values; they are unused by pre-M1A code and harmless.
-- If any row uses them, this script stops (see the checks below).
--
-- Every statement uses IF EXISTS, so it also works after a partial failure.
-- After running it, mark the migration rolled back:
--   npx prisma migrate resolve --rolled-back 20261009180000_submission_workflow

BEGIN;

-- Refuse to run if any pre-M1A table holds rows that depend on M1A enum values.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Creative" WHERE status::text IN ('SUBMITTED', 'REVIEW_COMPLETE')) THEN
    RAISE EXCEPTION 'Creative rows use M1A statuses; resolve them before rolling back.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Activity" WHERE type::text IN ('SUBMISSION_SUBMITTED','EVIDENCE_SUBMITTED','REVIEW_STARTED','FINDING_RECORDED','RESUBMITTED','REVIEW_COMPLETED')) THEN
    RAISE EXCEPTION 'Activity rows use M1A event types; resolve them before rolling back.';
  END IF;
END $$;

-- New tables (children first).
DROP TABLE IF EXISTS "FindingPlatform";
DROP TABLE IF EXISTS "FindingMarket";
DROP TABLE IF EXISTS "SubmissionPlatform";
DROP TABLE IF EXISTS "SubmissionMarket";
DROP TABLE IF EXISTS "FindingEvidence";
DROP TABLE IF EXISTS "FindingResponse";
DROP TABLE IF EXISTS "FindingEvent";
DROP TABLE IF EXISTS "Finding";
DROP TABLE IF EXISTS "ReviewDecision";
DROP TABLE IF EXISTS "SubmissionRound";
DROP TABLE IF EXISTS "ReviewCycle";
DROP TABLE IF EXISTS "AdPlatform";
DROP TABLE IF EXISTS "Market";
DROP TABLE IF EXISTS "LoginAttempt";

-- New columns on existing tables (their foreign keys and indexes go with them).
ALTER TABLE "Activity" DROP COLUMN IF EXISTS "creativeId";
ALTER TABLE "Evidence"
  DROP COLUMN IF EXISTS "addedById",
  DROP COLUMN IF EXISTS "origin",
  DROP COLUMN IF EXISTS "versionId",
  DROP COLUMN IF EXISTS "visibility",
  DROP COLUMN IF EXISTS "withdrawnAt",
  DROP COLUMN IF EXISTS "withdrawnById";
ALTER TABLE "Creative"
  DROP COLUMN IF EXISTS "createdById",
  DROP COLUMN IF EXISTS "submittedAt",
  DROP COLUMN IF EXISTS "workflow";

-- New enum types.
DROP TYPE IF EXISTS "CreativeWorkflow";
DROP TYPE IF EXISTS "EvidenceOrigin";
DROP TYPE IF EXISTS "EvidenceVisibility";
DROP TYPE IF EXISTS "ReviewDecisionKind";
DROP TYPE IF EXISTS "ReviewOutcome";
DROP TYPE IF EXISTS "FindingStatus";
DROP TYPE IF EXISTS "FindingSeverity";
DROP TYPE IF EXISTS "FindingAction";
DROP TYPE IF EXISTS "MarketKind";

COMMIT;
