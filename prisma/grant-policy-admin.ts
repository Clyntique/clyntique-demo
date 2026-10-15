// Secure, one-time script for granting isPolicyAdmin to an authorized TEAM account.
//
// Safety rules:
// - Dry run by default: reports what it would do and writes nothing.
//     npx tsx prisma/grant-policy-admin.ts --email <team-email>
// - To apply:
//     npx tsx prisma/grant-policy-admin.ts --email <team-email> --apply
// - Requires GRANT_CONFIRM_DATABASE=<database_name> matching the target DATABASE_URL,
//   preventing accidental writes against the wrong database.
// - Strictly validates that the target account has role: 'TEAM'. Never grants to CLIENT.
// - Zero hardcoded credentials, user IDs, or passwords.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function parseArgs(argv: string[]) {
  const emailIdx = argv.indexOf("--email");
  const email = emailIdx > -1 ? argv[emailIdx + 1] : process.env.GRANT_POLICY_ADMIN_EMAIL;
  const apply = argv.includes("--apply");
  return { email: email?.trim().toLowerCase(), apply };
}

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
  const { email, apply } = parseArgs(process.argv.slice(2));
  if (!email) {
    console.error("Usage: npx tsx prisma/grant-policy-admin.ts --email <authorized-team-email> [--apply]");
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exitCode = 1;
    return;
  }

  const dbName = databaseNameOf(connectionString);
  const confirmDb = process.env.GRANT_CONFIRM_DATABASE;

  if (apply) {
    if (!confirmDb || confirmDb !== dbName) {
      console.error(
        `Safety check failed: To apply changes, set GRANT_CONFIRM_DATABASE=${dbName} in your environment.\n` +
        `This ensures permissions are never granted to the wrong database by accident.`
      );
      process.exitCode = 1;
      return;
    }
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const hasColumn = (await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='isPolicyAdmin'`
    )).length > 0;

    const users = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; email: string; role: string; isPolicyAdmin?: boolean }>>(
      hasColumn
        ? `SELECT id, name, email, role, "isPolicyAdmin" FROM "User" WHERE email = $1 LIMIT 1`
        : `SELECT id, name, email, role FROM "User" WHERE email = $1 LIMIT 1`,
      email
    );

    const user = users[0];
    if (!user) {
      console.error(`Error: User with email '${email}' not found.`);
      process.exitCode = 1;
      return;
    }

    if (user.role !== "TEAM") {
      console.error(`Security rejection: User '${email}' has role '${user.role}'. Policy Administrator privileges can ONLY be granted to TEAM accounts.`);
      process.exitCode = 1;
      return;
    }

    if (hasColumn && user.isPolicyAdmin) {
      console.log(`Account '${user.name}' (${user.email}) already has isPolicyAdmin = true. No changes needed.`);
      return;
    }

    if (!hasColumn) {
      console.log(`[PRE-MIGRATION VERIFIED] Target Account found:`);
      console.log(`  Name:  ${user.name}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Role:  ${user.role} (Verified TEAM account; eligible for isPolicyAdmin)`);
      console.log(`\nNote: 'isPolicyAdmin' column is not yet in the database. Run this script with --apply immediately after applying migration 20261014220000_compliance_policy_library.`);
      return;
    }

    if (!apply) {
      console.log(`[dry run] Target Account: ${user.name} (${user.email})`);
      console.log(`[dry run] Current Role:   ${user.role}`);
      console.log(`[dry run] Proposed Change: isPolicyAdmin -> true`);
      console.log(`[dry run] Database:       ${dbName}`);
      console.log("\nDry run only. Nothing was modified. Pass --apply and GRANT_CONFIRM_DATABASE to execute.");
      return;
    }

    await prisma.$queryRawUnsafe(
      `UPDATE "User" SET "isPolicyAdmin" = true WHERE email = $1`,
      email
    );

    console.log(`[SUCCESS] Granted Policy Administrator privileges to:`);
    console.log(`  Name:          ${user.name}`);
    console.log(`  Email:         ${user.email}`);
    console.log(`  Role:          ${user.role}`);
    console.log(`  isPolicyAdmin: true`);
    console.log(`  Timestamp:     ${new Date().toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Grant script failed:", err);
  process.exitCode = 1;
});
