-- ROLLBACK for migration 20261028000000_policy_structure_and_evidence (P0, Oct 27).
--
-- RECOVERY ONLY. Not run by any script or build. Needs explicit CEO approval
-- and a fresh export first (npm run db:export -- --out <folder outside repo>).
-- Removes ONLY the objects that migration added: the EvidenceAssessment table,
-- the new nullable columns, four enum types, the CHECK constraint, and its row
-- in "_prisma_migrations"; restores NOT NULL on "PolicyRuleEvent"."ruleId".
--
-- Values added to existing enums (EvidenceType, PolicyCategory,
-- PolicyRuleEventKind, PolicyVerificationStatus) are NOT removed: PostgreSQL
-- cannot drop an enum value. They are unused by the earlier code and harmless;
-- the record protection below refuses while any row uses them.
--
-- Run it as ONE script (npx prisma db execute --file <this file>): the whole
-- file executes in a single transaction, so it either completes or changes
-- nothing. Statements use IF EXISTS, so it also cleans up a partial apply.
--
-- Record protection: it REFUSES to run while any P0 data exists (assessments,
-- filled-in P0 columns, source events or rows using the new enum values). To
-- drop that data anyway, export first and uncomment the confirmation line.
-- Source events (ruleId null) block the NOT NULL restore and are never
-- deleted by this script.

BEGIN;

-- Uncomment ONLY to discard P0 data that was exported already:
-- SET LOCAL clyntique.rollback_confirm = 'drop-new-records';

DO $$
DECLARE
  n bigint;
  total bigint := 0;
  confirmed text := current_setting('clyntique.rollback_confirm', true);
  checks text[] := ARRAY[
    'SELECT count(*) FROM "EvidenceAssessment"',
    'SELECT count(*) FROM "Evidence" WHERE "claimText" IS NOT NULL OR "claimLocation" IS NOT NULL OR "policyRuleVersionId" IS NOT NULL OR "type"::text IN (''CLINICAL_STUDY'', ''CERTIFICATION'', ''POLICY_REFERENCE'')',
    'SELECT count(*) FROM "Finding" WHERE "claimText" IS NOT NULL OR "claimLocation" IS NOT NULL OR "suggestedRevision" IS NOT NULL OR "aiScanRunId" IS NOT NULL OR "origin" <> ''REVIEWER''',
    'SELECT count(*) FROM "Creative" WHERE "industry" IS NOT NULL',
    'SELECT count(*) FROM "SubmissionRound" WHERE "submittedIndustry" IS NOT NULL',
    'SELECT count(*) FROM "PolicySource" WHERE "sourceKind" IS NOT NULL OR "accessNote" IS NOT NULL OR "verifiedById" IS NOT NULL OR "verificationStatus"::text = ''REQUIRES_REVIEW''',
    'SELECT count(*) FROM "PolicyRuleVersion" WHERE "restrictionLevel" IS NOT NULL OR cardinality("restrictedClaims") > 0 OR cardinality("substantiationRequirements") > 0 OR "officialEffectiveDate" IS NOT NULL OR "verifiedById" IS NOT NULL OR "reviewNote" IS NOT NULL OR "verificationStatus"::text = ''REQUIRES_REVIEW''',
    'SELECT count(*) FROM "PolicyRuleVersionSource" WHERE "sourceUpdatedAt" IS NOT NULL OR "retrievedAt" IS NOT NULL',
    'SELECT count(*) FROM "PolicyRule" WHERE "category"::text IN (''TARGETING_RESTRICTION'', ''PRESCRIPTION_MEDICINE'', ''CREDENTIALS_LICENSING'', ''TESTIMONIAL_ENDORSEMENT'', ''PERSONAL_HEALTH_ATTRIBUTES'')',
    'SELECT count(*) FROM "PolicyRuleEvent" WHERE "sourceId" IS NOT NULL OR "ruleId" IS NULL OR "kind"::text IN (''VERSION_EDITED'', ''VERSION_VERIFIED'', ''VERSION_RETURNED'', ''VERSION_REJECTED'', ''SOURCE_CREATED'', ''SOURCE_EDITED'', ''SOURCE_VERIFIED'')'
  ];
  q text;
