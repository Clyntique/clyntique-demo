// READ-ONLY pre-flight for the Oct 20 migrations on an EXISTING database.
// Connects, reads catalog data, writes nothing. Prints names and counts only:
// no connection string, user list, emails or secrets.
//
//   npm run db:preflight
//
// Answers: which database am I on; can this role CREATE DATABASE (second
// logical database on the same Render instance); is the migration history in
// the expected state; would the two new migrations collide with anything;
// is anything holding long locks right now.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Row = Record<string, unknown>;
const q = (sql: string) => prisma.$queryRawUnsafe<Row[]>(sql);

const EXPECTED_APPLIED = [
  "0_init",
  "20261009180000_submission_workflow",
  "20261011090000_evidence_files",
  "20261012190000_round_snapshot",
  "20261014220000_compliance_policy_library",
];
const NEW_MIGRATIONS = ["20261019180000_reviewer_chat", "20261019190000_lifecycle_records"];
const NEW_TABLES = ["Conversation", "Message", "AIScanRun", "AIScanRuleCheck", "ExternalSubmission", "ExternalOutcome", "PolicyRuleEvent"];
const NEW_TYPES = ["ReviewCycleReason", "AIScanStatus", "ExternalDestinationType", "ExternalRecordBasis", "ExternalOutcomeKind", "PolicyRuleEventKind"];
const NEW_COLUMNS: [string, string][] = [["ReviewCycle", "reasonKind"], ["ReviewCycle", "triggerRuleVersionId"]];
// Tables the new foreign keys point at; they must exist before the apply.
const REFERENCED = ["User", "Creative", "CreativeVersion", "ReviewCycle", "SubmissionRound", "Evidence", "AdPlatform", "Market", "PolicyRule", "PolicyRuleVersion"];

async function main() {
  const problems: string[] = [];
  const [info] = await q(`SELECT current_database() AS db, current_user AS usr, current_setting('server_version') AS version,
      pg_size_pretty(pg_database_size(current_database())) AS size, current_setting('max_connections')::int AS max_conn`);
  const [role] = await q(`SELECT rolcreatedb, rolsuper FROM pg_roles WHERE rolname = current_user`);
  console.log(`Database:        ${info.db}  (PostgreSQL ${info.version}, size ${info.size})`);
  console.log(`Role can CREATE DATABASE: ${role.rolcreatedb ? "YES" : "NO"}${role.rolsuper ? " (superuser)" : ""}`);

  const dbs = await q(`SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname`);
  console.log(`Databases on this instance: ${dbs.map((d) => d.datname).join(", ")}`);
  if (dbs.some((d) => d.datname === "clyntique_demo_preview")) console.log("  note: clyntique_demo_preview already exists");

  const [conn] = await q(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_tx,
      count(*) FILTER (WHERE state <> 'idle' AND now() - xact_start > interval '30 seconds')::int AS long_tx
      FROM pg_stat_activity WHERE datname = current_database()`);
  console.log(`Connections to this database: ${conn.total} of max ${info.max_conn}; idle in transaction: ${conn.idle_in_tx}; transactions older than 30 s: ${conn.long_tx}`);
  if (Number(conn.idle_in_tx) > 0 || Number(conn.long_tx) > 0) problems.push("a transaction is being held open; the ADD COLUMN on ReviewCycle would queue behind it (lock_timeout would then abort the apply)");

  const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).map((r) => String(r.table_name));
  console.log(`\nTables: ${tables.length}`);

  console.log(`\nMigration history (_prisma_migrations):`);
  if (!tables.includes("_prisma_migrations")) {
    problems.push("_prisma_migrations is missing: this database is not managed by Prisma Migrate");
    console.log("  MISSING");
  } else {
    const rows = await q(`SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at`);
    for (const r of rows) console.log(`  ${String(r.migration_name).padEnd(44)} finished=${r.finished} rolled_back=${r.rolled_back}`);
    for (const name of EXPECTED_APPLIED) {
      const r = rows.find((x) => x.migration_name === name);
      if (!r || !r.finished || r.rolled_back) problems.push(`migration ${name} is not recorded as applied`);
    }
    for (const name of NEW_MIGRATIONS) {
      const r = rows.find((x) => x.migration_name === name);
      if (r) console.log(`  note: ${name} already has a history row (finished=${r.finished}, rolled_back=${r.rolled_back})`);
    }
    const unexpected = rows.filter((r) => !EXPECTED_APPLIED.includes(String(r.migration_name)) && !NEW_MIGRATIONS.includes(String(r.migration_name)));
    if (unexpected.length) problems.push(`unknown migration rows: ${unexpected.map((r) => r.migration_name).join(", ")}`);
  }

  console.log(`\nReferenced tables present:`);
  for (const t of REFERENCED) {
    const ok = tables.includes(t);
    if (!ok) problems.push(`referenced table ${t} is missing`);
    console.log(`  ${t.padEnd(20)} ${ok ? "yes" : "MISSING"}`);
  }

  console.log(`\nCollision check (expected: none of these exist yet):`);
  const types = (await q(`SELECT typname FROM pg_type WHERE typtype = 'e'`)).map((r) => String(r.typname));
  const cols = await q(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ReviewCycle'`);
  const existingTables = NEW_TABLES.filter((t) => tables.includes(t));
  const existingTypes = NEW_TYPES.filter((t) => types.includes(t));
  const existingCols = NEW_COLUMNS.filter(([t, c]) => cols.some((r) => r.table_name === t && r.column_name === c)).map(([t, c]) => `${t}.${c}`);
  console.log(`  tables already present:  ${existingTables.join(", ") || "none"}`);
  console.log(`  types already present:   ${existingTypes.join(", ") || "none"}`);
  console.log(`  columns already present: ${existingCols.join(", ") || "none"}`);
  const partial = existingTables.length + existingTypes.length + existingCols.length;
  const all = NEW_TABLES.length + NEW_TYPES.length + NEW_COLUMNS.length;
  const alreadyApplied = partial === all;
  if (partial > 0 && !alreadyApplied) problems.push("some new objects already exist: a partial earlier apply? Run the matching rollback script (IF EXISTS) before applying");

  console.log(`\nVerdict:`);
  console.log(`  second logical database on this instance: ${role.rolcreatedb ? "POSSIBLE (role has CREATEDB)" : "NOT POSSIBLE with this role (no CREATEDB)"}`);
  console.log(`  apply both migrations to THIS database:   ${alreadyApplied ? "ALREADY APPLIED (all new objects exist)" : problems.length ? "NOT READY" : "READY (additive only; export first)"}`);
  for (const p of problems) console.log(`    - ${p}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "Preflight failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
