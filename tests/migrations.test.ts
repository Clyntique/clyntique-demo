import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static checks on the migration files. They protect the properties that the
// offline PGlite run (docs/audit/m1a/verify-migrations.mjs) verified, in case
// a migration is regenerated or edited later. No database is used.

const dir = join(process.cwd(), "prisma", "migrations");
const folders = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const sql = (folder: string) => readFileSync(join(dir, folder, "migration.sql"), "utf8");
// SQL without comments, so warnings in comments don't trip the checks.
const statements = (folder: string) => sql(folder).replace(/--.*$/gm, "");

describe("prisma/migrations", () => {
  it("starts with the 0_init baseline, followed by the submission-workflow, evidence-files, round-snapshot, compliance-policy-library, and reviewer-chat migrations", () => {
    expect(folders).toEqual([
      "0_init",
      "20261009180000_submission_workflow",
      "20261011090000_evidence_files",
      "20261012190000_round_snapshot",
      "20261014220000_compliance_policy_library",
      "20261019180000_reviewer_chat",
      "20261019190000_lifecycle_records",
      "20261028000000_policy_structure_and_evidence",
      "20261031160000_policy_source_monitoring",
    ]);
  });

  it("the lifecycle-records migration (Oct 19 sprint) only creates and adds, and keeps history on RESTRICT", () => {
    const body = statements("20261019190000_lifecycle_records");
    const kinds = body
      .split(";")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.match(/^(CREATE TYPE|CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE "\w+" ADD COLUMN|ALTER TABLE "\w+" ADD CONSTRAINT)/)?.[1] ?? l.slice(0, 40));
    expect(new Set(kinds)).toEqual(new Set(["CREATE TYPE", "CREATE TABLE", "CREATE INDEX", "ALTER TABLE \"ReviewCycle\" ADD COLUMN", "ALTER TABLE \"ReviewCycle\" ADD CONSTRAINT", "ALTER TABLE \"AIScanRun\" ADD CONSTRAINT", "ALTER TABLE \"AIScanRuleCheck\" ADD CONSTRAINT", "ALTER TABLE \"ExternalSubmission\" ADD CONSTRAINT", "ALTER TABLE \"ExternalOutcome\" ADD CONSTRAINT", "ALTER TABLE \"PolicyRuleEvent\" ADD CONSTRAINT"]));
    for (const table of ["AIScanRun", "AIScanRuleCheck", "ExternalSubmission", "ExternalOutcome", "PolicyRuleEvent"]) expect(body).toContain(`CREATE TABLE "${table}"`);
    expect(body).toContain('ALTER TABLE "ReviewCycle" ADD COLUMN     "reasonKind" "ReviewCycleReason"');
    expect(body).toMatch(/ADD COLUMN\s+"triggerRuleVersionId" TEXT/);
    // Rule versions and users referenced by history can't be deleted from under it.
    expect(body).toMatch(/"AIScanRuleCheck" ADD CONSTRAINT[^;]*"ruleVersionId"[^;]*ON DELETE RESTRICT/);
    expect(body).toMatch(/"ReviewCycle" ADD CONSTRAINT[^;]*"triggerRuleVersionId"[^;]*ON DELETE RESTRICT/);
    expect(body).toMatch(/"ExternalSubmission" ADD CONSTRAINT[^;]*"versionId"[^;]*ON DELETE RESTRICT/);
    expect(body).toMatch(/"PolicyRuleEvent" ADD CONSTRAINT[^;]*"ruleId"[^;]*ON DELETE RESTRICT/);
  });

  it("the round-snapshot migration adds three nullable columns and only fills those new columns", () => {
    const body = statements("20261012190000_round_snapshot");
    for (const col of ["submittedName", "submittedDescription", "submittedContext"]) {
      expect(body).toContain(`ALTER TABLE "SubmissionRound" ADD COLUMN "${col}" TEXT;`);
    }
    const updates = body.match(/UPDATE "SubmissionRound"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(1);
    const update = updates[0] ?? "";
    const setClause = update.slice(update.indexOf("SET"), update.indexOf("FROM"));
    const assigned = [...setClause.matchAll(/"(\w+)" = c\./g)].map((m) => m[1]);
    expect(assigned).toEqual(["submittedName", "submittedDescription", "submittedContext"]);
    expect(update).toContain('r."submittedName" IS NULL');
  });

  it("the evidence-files migration only adds four nullable columns to Evidence", () => {
    const lines = statements("20261011090000_evidence_files")
      .split(";")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines).toEqual([
      'ALTER TABLE "Evidence" ADD COLUMN "fileUrl" TEXT',
      'ALTER TABLE "Evidence" ADD COLUMN "fileName" TEXT',
      'ALTER TABLE "Evidence" ADD COLUMN "mimeType" TEXT',
      'ALTER TABLE "Evidence" ADD COLUMN "fileSize" INTEGER',
    ]);
  });

  it("contains no destructive statements (the round-snapshot backfill is checked separately above)", () => {
    for (const folder of folders) {
      let body = folder === "20261012190000_round_snapshot" ? statements(folder).replace(/UPDATE "SubmissionRound"[\s\S]*?;/, "") : statements(folder);
      // P0: PolicyRuleEvent.ruleId becomes optional (source events). Relaxing a
      // constraint drops no data; it is checked on its own below.
      if (folder === "20261028000000_policy_structure_and_evidence") body = body.replace(/ALTER COLUMN "ruleId" DROP NOT NULL/, "");
      expect(body).not.toMatch(/\b(DROP|RENAME|TRUNCATE|DELETE\s+FROM|UPDATE\s+"|ALTER\s+COLUMN\s+"\w+"\s+(SET\s+DATA\s+)?TYPE)\b/i);
    }
  });

  it("labels existing creatives LEGACY and only then makes SUBMISSION_REVIEW the default", () => {
    const body = statements("20261009180000_submission_workflow");
    const addLegacy = body.indexOf(`ADD COLUMN     "workflow" "CreativeWorkflow" NOT NULL DEFAULT 'LEGACY_CLIENT_APPROVAL'`);
    const switchDefault = body.indexOf(`ALTER TABLE "Creative" ALTER COLUMN "workflow" SET DEFAULT 'SUBMISSION_REVIEW'`);
    expect(addLegacy).toBeGreaterThan(-1);
    expect(switchDefault).toBeGreaterThan(addLegacy);
    expect(body).not.toMatch(/"workflow" "CreativeWorkflow" NOT NULL DEFAULT 'SUBMISSION_REVIEW'/);
  });

  it("seeds the US, Canada and UAE markets as reference data", () => {
    const body = statements("20261009180000_submission_workflow");
    for (const code of ["US", "CA", "AE"]) expect(body).toContain(`('${code}', `);
  });

  it("keeps the schema default for new creatives as SUBMISSION_REVIEW", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(schema).toMatch(/workflow\s+CreativeWorkflow\s+@default\(SUBMISSION_REVIEW\)/);
  });

  it("the compliance-policy-library migration is purely additive with ON DELETE RESTRICT on historical findings and versions", () => {
    const body = statements("20261014220000_compliance_policy_library");
    expect(body).toContain('ALTER TABLE "User" ADD COLUMN "isPolicyAdmin" BOOLEAN NOT NULL DEFAULT false;');
    expect(body).toContain('ALTER TABLE "Finding" ADD COLUMN "ruleVersionId" TEXT;');
    expect(body).toContain('CREATE TABLE "PolicySource"');
    expect(body).toContain('CREATE TABLE "PolicyRule"');
    expect(body).toContain('CREATE TABLE "PolicyRuleVersion"');
    expect(body).toContain('CREATE TABLE "PolicyRuleVersionSource"');
    // Historical permanence checks (Requirement 2)
    expect(body).toContain('FOREIGN KEY ("ruleVersionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT');
    expect(body).toContain('FOREIGN KEY ("ruleId") REFERENCES "PolicyRule"("id") ON DELETE RESTRICT');
    expect(body).toContain('FOREIGN KEY ("versionId") REFERENCES "PolicyRuleVersion"("id") ON DELETE RESTRICT');
    // Unverified default checks (Requirement 1)
    expect(body).toContain('"verificationStatus" "PolicyVerificationStatus" NOT NULL DEFAULT \'UNVERIFIED\'');
  });

  it("the reviewer-chat migration only creates the Conversation and Message tables (with their keys and indexes)", () => {
    const body = statements("20261019180000_reviewer_chat");
    const kinds = body
      .split(";")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/\s+/g, " ").match(/^(CREATE TABLE "\w+"|CREATE (UNIQUE )?INDEX "[\w]+" ON "\w+"|ALTER TABLE "\w+" ADD CONSTRAINT "[\w]+" FOREIGN KEY)/)?.[1]);
    expect(kinds.every(Boolean)).toBe(true);
    expect(body).toContain('CREATE TABLE "Conversation"');
    expect(body).toContain('CREATE TABLE "Message"');
    expect(body).toContain('CREATE UNIQUE INDEX "Conversation_clientId_subjectKey_key" ON "Conversation"("clientId", "subjectKey")');
    // Only the two new tables are altered; no row is inserted.
    expect([...body.matchAll(/ALTER TABLE "(\w+)"/g)].every((m) => ["Conversation", "Message"].includes(m[1]))).toBe(true);
    expect(body).not.toMatch(/\bINSERT\b/i);
  });

  it("the P0 policy-structure migration (Oct 27) only creates and adds, plus one relaxed NOT NULL and a CHECK", () => {
    const body = statements("20261028000000_policy_structure_and_evidence");
    const kinds = body
      .split(";")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.match(/^(CREATE TYPE|CREATE TABLE|CREATE INDEX|ALTER TYPE "\w+" ADD VALUE IF NOT EXISTS|ALTER TABLE "\w+" ADD COLUMN|ALTER TABLE "\w+" ADD CONSTRAINT)/)?.[1] ?? l.slice(0, 60));
    for (const k of kinds) expect(k).toMatch(/^(CREATE TYPE|CREATE TABLE|CREATE INDEX|ALTER TYPE "\w+" ADD VALUE IF NOT EXISTS|ALTER TABLE "\w+" ADD (COLUMN|CONSTRAINT))$/);
    // The only change to an existing column: PolicyRuleEvent.ruleId may be null.
    expect([...body.matchAll(/ALTER COLUMN "(\w+)" (\w+ \w+ \w+)/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual(["ruleId DROP NOT NULL"]);
    expect(body).toContain('CHECK ("ruleId" IS NOT NULL OR "sourceId" IS NOT NULL)');
    expect([...body.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1])).toEqual(["EvidenceAssessment"]);
    // New references to history keep it: rule versions and reviewers are RESTRICT.
    expect(body).toMatch(/"Evidence" ADD CONSTRAINT[^;]*"policyRuleVersionId"[^;]*ON DELETE RESTRICT/);
    expect(body).toMatch(/"PolicyRuleVersion" ADD CONSTRAINT[^;]*"verifiedById"[^;]*ON DELETE RESTRICT/);
    expect(body).toMatch(/"EvidenceAssessment" ADD CONSTRAINT[^;]*"reviewerId"[^;]*ON DELETE RESTRICT/);
    // Existing findings become REVIEWER findings; no row is written.
    expect(body).toContain(`"origin" "FindingOrigin" NOT NULL DEFAULT 'REVIEWER'`);
    expect(body).not.toMatch(/\bINSERT\b|\bUPDATE\s+"/i);
  });

  it("the policy-source-monitoring migration (Oct 31) only creates and adds, with history on RESTRICT and monitoring off by default", () => {
    const body = statements("20261031160000_policy_source_monitoring");
    const kinds = body
      .split(";")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.match(/^(CREATE TYPE|CREATE TABLE|CREATE INDEX|ALTER TYPE "\w+" ADD VALUE IF NOT EXISTS|ALTER TABLE "\w+" ADD COLUMN|ALTER TABLE "\w+" ADD CONSTRAINT)/)?.[1] ?? l.slice(0, 60));
    for (const k of kinds) expect(k).toMatch(/^(CREATE TYPE|CREATE TABLE|CREATE INDEX|ALTER TYPE "\w+" ADD VALUE IF NOT EXISTS|ALTER TABLE "\w+" ADD (COLUMN|CONSTRAINT))$/);
    expect([...body.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1])).toEqual(["PolicySourceSnapshot", "PolicySourceChangeProposal"]);
    expect(body).not.toMatch(/ALTER COLUMN|\bINSERT\b|\bUPDATE\s+"/i);
    // Existing sources are not monitored until an admin turns it on.
    expect(body).toContain(`"monitoringEnabled" BOOLEAN NOT NULL DEFAULT false`);
    expect(body).toContain(`"checkIntervalHours" INTEGER NOT NULL DEFAULT 24`);
    // Snapshots, proposals and their reviewers are history: nothing cascades.
    for (const m of body.matchAll(/ON DELETE (\w+)/g)) expect(m[1]).toBe("RESTRICT");
    expect(body).toMatch(/"PolicySourceChangeProposal" ADD CONSTRAINT[^;]*"resultingVersionId"[^;]*REFERENCES "PolicyRuleVersion"/);
  });
});
