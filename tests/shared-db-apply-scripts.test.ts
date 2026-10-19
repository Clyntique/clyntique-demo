import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The apply scripts in docs/core-workflow-sprint-oct19/sql are the migration
// files with a timeout header, for running one migration as a single
// transaction on an existing (shared) database. Their body must stay identical
// to the migration Prisma records, or `migrate resolve --applied` would record
// a checksum for SQL that was never run.
const CASES = [
  ["20261019180000_reviewer_chat", "apply-reviewer_chat.sql"],
  ["20261019190000_lifecycle_records", "apply-lifecycle_records.sql"],
] as const;

describe("shared-database apply scripts", () => {
  for (const [migration, script] of CASES) {
    it(`${script} is the ${migration} migration plus the timeout header`, () => {
      const migrationSql = readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8");
      const applySql = readFileSync(`docs/core-workflow-sprint-oct19/sql/${script}`, "utf8");
      const header = applySql.slice(0, applySql.length - migrationSql.length);
      expect(applySql.endsWith(migrationSql)).toBe(true);
      expect(header).toMatch(/SET lock_timeout = '5s';\s*SET statement_timeout = '120s';\s*$/);
      expect(header.split("\n").filter((l) => l && !l.startsWith("--") && !l.startsWith("SET "))).toEqual([]);
    });
  }

  it("rollback scripts drop only the objects the migrations add, inside one transaction", () => {
    const life = readFileSync("docs/core-workflow-sprint-oct19/sql/rollback-lifecycle-records.sql", "utf8");
    const chat = readFileSync("docs/core-workflow-sprint-oct19/sql/rollback-reviewer-chat.sql", "utf8");
    for (const sql of [life, chat]) {
      expect(sql.trim().startsWith("--")).toBe(true);
      expect(sql).toMatch(/^BEGIN;/m);
      expect(sql.trim().endsWith("COMMIT;")).toBe(true);
      expect(sql).not.toMatch(/DROP (TABLE|TYPE) (IF EXISTS )?"(User|Creative|CreativeVersion|ReviewCycle|Finding|Evidence|PolicyRule|PolicyRuleVersion|PolicySource)"/);
      expect(sql).not.toMatch(/TRUNCATE|DELETE FROM "(?!_prisma_migrations")/);
    }
    const dropped = (sql: string) => [...sql.matchAll(/DROP TABLE IF EXISTS "(\w+)"/g)].map((m) => m[1]);
    expect(dropped(life)).toEqual(["ExternalOutcome", "ExternalSubmission", "AIScanRuleCheck", "AIScanRun", "PolicyRuleEvent"]);
    expect(dropped(chat)).toEqual(["Message", "Conversation"]);
    expect(life).toMatch(/DROP COLUMN IF EXISTS "reasonKind"/);
    expect(life).toMatch(/DROP COLUMN IF EXISTS "triggerRuleVersionId"/);
    expect([...life.matchAll(/DROP TYPE IF EXISTS "(\w+)"/g)].map((m) => m[1]).sort()).toEqual(
      ["AIScanStatus", "ExternalDestinationType", "ExternalOutcomeKind", "ExternalRecordBasis", "PolicyRuleEventKind", "ReviewCycleReason"],
    );
  });
});
