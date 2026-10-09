// READ-ONLY inventory of the database DATABASE_URL points to. Writes nothing.
// Prints counts and structure only: no emails, names, passwords or URLs.
//
//   npm run db:inventory
//
// Used before and after the M1A migration (docs/audit/existing-render-db-migration-plan.md).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const M1A_TABLES = [
  "ReviewCycle", "SubmissionRound", "ReviewDecision", "Finding", "FindingEvent", "FindingResponse", "FindingEvidence",
  "Market", "AdPlatform", "SubmissionMarket", "SubmissionPlatform", "FindingMarket", "FindingPlatform", "LoginAttempt",
];
const DEMO_DOMAIN = "@clyntique.demo";

type Row = Record<string, unknown>;
const q = (sql: string) => prisma.$queryRawUnsafe<Row[]>(sql);
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function main() {
  const [{ version }] = await q(`SELECT current_setting('server_version') AS version`);
  const major = Number(String(version).split(".")[0]);
  console.log(`PostgreSQL ${version}${major >= 12 ? "" : "  <-- STOP: M1A needs PostgreSQL 12 or newer"}`);

  const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).map(
    (r) => String(r.table_name),
  );
  console.log(`\nTables (${tables.length}):`);
  for (const t of tables) {
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM ${ident(t)}`);
    console.log(`  ${t.padEnd(22)} ${n}`);
  }

  console.log(`\nMigration history:`);
  if (tables.includes("_prisma_migrations")) {
    const rows = await q(`SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at`);
    for (const r of rows) console.log(`  ${r.migration_name}  finished=${r.finished}  rolled_back=${r.rolled_back}`);
    if (!rows.length) console.log("  _prisma_migrations exists but is empty");
  } else {
    console.log("  none (_prisma_migrations does not exist; expected before baselining)");
  }

  if (tables.includes("User")) {
    const users = await q(`SELECT role::text AS role, (email LIKE '%${DEMO_DOMAIN}') AS demo, count(*)::int AS n FROM "User" GROUP BY 1, 2 ORDER BY 1, 2`);
    console.log(`\nUsers by role (demo = email ends with ${DEMO_DOMAIN}):`);
    for (const u of users) console.log(`  ${String(u.role).padEnd(7)} demo=${u.demo}  ${u.n}`);
    if (users.some((u) => u.demo === false)) console.log("  <-- REVIEW: non-demo accounts exist. Confirm they are dummy data before continuing.");
  }

  if (tables.includes("Creative")) {
    const hasWorkflow = (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Creative' AND column_name='workflow'`)).length > 0;
    const rows = await q(
      hasWorkflow
        ? `SELECT workflow::text AS workflow, status::text AS status, count(*)::int AS n FROM "Creative" GROUP BY 1, 2 ORDER BY 1, 2`
        : `SELECT status::text AS status, count(*)::int AS n FROM "Creative" GROUP BY 1 ORDER BY 1`,
    );
    console.log(`\nCreatives by ${hasWorkflow ? "workflow / status" : "status"}:`);
    for (const r of rows) console.log(`  ${hasWorkflow ? `${r.workflow} / ` : ""}${r.status}  ${r.n}`);
    if (!rows.length) console.log("  none");
  }

  const present = M1A_TABLES.filter((t) => tables.includes(t));
  console.log(`\nM1A tables present: ${present.length}/${M1A_TABLES.length}`);
  const enums = await q(`SELECT t.typname AS name, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname IN ('CreativeStatus','ActivityType','CreativeWorkflow') GROUP BY 1 ORDER BY 1`);
  for (const e of enums) console.log(`  enum ${e.name}: ${e.labels}`);
  if (tables.includes("Market")) console.log(`  markets: ${(await q(`SELECT string_agg(code, ',' ORDER BY "sortOrder") AS c FROM "Market"`))[0].c ?? "none"}`);
  if (tables.includes("AdPlatform")) console.log(`  platforms: ${(await q(`SELECT string_agg(code, ',' ORDER BY "sortOrder") AS c FROM "AdPlatform"`))[0].c ?? "none"}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "Inventory failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
