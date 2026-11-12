// Manual, guarded clean-up of old knowledge-search questions (KnowledgeQuery).
// PREPARED, NOT ACTIVE: nothing schedules this script, and it deletes nothing
// until a retention period has been approved by the CEO.
//
// Dry run (default; reads counts, writes nothing):
//   npx tsx prisma/knowledge-query-retention.ts
// To delete (only after the CEO approved a retention period AND this run):
//   KNOWLEDGE_QUERY_RETENTION_DAYS=<approved days> RETENTION_CONFIRM_DATABASE=<database name> \
//     npx tsx prisma/knowledge-query-retention.ts --retention-approved --apply
//
// Guarantees:
// - Disabled unless KNOWLEDGE_QUERY_RETENTION_DAYS is a whole number of days
//   in the accepted range (src/lib/knowledge/retention.ts). Unset = no-op.
// - Writes need --apply AND --retention-approved AND RETENTION_CONFIRM_DATABASE
//   equal to the database name. Any one missing: dry run or refusal.
// - Deletes only KnowledgeQuery rows older than the period. Uploaded
//   documents, passages, evidence records, submissions, compliance and policy
//   history, messages, audit events and accounts are never touched.
// - One transaction: every other table is counted before and after, and the
//   question log must shrink by exactly the number of expired rows. Any
//   difference rolls everything back.
// - Never prints questions, connection strings or secrets: counts only.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { purgeExpiredQuestionLogs, RETENTION_ENV } from "../src/lib/knowledge/retention";
import { databaseNameOf } from "./seed-plan";

const LOG_TABLE = "KnowledgeQuery";

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const approved = argv.includes("--retention-approved");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const dbName = databaseNameOf(connectionString);
  if (apply && !approved) throw new Error("Deleting needs --retention-approved (only after the CEO approved a retention period). Nothing was changed.");
  if (apply && process.env.RETENTION_CONFIRM_DATABASE !== dbName) throw new Error(`To delete, set RETENTION_CONFIRM_DATABASE=${dbName}. Nothing was changed.`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 30_000 }) });
  try {
    console.log(`Database: ${dbName}${apply ? "" : " (dry run, nothing written)"}`);
    if (!apply) {
      const outcome = await purgeExpiredQuestionLogs(prisma);
      if (!outcome.enabled) return console.log(outcome.reason);
      console.log(`${RETENTION_ENV}: ${outcome.days} days. Cut-off: ${outcome.cutoff.toISOString()}.`);
      console.log(`Question-log rows: ${outcome.total}; older than the cut-off: ${outcome.eligible}. Nothing was deleted.`);
      return;
    }

    await prisma.$transaction(
      async (tx) => {
        const others = async () => {
          const tables = await tx.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
          const counts: Record<string, number> = {};
          for (const { table_name } of tables) {
            if (table_name === LOG_TABLE) continue;
            if (!/^[A-Za-z0-9_]+$/.test(table_name)) throw new Error("Unexpected table name; nothing was changed.");
            const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table_name}"`);
            counts[table_name] = Number(n);
          }
          return counts;
        };
        const before = await others();
        const outcome = await purgeExpiredQuestionLogs(tx, { apply: true });
        if (!outcome.enabled) throw new Error(outcome.reason);
        const [after, remaining] = [await others(), await tx.knowledgeQuery.count()];
        if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("Another table changed during the clean-up; everything was rolled back.");
        if (outcome.deleted !== outcome.eligible || remaining !== outcome.total - outcome.deleted) throw new Error("The question log did not shrink by exactly the expired rows; everything was rolled back.");
        console.log(`${RETENTION_ENV}: ${outcome.days} days. Cut-off: ${outcome.cutoff.toISOString()}.`);
        console.log(`Deleted ${outcome.deleted} question-log rows; ${remaining} remain. ${Object.keys(before).length} other tables checked: unchanged.`);
      },
      { maxWait: 30_000, timeout: 120_000, isolationLevel: "RepeatableRead" },
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed.");
  process.exit(1);
});
