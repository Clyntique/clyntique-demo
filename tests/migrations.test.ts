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
  it("starts with the 0_init baseline, followed by the submission-workflow and evidence-files migrations", () => {
    expect(folders).toEqual(["0_init", "20261009180000_submission_workflow", "20261011090000_evidence_files"]);
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

  it("contains no destructive statements", () => {
    for (const folder of folders) {
      expect(statements(folder)).not.toMatch(/\b(DROP|RENAME|TRUNCATE|DELETE\s+FROM|UPDATE\s+"|ALTER\s+COLUMN\s+"\w+"\s+(SET\s+DATA\s+)?TYPE)\b/i);
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
});
