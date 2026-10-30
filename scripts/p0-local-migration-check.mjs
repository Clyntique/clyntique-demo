// P0 migration check on a DISPOSABLE LOCAL database (local validation, Oct 29).
//
// Rebuilds the database at the pre-P0 schema exactly as Prisma records it,
// then runs the Production procedure: apply (one transaction) -> migrate
// resolve -> migrate status -> migrate diff; rollback; re-apply; and finally
// checks that the rollback REFUSES while P0 data exists.
//
//   DATABASE_URL=postgresql://postgres@localhost:5433/p0_local_mig node scripts/p0-local-migration-check.mjs --reset
//
// Safety: refuses any host but localhost / 127.0.0.1 and any database whose
// name doesn't start with "p0_local". --reset is required because it drops the
// database's public schema. Never prints the connection string.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { Client } = createRequire(import.meta.url)("pg");
const P0 = "20261028000000_policy_structure_and_evidence";
const APPLY = "docs/p0-policy-evidence/sql/apply-policy_structure_and_evidence.sql";
const ROLLBACK = "docs/p0-policy-evidence/sql/rollback-policy-structure-and-evidence.sql";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
const dbName = url.pathname.slice(1);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Refusing: DATABASE_URL must point at a local database.");
if (!dbName.startsWith("p0_local")) throw new Error("Refusing: the database name must start with p0_local.");
if (!process.argv.includes("--reset")) throw new Error("Pass --reset: this drops and rebuilds the local database's schema.");

const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${note ? ` (${note})` : ""}`);
};
const run = (cmd) => {
  try {
    return { ok: true, out: execSync(cmd, { stdio: "pipe", encoding: "utf8", env: process.env }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (sql) => (await db.query(sql)).rows[0];
const exists = async (table) => (await one(`SELECT to_regclass('public."${table}"') AS t`)).t !== null;
const hasColumn = async (table, column) =>
  Number((await one(`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`)).n) === 1;

// 1. Pre-P0 schema, recorded the way `prisma migrate deploy` records it.
await db.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
await db.query(`CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const m of migrations.filter((m) => m < P0)) {
  const sql = readFileSync(join("prisma/migrations", m, "migration.sql"), "utf8");
  await db.query(sql);
  await db.query(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (gen_random_uuid()::text, $1, now(), $2, 1)`, [
    createHash("sha256").update(sql).digest("hex"),
    m,
  ]);
}
const status0 = run("npx prisma migrate status");
check("pre-P0 database: exactly the P0 migration is pending", /Following migration have not yet been applied:\s+20261028000000_policy_structure_and_evidence/.test(status0.out));

async function applyP0(label) {
  const apply = run(`npx prisma db execute --file ${APPLY}`);
  const resolve = apply.ok && run(`npx prisma migrate resolve --applied ${P0}`);
  check(`${label}: apply script + migrate resolve`, apply.ok && resolve.ok, apply.ok ? "" : apply.out.split("\n").slice(-3).join(" "));
  check(`${label}: migrate status up to date`, /Database schema is up to date/.test(run("npx prisma migrate status").out));
  check(`${label}: migrate diff shows no drift`, run("npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code").ok);
  check(`${label}: EvidenceAssessment table and new columns exist`, (await exists("EvidenceAssessment")) && (await hasColumn("Creative", "industry")));
}

// 2. Apply on the empty pre-P0 database.
await applyP0("apply");

// 3. Rollback with no P0 data: removes only P0 objects and its migration row.
const rb = run(`npx prisma db execute --file ${ROLLBACK}`);
const row = await one(`SELECT count(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${P0}'`);
check("rollback (no P0 data) succeeds", rb.ok, rb.ok ? "" : rb.out.split("\n").slice(-3).join(" "));
check("rollback removed EvidenceAssessment, Creative.industry and the migration row", !(await exists("EvidenceAssessment")) && !(await hasColumn("Creative", "industry")) && Number(row.n) === 0);
check("after rollback, earlier tables are intact", (await exists("PolicyRule")) && (await exists("Creative")) && (await exists("Evidence")));
check("after rollback, P0 is pending again", /have not yet been applied:\s+20261028000000/.test(run("npx prisma migrate status").out));

// 4. Re-apply.
await applyP0("re-apply");

// 5. With P0 data present, the rollback refuses and changes nothing.
await db.query(`INSERT INTO "PolicySource" (id, name, "authorityType", "authorityName", "jurisdictionCode", "officialUrl", "sourceKind", "updatedAt")
  VALUES ('p0localcheck', '[LOCAL CHECK] source', 'PLATFORM_POLICY', 'Local check', 'GLOBAL', 'https://example.com/policy', 'PLATFORM_POLICY_PAGE', now())`).catch((e) => {
  throw new Error(`could not insert a P0 test row: ${e.message}`);
});
const refused = run(`npx prisma db execute --file ${ROLLBACK}`);
check("rollback REFUSES while P0 data exists", !refused.ok && /Refusing/.test(refused.out));
check("after the refused rollback, P0 objects and data are untouched", (await exists("EvidenceAssessment")) && Number((await one(`SELECT count(*) AS n FROM "PolicySource" WHERE id = 'p0localcheck'`)).n) === 1);

await db.end();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} PASS · ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
