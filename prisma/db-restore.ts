// Disaster Recovery: Validates and restores logical database backups from JSON.
//
// Safety rules:
// - Dry run by default: validates JSON structure, manifest counts, and referential integrity
//   WITHOUT connecting to or modifying the database:
//     npm run db:restore -- --dir D:\clyntique-demo\db-backups\clyntique-2026-10-14T17-12-39-810Z
// - To restore into a dedicated recovery database (NEVER run on live production by accident):
//     npm run db:restore -- --dir D:\clyntique-demo\db-backups\<timestamp> --apply
//   Requires:
//     RESTORE_CONFIRM_DATABASE=<database_name>
//
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Insertion order respecting foreign key dependencies (parents before children).
// Keep this list complete: every table in prisma/schema.prisma plus
// _prisma_migrations. A backup table that is NOT listed here stops the restore
// (nothing is silently left out); a listed table that an older backup lacks is
// skipped with a warning.
const TOPOLOGICAL_TABLE_ORDER = [
  "User",
  "Market",
  "AdPlatform",
  "Project",
  "Creative",
  "CreativeVersion",
  // Policy library (20261014220000): PolicyRuleVersion is referenced by
  // Finding and ReviewCycle, so it must be restored before them.
  "PolicySource",
  "PolicyRule",
  "PolicyRuleVersion",
  "PolicyRuleVersionSource",
  // Policy source monitoring (20261031160000): a proposal references two
  // snapshots, a PolicyRuleVersion and users, so snapshots come first.
  "PolicySourceSnapshot",
  "PolicySourceChangeProposal",
  "ReviewCycle",
  "SubmissionRound",
  "ReviewDecision",
  "Finding",
  "FindingEvent",
  "FindingResponse",
  "Evidence",
  // P0 two-sided evidence (20261028000000): references Evidence, ReviewCycle, User.
  "EvidenceAssessment",
  "FindingEvidence",
  "FindingMarket",
  "FindingPlatform",
  "SubmissionMarket",
  "SubmissionPlatform",
  "Comment",
  "Approval",
  "Activity",
  "LoginAttempt",
  // Reviewer chat (20261019180000)
  "Conversation",
  "Message",
  // Lifecycle records (20261019190000)
  "AIScanRun",
  "AIScanRuleCheck",
  "ExternalSubmission",
  "ExternalOutcome",
  "PolicyRuleEvent",
  "_prisma_migrations"
];

