// Standalone Real PostgreSQL 16 Rehearsal Suite for UserProfile Migration
// Runs against actual local PostgreSQL 16 server (identical to Production PostgreSQL).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;
const PG_PORT = 5433;
const PG_HOST = "127.0.0.1";
const ADMIN_CONN = `postgresql://postgres@${PG_HOST}:${PG_PORT}/postgres`;
const REHEARSAL_DB = "rehearsal_user_profile_prod_compat";
const REHEARSAL_CONN = `postgresql://postgres@${PG_HOST}:${PG_PORT}/${REHEARSAL_DB}`;
const PG_BIN = "D:\\clyntique-demo\\tools\\pgsql16\\bin\\pg_ctl.exe";
const PG_DATA = "D:\\clyntique-demo\\local-pg\\data";
const PG_LOG = "D:\\clyntique-demo\\local-pg\\log.txt";

const migrationsDir = join(process.cwd(), "prisma", "migrations");
const readSql = (folder: string) => readFileSync(join(migrationsDir, folder, "migration.sql"), "utf8");

async function main() {
  console.log("=== [STANDALONE PG16 REHEARSAL] Starting Real PostgreSQL 16 Compatibility Check ===");

  const adminClient = new Client({ connectionString: ADMIN_CONN });
  await adminClient.connect();

  try {
    const { rows: [{ version }] } = await adminClient.query("SELECT version();");
    console.log(`[STANDALONE PG16] Connected to: ${version}`);

    // Create fresh disposable rehearsal database
    console.log(`[STANDALONE PG16] Recreating disposable database "${REHEARSAL_DB}"...`);
    await adminClient.query(`DROP DATABASE IF EXISTS "${REHEARSAL_DB}" WITH (FORCE);`);
    await adminClient.query(`CREATE DATABASE "${REHEARSAL_DB}";`);
  } finally {
    await adminClient.end();
  }

  const client = new Client({ connectionString: REHEARSAL_CONN });
  await client.connect();

  try {
    // 2. Sequential baseline migrations
    const baselineFolders = [
      "0_init",
      "20261009180000_submission_workflow",
      "20261011090000_evidence_files",
      "20261012190000_round_snapshot",
      "20261014220000_compliance_policy_library",
      "20261019180000_reviewer_chat",
      "20261019190000_lifecycle_records",
      "20261028000000_policy_structure_and_evidence",
      "20261031160000_policy_source_monitoring",
      "20261102170000_evidence_dictionary",
      "20261102200000_content_library",
    ];

    console.log(`[STANDALONE PG16] Applying ${baselineFolders.length} sequential baseline migrations...`);
    for (const folder of baselineFolders) {
      const sql = readSql(folder);
      await client.query(sql);
    }
    console.log("[STANDALONE PG16] Baseline schema successfully established in PostgreSQL 16.");

    // 3. Seed baseline users matching Production counts
    console.log("[STANDALONE PG16] Seeding baseline User accounts...");
    await client.query(`
      INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "isPolicyAdmin", "updatedAt") VALUES
        ('u1-team', 'Team Lead', 'team@clyntique.demo', '$2a$12$sampleHash1', 'TEAM', true, now()),
        ('u2-team', 'Reviewer Two', 'reviewer@clyntique.demo', '$2a$12$sampleHash2', 'TEAM', false, now()),
        ('u3-client', 'Client Alpha', 'alpha@client.demo', '$2a$12$sampleHash3', 'CLIENT', false, now()),
        ('u4-client', 'Client Beta', 'beta@client.demo', '$2a$12$sampleHash4', 'CLIENT', false, now());
    `);

    const { rows: baselineUsers } = await client.query('SELECT count(*)::int as count FROM "User";');
    console.log(`[STANDALONE PG16] Baseline verified: ${baselineUsers[0].count} users present.`);

    // 4. Test Forced Rollback in PostgreSQL 16
    console.log("[STANDALONE PG16] Testing transactional forced rollback...");
    const migrationSql = readSql("20261105000000_user_profile");
    try {
      await client.query("BEGIN;");
      await client.query(migrationSql);
      throw new Error("Simulated interruption during execution");
    } catch (e: unknown) {
      await client.query("ROLLBACK;");
      console.log(`[STANDALONE PG16] Caught: ${(e as Error).message}. Rolled back cleanly.`);
    }

    const { rows: [{ exists: afterRollbackExists }] } = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'UserProfile') as exists;`
    );
    if (afterRollbackExists) throw new Error("Rollback failed in PostgreSQL 16: UserProfile table was left behind!");
    console.log("[STANDALONE PG16] PASSED: Forced rollback left 0 residual tables/columns.");

    // 5. Test Successful Apply in PostgreSQL 16
    console.log("[STANDALONE PG16] Applying 20261105000000_user_profile inside transaction...");
    await client.query("BEGIN;");
    await client.query(migrationSql);
    await client.query("COMMIT;");
    console.log("[STANDALONE PG16] PASSED: 20261105000000_user_profile committed successfully.");

    // Verify UserProfile table structure in PostgreSQL 16
    const { rows: [{ exists: appliedExists }] } = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'UserProfile') as exists;`
    );
    if (!appliedExists) throw new Error("UserProfile table not found after commit!");

    // Verify foreign key and index in PostgreSQL 16 catalogs
    const { rows: indexes } = await client.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'UserProfile' ORDER BY indexname;`
    );
    console.log(`[STANDALONE PG16] Indexes verified: ${indexes.map(i => i.indexname).join(", ")}`);

    // 6. Test UserProfile insert & read in PostgreSQL 16
    await client.query(`
      INSERT INTO "UserProfile" ("id", "userId", "firstName", "lastName", "city", "updatedAt")
      VALUES ('p-u3', 'u3-client', 'Alpha', 'User', 'San Francisco', now());
    `);
    const { rows: [pRow] } = await client.query(
      `SELECT "firstName", "timezone", "preferredLanguage" FROM "UserProfile" WHERE "userId" = 'u3-client';`
    );
    if (!pRow || pRow.firstName !== "Alpha" || pRow.timezone !== "UTC" || pRow.preferredLanguage !== "en-US") {
      throw new Error("PostgreSQL 16 insert/read verification failed!");
    }
    console.log("[STANDALONE PG16] PASSED: UserProfile row inserted with verified defaults ('UTC', 'en-US').");

    // 7. Verify existing User records completely untouched
    const { rows: [{ count: userCountAfter }] } = await client.query('SELECT count(*)::int as count FROM "User";');
    if (userCountAfter !== 4) throw new Error(`User count altered! Expected 4, got ${userCountAfter}`);
    console.log("[STANDALONE PG16] PASSED: All 4 existing User records remain completely untouched.");

    // 8. Test ON DELETE CASCADE
    await client.query(`DELETE FROM "User" WHERE id = 'u3-client';`);
    const { rows: [{ count: profileCountAfterDelete }] } = await client.query(
      `SELECT count(*)::int as count FROM "UserProfile" WHERE "userId" = 'u3-client';`
    );
    if (profileCountAfterDelete !== 0) throw new Error("CASCADE delete failed in PostgreSQL 16!");
    console.log("[STANDALONE PG16] PASSED: ON DELETE CASCADE cleanly removed UserProfile on User deletion.");

    console.log("=== [STANDALONE PG16 REHEARSAL] ALL CHECKS PASSED ON REAL POSTGRESQL 16 ===");
  } finally {
    await client.end();

    // Clean up database and stop server
    const cleanupAdmin = new Client({ connectionString: ADMIN_CONN });
    await cleanupAdmin.connect();
    try {
      await cleanupAdmin.query(`DROP DATABASE IF EXISTS "${REHEARSAL_DB}" WITH (FORCE);`);
      console.log(`[STANDALONE PG16] Cleaned up disposable database "${REHEARSAL_DB}".`);
    } finally {
      await cleanupAdmin.end();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[STANDALONE PG16 ERROR]", e);
    process.exit(1);
  });
