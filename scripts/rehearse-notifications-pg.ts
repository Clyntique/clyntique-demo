// Real-PostgreSQL rehearsal for PR D (notifications), Nov 16, 2026.
//
// Runs ONLY against a disposable local server: it refuses any host other than
// 127.0.0.1/localhost and any database whose name does not start with
// "notif_rehearsal". It creates and drops its own databases.
//
//   REHEARSAL_ADMIN_URL=postgresql://postgres@127.0.0.1:5433/postgres \
//   npx tsx --conditions=react-server scripts/rehearse-notifications-pg.ts
//
// Checks:
//  1. `prisma migrate deploy` applies all migrations to an empty database and
//     `prisma migrate status` reports it up to date.
//  2. Additive: on a database with seeded rows, applying the notifications
//     migration leaves every existing table's rows byte-identical.
//  3. Best-effort writes: a failing notification write (bad recipient, missing
//     table) is rolled back to its savepoint and the workflow write commits.
//  4. Deduplication: replays and concurrent transactions with the same key
//     write one row; message rows re-arm (unread again, eventCount + 1).
//  5. Cascades: deleting a conversation / creative / user removes its rows.
//  6. Rollback SQL removes only the new objects; existing rows stay identical.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { notifySafely } from "../src/lib/notifications/emit";

const ADMIN_URL = process.env.REHEARSAL_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:5433/postgres";
const admin = new URL(ADMIN_URL);
if (!["127.0.0.1", "localhost"].includes(admin.hostname)) throw new Error(`Refusing non-local host ${admin.hostname}`);

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");
const folders = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const NEW = "20261116180000_notifications";
const before = folders.filter((f) => f < NEW);

let passed = 0;
function ok(cond: unknown, label: string) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  PASS ${label}`);
}

function urlFor(db: string) {
  if (!db.startsWith("notif_rehearsal")) throw new Error(`Refusing database ${db}`);
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

async function sql(db: string, text: string) {
  const c = new Client({ connectionString: urlFor(db) });
  await c.connect();
  try {
    return await c.query(text);
  } finally {
    await c.end();
  }
}

async function recreate(db: string) {
  urlFor(db);
  const c = new Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS "${db}"`);
  await c.query(`CREATE DATABASE "${db}"`);
  await c.end();
}

async function applyFile(db: string, file: string) {
  await sql(db, readFileSync(file, "utf8"));
}