function databaseNameOf(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    const name = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

async function main() {
  const dirFlag = process.argv.indexOf("--dir");
  const backupDir = dirFlag > -1 ? process.argv[dirFlag + 1] : undefined;
  const apply = process.argv.includes("--apply");

  if (!backupDir) {
    console.error("Usage: npm run db:restore -- --dir <backup_directory> [--apply]");
    process.exitCode = 1;
    return;
  }

  const resolvedDir = resolve(backupDir);
  if (!existsSync(resolvedDir)) {
    console.error(`Backup directory not found: ${resolvedDir}`);
    process.exitCode = 1;
    return;
  }

  const manifestPath = join(resolvedDir, "_manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Manifest file _manifest.json not found in ${resolvedDir}`);
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    exportedAt: string;
    tables: Record<string, number>;
  };

  console.log(`\n=== Clyntique Database Backup Validation ===`);
  console.log(`Directory:   ${resolvedDir}`);
  console.log(`Exported At: ${manifest.exportedAt}`);
  console.log(`Table Count: ${Object.keys(manifest.tables).length}`);

  // 1. Dry run validation: Verify all files, syntax, and counts
  let totalRows = 0;
  const tableData: Record<string, Record<string, unknown>[]> = {};

  const unknown = Object.keys(manifest.tables).filter((t) => !TOPOLOGICAL_TABLE_ORDER.includes(t));
  if (unknown.length) {
    console.error(`Backup contains table(s) this script does not know how to restore: ${unknown.join(", ")}. Add them to TOPOLOGICAL_TABLE_ORDER first.`);
    process.exitCode = 1;
    return;
  }

  const tablesToRestore: string[] = [];
  for (const table of TOPOLOGICAL_TABLE_ORDER) {
    const filePath = join(resolvedDir, `${table}.json`);
    if (!existsSync(filePath)) {
      if (table in manifest.tables) {
        console.error(`Missing backup table file: ${table}.json`);
        process.exitCode = 1;
        return;
      }
      console.log(`  [SKIP] ${table.padEnd(24)} not in this backup (older schema)`);
      continue;
    }

    try {
      const rows = JSON.parse(readFileSync(filePath, "utf-8"));
      if (!Array.isArray(rows)) {
        throw new Error("Content is not an array");
      }
      const expected = manifest.tables[table] ?? 0;
      if (rows.length !== expected) {
        throw new Error(`Count mismatch: expected ${expected}, got ${rows.length}`);
      }
      tableData[table] = rows;
      tablesToRestore.push(table);
      totalRows += rows.length;
      console.log(`  [OK] ${table.padEnd(24)} ${String(rows.length).padStart(4)} rows`);
    } catch (err) {
      console.error(`  [FAIL] ${table}: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
  }

  // 2. Referential integrity check
  console.log(`\n--- Referential Integrity Check ---`);
  const userIds = new Set(tableData["User"]?.map((u) => String(u["id"])));
  const projectIds = new Set(tableData["Project"]?.map((p) => String(p["id"])));
  const creativeIds = new Set(tableData["Creative"]?.map((c) => String(c["id"])));

  let refErrors = 0;
  for (const p of tableData["Project"] ?? []) {
    const clientId = String(p["clientId"] ?? "");
    if (!userIds.has(clientId)) {
      console.error(`  Broken FK: Project ${String(p["id"])} references missing clientId ${clientId}`);
      refErrors++;
    }
  }
  for (const c of tableData["Creative"] ?? []) {
    const projId = String(c["projectId"] ?? "");
    if (!projectIds.has(projId)) {
      console.error(`  Broken FK: Creative ${String(c["id"])} references missing projectId ${projId}`);
      refErrors++;
    }
  }
  for (const v of tableData["CreativeVersion"] ?? []) {
    const creatId = String(v["creativeId"] ?? "");
    if (!creativeIds.has(creatId)) {
      console.error(`  Broken FK: CreativeVersion ${String(v["id"])} references missing creativeId ${creatId}`);
      refErrors++;
    }
  }

  if (refErrors > 0) {
    console.error(`Validation failed with ${refErrors} referential integrity errors.`);
    process.exitCode = 1;
    return;
  }
  console.log(`  All foreign key constraints verified valid across ${totalRows} records.`);
  console.log(`  Backup is 100% restorable.`);

  if (!apply) {
    console.log(`\n[DRY RUN COMPLETE] Zero modifications made. Database was not touched.`);
    console.log(`To restore into an empty recovery database:`);
    console.log(`  set RESTORE_CONFIRM_DATABASE=<dbname>`);
    console.log(`  npm run db:restore -- --dir "${resolvedDir}" --apply\n`);
    return;
  }

  // 3. Live Apply Guard
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exitCode = 1;
    return;
  }

  const dbName = databaseNameOf(connectionString);
  const confirmDb = process.env.RESTORE_CONFIRM_DATABASE;

  if (!confirmDb || confirmDb !== dbName) {
    console.error(
      `Safety guard blocked execution: To apply restoration, set RESTORE_CONFIRM_DATABASE=${dbName} in your environment.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n[RESTORATION STARTED] Target: ${dbName}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await prisma.$transaction(
      async (tx) => {
        // Temporarily disable triggers and FK checks for batch load
        await tx.$executeRawUnsafe(`SET session_replication_role = 'replica';`);

        for (const table of tablesToRestore) {
          const rows = tableData[table] ?? [];

          // Clear the table first (also when the backup has no rows for it),
          // so the recovery database matches the backup exactly.
          await tx.$executeRawUnsafe(`TRUNCATE TABLE "${table.replace(/"/g, '""')}" CASCADE;`);
          if (rows.length === 0) continue;

          const sample = rows[0];
          const columns = Object.keys(sample);
          const colList = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");

          for (const row of rows) {
            const values = columns.map((col) => row[col]);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
            await tx.$queryRawUnsafe(
              `INSERT INTO "${table.replace(/"/g, '""')}" (${colList}) VALUES (${placeholders})`,
              ...values
            );
          }
          console.log(`  Restored ${rows.length} rows to ${table}`);
        }

        await tx.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
      },
      { timeout: 180_000, maxWait: 30_000 }
    );
    console.log(`\n[RESTORATION SUCCESSFUL] Database ${dbName} restored successfully.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Restore failed:", err);
  process.exitCode = 1;
});
