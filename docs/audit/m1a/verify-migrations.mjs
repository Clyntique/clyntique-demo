// Offline migration check in an in-memory PostgreSQL (PGlite). No network DB.
// Usage: node verify-migrations.mjs <pglite dir> <repo dir> <full-after.sql>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [pgliteDir, repo, fullAfter] = process.argv.slice(2);
const { PGlite } = await import(pathToFileURL(join(pgliteDir, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const read = (p) => readFileSync(p, "utf8");
const init = read(join(repo, "prisma/migrations/0_init/migration.sql"));
const additive = read(join(repo, "prisma/migrations/20261009180000_submission_workflow/migration.sql"));

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

// ---- DB1: baseline -> fixture rows (fictional) -> additive migration (in one transaction, like migrate deploy)
const db = new PGlite();
await db.exec(init);
await db.exec(`
  INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES
    ('u-team','T','t@test.invalid','x','TEAM',now()), ('u-client','C','c@test.invalid','x','CLIENT',now());
  INSERT INTO "Project" (id,name,"clientId","updatedAt") VALUES ('p1','P','u-client',now());
  INSERT INTO "Creative" (id,"projectId",name,status,"updatedAt") VALUES
    ('c-review','p1','In review, no file','IN_REVIEW',now()),
    ('c-draft','p1','Draft','DRAFT',now()),
    ('c-approved','p1','Approved by client','APPROVED',now()),
    ('c-changes','p1','Changes requested','CHANGES_REQUESTED',now());
  INSERT INTO "CreativeVersion" (id,"creativeId","versionNumber","fileUrl","createdById") VALUES ('v1','c-approved',1,'https://x/a.png','u-team');
  INSERT INTO "Approval" (id,"creativeId","versionId","userId",status) VALUES ('a1','c-approved','v1','u-client','APPROVED');
  INSERT INTO "Evidence" (id,"creativeId",title,type) VALUES ('e1','c-approved','Study','RESEARCH');
  INSERT INTO "Activity" (id,"projectId","userId",type,message) VALUES ('act1','p1','u-client','CREATIVE_APPROVED','Approved');
`);
const before = (await db.query(`SELECT id, status::text FROM "Creative" ORDER BY id`)).rows;

await db.exec(`BEGIN;\n${additive}\nCOMMIT;`);

const after = (await db.query(`SELECT id, status::text, workflow::text, "createdById", "submittedAt" FROM "Creative" ORDER BY id`)).rows;
check("all existing creatives are LEGACY_CLIENT_APPROVAL", after.every((r) => r.workflow === "LEGACY_CLIENT_APPROVAL"), after.map((r) => `${r.id}=${r.workflow}`).join(", "));
check("existing statuses unchanged (APPROVED stays APPROVED)", JSON.stringify(before) === JSON.stringify(after.map(({ id, status }) => ({ id, status }))));
check("new columns on existing creatives are null", after.every((r) => r.createdById === null && r.submittedAt === null));

const approval = (await db.query(`SELECT status::text, "versionId", "userId" FROM "Approval" WHERE id='a1'`)).rows[0];
check("legacy approval row untouched", approval?.status === "APPROVED" && approval.versionId === "v1" && approval.userId === "u-client");
const ev = (await db.query(`SELECT origin, "addedById", visibility::text, "withdrawnAt" FROM "Evidence" WHERE id='e1'`)).rows[0];
check("legacy evidence: origin/addedBy null, visibility SHARED", ev.origin === null && ev.addedById === null && ev.visibility === "SHARED" && ev.withdrawnAt === null);
const act = (await db.query(`SELECT type::text, "creativeId" FROM "Activity" WHERE id='act1'`)).rows[0];
check("legacy activity untouched, creativeId null", act.type === "CREATIVE_APPROVED" && act.creativeId === null);

const counts = (await db.query(`SELECT (SELECT count(*) FROM "User")::int u, (SELECT count(*) FROM "Project")::int p, (SELECT count(*) FROM "Creative")::int c, (SELECT count(*) FROM "CreativeVersion")::int v, (SELECT count(*) FROM "Approval")::int a, (SELECT count(*) FROM "Evidence")::int e, (SELECT count(*) FROM "Activity")::int act`)).rows[0];
check("row counts preserved", JSON.stringify(counts) === JSON.stringify({ u: 2, p: 1, c: 4, v: 1, a: 1, e: 1, act: 1 }), JSON.stringify(counts));

await db.exec(`INSERT INTO "Creative" (id,"projectId",name,"updatedAt") VALUES ('c-new','p1','New submission',now())`);
const fresh = (await db.query(`SELECT workflow::text, status::text FROM "Creative" WHERE id='c-new'`)).rows[0];
check("a NEW creative defaults to SUBMISSION_REVIEW / DRAFT", fresh.workflow === "SUBMISSION_REVIEW" && fresh.status === "DRAFT");
await db.exec(`UPDATE "Creative" SET status='SUBMITTED' WHERE id='c-new'`);
check("new status value SUBMITTED usable after commit", (await db.query(`SELECT status::text s FROM "Creative" WHERE id='c-new'`)).rows[0].s === "SUBMITTED");

const markets = (await db.query(`SELECT code FROM "Market" ORDER BY "sortOrder"`)).rows.map((r) => r.code);
check("markets seeded: US, CA, AE", JSON.stringify(markets) === JSON.stringify(["US", "CA", "AE"]), markets.join(","));
const platforms = (await db.query(`SELECT count(*)::int n FROM "AdPlatform"`)).rows[0].n;
check("platform reference rows seeded", platforms === 7, String(platforms));

// ---- DB2: the new schema built from scratch. Catalogs must match DB1 exactly.
const db2 = new PGlite();
await db2.exec(read(fullAfter));
const catalog = async (d) => {
  const q = async (sql) => (await d.query(sql)).rows.map((r) => JSON.stringify(r)).sort();
  return {
    columns: await q(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public'`),
    constraints: await q(`SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE connamespace='public'::regnamespace`),
    indexes: await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public'`),
    enums: await q(`SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY t.typname`),
  };
};
const [c1, c2] = [await catalog(db), await catalog(db2)];
for (const key of Object.keys(c1)) {
  const only1 = c1[key].filter((x) => !c2[key].includes(x));
  const only2 = c2[key].filter((x) => !c1[key].includes(x));
  check(`migrated DB matches schema.prisma: ${key}`, !only1.length && !only2.length, [...only1.map((x) => `migrated-only ${x}`), ...only2.map((x) => `schema-only ${x}`)].join(" | "));
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exitCode = failures ? 1 : 0;
