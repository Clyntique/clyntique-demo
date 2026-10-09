// READ-ONLY logical backup: copies every row of every public table to JSON
// files in a folder OUTSIDE this repository. Never writes to the database.
//
//   npm run db:export -- --out D:\clyntique-demo\db-backups
//
// The export contains password hashes and all test content: keep it private
// and never commit it. Prints only table names and row counts.
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const flag = process.argv.indexOf("--out");
const outRoot = flag > -1 ? process.argv[flag + 1] : undefined;
if (!outRoot) throw new Error("Pass --out <folder outside the repository>.");
const repo = resolve(__dirname, "..");
const rel = relative(repo, resolve(outRoot));
const insideRepo = rel === "" || (!rel.startsWith("..") && !resolve(outRoot).startsWith("\\\\") && !/^[a-z]:/i.test(rel));
if (insideRepo) throw new Error("Refusing to write a backup inside the repository. Choose a folder outside it.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(resolve(outRoot!), `clyntique-${stamp}`);
  mkdirSync(dir, { recursive: true });

  // REPEATABLE READ: every table is read from the same snapshot.
  await prisma.$transaction(
    async (tx) => {
      const tables = await tx.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
      );
      const manifest: Record<string, number> = {};
      for (const { table_name } of tables) {
        const rows = await tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table_name.replace(/"/g, '""')}"`);
        writeFileSync(join(dir, `${table_name}.json`), JSON.stringify(rows, null, 2));
        manifest[table_name] = rows.length;
        console.log(`  ${table_name.padEnd(22)} ${rows.length}`);
      }
      writeFileSync(join(dir, "_manifest.json"), JSON.stringify({ exportedAt: new Date().toISOString(), tables: manifest }, null, 2));
    },
    // maxWait: opening a first connection to Render can take several seconds.
    { isolationLevel: "RepeatableRead", maxWait: 30_000, timeout: 120_000 },
  );
  console.log(`\nExport written to ${dir}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "Export failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