BEGIN
  IF to_regclass('public."EvidenceAssessment"') IS NULL THEN
    RAISE NOTICE 'EvidenceAssessment does not exist: nothing to check (partial or no apply).';
    RETURN;
  END IF;
  FOREACH q IN ARRAY checks LOOP
    EXECUTE q INTO n;
    IF n > 0 THEN RAISE NOTICE '% -> % row(s)', q, n; END IF;
    total := total + n;
  END LOOP;
  IF total > 0 AND coalesce(confirmed, '') <> 'drop-new-records' THEN
    RAISE EXCEPTION 'Refusing: % row(s) hold P0 data. Export them (npm run db:export) and uncomment the SET LOCAL confirmation line to drop them.', total;
  END IF;
END $$;

DROP TABLE IF EXISTS "EvidenceAssessment";

ALTER TABLE "PolicyRuleEvent" DROP CONSTRAINT IF EXISTS "PolicyRuleEvent_subject_check";
ALTER TABLE "PolicyRuleEvent" DROP CONSTRAINT IF EXISTS "PolicyRuleEvent_sourceId_fkey";
DROP INDEX IF EXISTS "PolicyRuleEvent_sourceId_createdAt_idx";
ALTER TABLE "PolicyRuleEvent" DROP COLUMN IF EXISTS "sourceId";
-- Fails (and rolls everything back) if a source-only event exists.
ALTER TABLE "PolicyRuleEvent" ALTER COLUMN "ruleId" SET NOT NULL;

ALTER TABLE "Evidence" DROP CONSTRAINT IF EXISTS "Evidence_policyRuleVersionId_fkey";
DROP INDEX IF EXISTS "Evidence_policyRuleVersionId_idx";
ALTER TABLE "Evidence" DROP COLUMN IF EXISTS "policyRuleVersionId", DROP COLUMN IF EXISTS "claimText", DROP COLUMN IF EXISTS "claimLocation";

ALTER TABLE "Finding" DROP CONSTRAINT IF EXISTS "Finding_aiScanRunId_fkey";
ALTER TABLE "Finding" DROP COLUMN IF EXISTS "aiScanRunId", DROP COLUMN IF EXISTS "claimText", DROP COLUMN IF EXISTS "claimLocation", DROP COLUMN IF EXISTS "suggestedRevision", DROP COLUMN IF EXISTS "origin";

ALTER TABLE "Creative" DROP COLUMN IF EXISTS "industry";
ALTER TABLE "SubmissionRound" DROP COLUMN IF EXISTS "submittedIndustry";

ALTER TABLE "PolicySource" DROP CONSTRAINT IF EXISTS "PolicySource_verifiedById_fkey";
ALTER TABLE "PolicySource" DROP COLUMN IF EXISTS "sourceKind", DROP COLUMN IF EXISTS "accessNote", DROP COLUMN IF EXISTS "verifiedById", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verificationNote";

ALTER TABLE "PolicyRuleVersion" DROP CONSTRAINT IF EXISTS "PolicyRuleVersion_verifiedById_fkey";
ALTER TABLE "PolicyRuleVersion" DROP COLUMN IF EXISTS "restrictionLevel", DROP COLUMN IF EXISTS "restrictedClaims", DROP COLUMN IF EXISTS "substantiationRequirements", DROP COLUMN IF EXISTS "officialEffectiveDate", DROP COLUMN IF EXISTS "verifiedById", DROP COLUMN IF EXISTS "verifiedAt", DROP COLUMN IF EXISTS "verificationNote", DROP COLUMN IF EXISTS "reviewNote";

ALTER TABLE "PolicyRuleVersionSource" DROP COLUMN IF EXISTS "sourceUpdatedAt", DROP COLUMN IF EXISTS "retrievedAt";

DROP TYPE IF EXISTS "EvidenceAssessmentResult";
DROP TYPE IF EXISTS "FindingOrigin";
DROP TYPE IF EXISTS "PolicyRestrictionLevel";
DROP TYPE IF EXISTS "PolicySourceKind";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261028000000_policy_structure_and_evidence';

COMMIT;
