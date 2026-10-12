-- Stage E (approved 12 Oct 2026, option a): what the client submitted with
-- each round. Additive: three nullable columns, no defaults, nothing dropped.
ALTER TABLE "SubmissionRound" ADD COLUMN "submittedName" TEXT;
ALTER TABLE "SubmissionRound" ADD COLUMN "submittedDescription" TEXT;
ALTER TABLE "SubmissionRound" ADD COLUMN "submittedContext" TEXT;

-- One-time fill of the NEW columns only, for rounds that already exist, from
-- each submission's current details. No existing column is changed.
UPDATE "SubmissionRound" AS r
SET "submittedName" = c."name",
    "submittedDescription" = c."description",
    "submittedContext" = c."context"
FROM "Creative" AS c
WHERE r."creativeId" = c."id" AND r."submittedName" IS NULL;