/** md5 of every row of every base table except the given ones. */
async function fingerprint(db: string, exclude: string[] = []) {
  const tables = (await sql(db, `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((r) => r.tablename as string);
  const out: Record<string, string> = {};
  for (const t of tables.filter((t) => !exclude.includes(t))) {
    const r = await sql(db, `SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x`);
    out[t] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  return out;
}

const SEED = `
INSERT INTO "User" ("id","name","email","passwordHash","role","updatedAt") VALUES
  ('team-1','Team One','t1@rehearsal.invalid','x','TEAM',now()),
  ('team-2','Team Two','t2@rehearsal.invalid','x','TEAM',now()),
  ('client-a','Client A','a@rehearsal.invalid','x','CLIENT',now()),
  ('client-b','Client B','b@rehearsal.invalid','x','CLIENT',now());
INSERT INTO "Project" ("id","name","clientId","updatedAt") VALUES ('p-a','Project A','client-a',now());
INSERT INTO "Creative" ("id","projectId","name","status","workflow","updatedAt") VALUES ('s1','p-a','Spring promo','SUBMITTED','SUBMISSION_REVIEW',now());
INSERT INTO "Conversation" ("id","clientId","creativeId","subjectKey") VALUES ('conv-1','client-a','s1','s1');
INSERT INTO "Message" ("id","conversationId","senderId","senderRole","body") VALUES ('m-1','conv-1','client-a','CLIENT','hello');
INSERT INTO "Activity" ("id","projectId","type","message") VALUES ('act-0','p-a','OTHER','seed');
`;

function prismaFor(db: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlFor(db) }) });
}

const draft = (recipientId: string, dedupeKey: string, extra: Record<string, unknown> = {}) => ({
  recipientId,
  kind: "SUBMISSION_RECEIVED" as const,
  dedupeKey,
  title: "New submission: “Spring promo”",
  href: "/admin/creatives/s1",
  creativeId: "s1",
  ...extra,
});

async function main() {
  console.log(`Rehearsal on ${admin.host}`);

  // 1. migrate deploy on an empty database
  console.log("1. prisma migrate deploy from empty");
  const DB1 = "notif_rehearsal_deploy";
  await recreate(DB1);
  const env = { ...process.env, DATABASE_URL: urlFor(DB1) };
  const deploy = execFileSync("npx", ["prisma", "migrate", "deploy"], { env, encoding: "utf8" });
  ok(deploy.includes(NEW), `migrate deploy applied ${folders.length} migrations including ${NEW}`);
  const status = execFileSync("npx", ["prisma", "migrate", "status"], { env, encoding: "utf8" });
  ok(/Database schema is up to date/.test(status), "migrate status: up to date");
  const diff = execFileSync("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  ok(diff === "" || /No difference/i.test(diff), "schema.prisma matches the migrated database (no drift)");

  // 2. additive on seeded data
  console.log("2. additive migration on seeded rows");
  const DB2 = "notif_rehearsal_data";
  await recreate(DB2);
  for (const f of before) await applyFile(DB2, join(MIGRATIONS, f, "migration.sql"));
  await sql(DB2, SEED);
  const fpBefore = await fingerprint(DB2);
  const t0 = Date.now();
  await sql(DB2, `BEGIN; SET LOCAL lock_timeout = '5s'; ${readFileSync(join(MIGRATIONS, NEW, "migration.sql"), "utf8")} COMMIT;`);
  console.log(`  (applied in ${Date.now() - t0} ms)`);
  const fpAfter = await fingerprint(DB2, ["Notification", "NotificationPreference"]);
  ok(JSON.stringify(fpBefore) === JSON.stringify(fpAfter), `all ${Object.keys(fpBefore).length} existing tables byte-identical after the migration`);
  const newTables = (await sql(DB2, `SELECT tablename FROM pg_tables WHERE tablename IN ('Notification','NotificationPreference') ORDER BY 1`)).rows.map((r) => r.tablename);
  ok(newTables.join(",") === "Notification,NotificationPreference", "both new tables exist");

  const prisma = prismaFor(DB2);
  try {
    // 3. best-effort writes
    console.log("3. failure handling");
    const good = await prisma.$transaction(async (tx) => {
      await tx.activity.create({ data: { id: "act-1", projectId: "p-a", type: "SUBMISSION_SUBMITTED", message: "step 1" } });
      const out = await notifySafely(tx, "rehearsal", "client-a", async () => ({ drafts: [draft("team-1", "round:r1"), draft("team-2", "round:r1")] }));
      return out;
    });
    ok(good.written === 2 && !good.failed, "normal step writes 2 recipient rows");

    const origError = console.error;
    console.error = () => {};
    const bad = await prisma.$transaction(async (tx) => {
      await tx.activity.create({ data: { id: "act-2", projectId: "p-a", type: "SUBMISSION_SUBMITTED", message: "step 2" } });
      const out = await notifySafely(tx, "rehearsal", "client-a", async () => ({ drafts: [draft("no-such-user", "round:r2")] }));
      await tx.activity.create({ data: { id: "act-3", projectId: "p-a", type: "OTHER", message: "after notify" } });
      return out;
    });
    console.error = origError;
    ok(bad.failed, "a foreign-key failure inside notify is reported, not thrown");
    const acts = await prisma.activity.findMany({ where: { id: { in: ["act-2", "act-3"] } } });
    ok(acts.length === 2, "the step's own writes before and after the failed notify committed");
    ok((await prisma.notification.count({ where: { dedupeKey: "round:r2" } })) === 0, "no partial notification rows were left");

    // 4. deduplication
    console.log("4. deduplication");
    for (let i = 0; i < 3; i++) {
      await prisma.$transaction((tx) => notifySafely(tx, "replay", "client-a", async () => ({ drafts: [draft("team-1", "round:r1"), draft("team-2", "round:r1")] })));
    }
    ok((await prisma.notification.count({ where: { dedupeKey: "round:r1" } })) === 2, "3 replays of the same event: still 1 row per recipient");
    await Promise.all(
      Array.from({ length: 8 }, () => prisma.$transaction((tx) => notifySafely(tx, "race", "client-a", async () => ({ drafts: [draft("team-1", "round:r9")] })))),
    );
    ok((await prisma.notification.count({ where: { dedupeKey: "round:r9" } })) === 1, "8 concurrent transactions with one key: 1 row");

    const msg = (recipientId: string) => ({
      recipientId,
      kind: "NEW_MESSAGE" as const,
      dedupeKey: "conversation:conv-1",
      title: "New message from Client A about “Spring promo”",
      href: "/admin/messages/conv-1",
      conversationId: "conv-1",
    });
    for (let i = 0; i < 3; i++) await prisma.$transaction((tx) => notifySafely(tx, "msg", "client-a", async () => ({ coalesce: true, drafts: [msg("team-1")] })));
    let row = await prisma.notification.findUniqueOrThrow({ where: { recipientId_dedupeKey: { recipientId: "team-1", dedupeKey: "conversation:conv-1" } } });
    ok(row.eventCount === 3 && row.readAt === null, "3 messages fold into one unread row with eventCount 3");
    await prisma.notification.update({ where: { id: row.id }, data: { readAt: new Date() } });
    await prisma.$transaction((tx) => notifySafely(tx, "msg", "client-a", async () => ({ coalesce: true, drafts: [msg("team-1")] })));
    row = await prisma.notification.findUniqueOrThrow({ where: { id: row.id } });
    ok(row.eventCount === 1 && row.readAt === null, "a message after reading re-arms the row: unread, eventCount 1");
    await Promise.all(Array.from({ length: 6 }, () => prisma.$transaction((tx) => notifySafely(tx, "msg-race", "client-a", async () => ({ coalesce: true, drafts: [msg("team-2")] })))));
    row = await prisma.notification.findUniqueOrThrow({ where: { recipientId_dedupeKey: { recipientId: "team-2", dedupeKey: "conversation:conv-1" } } });
    ok(row.eventCount === 6, "6 concurrent messages: one row, eventCount 6");

    // preferences
    await prisma.notificationPreference.create({ data: { userId: "team-2", kind: "SUBMISSION_RECEIVED", inApp: false } });
    await prisma.$transaction((tx) => notifySafely(tx, "pref", "client-a", async () => ({ drafts: [draft("team-1", "round:r5"), draft("team-2", "round:r5")] })));
    const r5 = await prisma.notification.findMany({ where: { dedupeKey: "round:r5" }, select: { recipientId: true } });
    ok(r5.length === 1 && r5[0].recipientId === "team-1", "a muted kind is skipped for that user only");

    // 5. cascades
    console.log("5. cascades");
    await prisma.$transaction((tx) => notifySafely(tx, "client", "team-1", async () => ({ drafts: [{ ...msg("client-a"), href: "/dashboard/messages/conv-1" }], coalesce: true })));
    await prisma.message.deleteMany({ where: { conversationId: "conv-1" } });
    await prisma.conversation.delete({ where: { id: "conv-1" } });
    ok((await prisma.notification.count({ where: { conversationId: "conv-1" } })) === 0, "deleting a conversation removes its notifications");
    await prisma.creative.delete({ where: { id: "s1" } });
    ok((await prisma.notification.count({ where: { creativeId: "s1" } })) === 0, "deleting a creative removes its notifications");
    await prisma.user.delete({ where: { id: "team-2" } });
    ok((await prisma.notificationPreference.count({ where: { userId: "team-2" } })) === 0, "deleting a user removes their preferences");
  } finally {
    await prisma.$disconnect();
  }

  // 3b. missing table: the step still commits
  console.log("3b. code ahead of migration (tables missing)");
  const DB3 = "notif_rehearsal_missing";
  await recreate(DB3);
  for (const f of before) await applyFile(DB3, join(MIGRATIONS, f, "migration.sql"));
  await sql(DB3, SEED);
  const p3 = prismaFor(DB3);
  try {
    const origError = console.error;
    console.error = () => {};
    const out = await p3.$transaction(async (tx) => {
      await tx.activity.create({ data: { id: "act-m", projectId: "p-a", type: "SUBMISSION_SUBMITTED", message: "no tables" } });
      return notifySafely(tx, "missing", "client-a", async () => ({ drafts: [draft("team-1", "round:m1")] }));
    });
    console.error = origError;
    ok(out.failed, "notify reports the missing table");
    ok((await p3.activity.count({ where: { id: "act-m" } })) === 1, "the workflow write still committed");
  } finally {
    await p3.$disconnect();
  }

  // 6. rollback SQL
  console.log("6. rollback SQL");
  const DB4 = "notif_rehearsal_rollback";
  await recreate(DB4);
  for (const f of before) await applyFile(DB4, join(MIGRATIONS, f, "migration.sql"));
  await sql(DB4, SEED);
  await sql(DB4, `CREATE TABLE "_prisma_migrations" ("migration_name" text)`);
  const fp4 = await fingerprint(DB4, ["_prisma_migrations"]);
  await applyFile(DB4, join(MIGRATIONS, NEW, "migration.sql"));
  await sql(DB4, `INSERT INTO "_prisma_migrations" VALUES ('${NEW}')`);
  await applyFile(DB4, join(process.cwd(), "docs", "notifications", "rollback-notifications.sql"));
  const fp4b = await fingerprint(DB4, ["_prisma_migrations"]);
  ok(JSON.stringify(fp4) === JSON.stringify(fp4b), "after rollback every existing table is byte-identical and the new tables are gone");
  const leftover = (await sql(DB4, `SELECT count(*)::int AS n FROM pg_type WHERE typname = 'NotificationKind'`)).rows[0].n;
  ok(leftover === 0, "the NotificationKind type is gone");
  ok((await sql(DB4, `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = '${NEW}'`)).rows[0].n === 0, "its migration history row is removed");

  for (const db of [DB1, DB2, DB3, DB4]) {
    const c = new Client({ connectionString: ADMIN_URL });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    await c.end();
  }
  console.log(`\nREHEARSAL PASSED: ${passed} checks`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
