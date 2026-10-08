// Verifies the DATABASE_URL connection and lists the public tables.
// Read-only. Run with: npm run db:check
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const [{ ok }] = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
  const [{ version }] = await prisma.$queryRaw<{ version: string }[]>`SELECT current_setting('server_version') AS version`;
  console.log(`Connection OK (SELECT 1 = ${ok}), PostgreSQL ${version}`);

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  console.log(`Tables (${tables.length}): ${tables.map((t) => t.table_name).join(", ") || "none"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
