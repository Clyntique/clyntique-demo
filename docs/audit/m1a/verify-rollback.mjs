import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [pgliteDir, repo] = process.argv.slice(2);
const { PGlite } = await import(pathToFileURL(join(pgliteDir, "node_modules/@electric-sql/pglite/dist/index.js")).href);
const read = (p) => readFileSync(join(repo, p), "utf8");
const init = read("prisma/migrations/0_init/migration.sql");
const m1a = read("prisma/migrations/20261009180000_submission_workflow/migration.sql");
const rollback = read("docs/audit/m1a/rollback-m1a.sql");
const fixtures = `INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ('u1','T','t@x','x','TEAM',now());
INSERT INTO "Project" (id,name,"clientId","updatedAt") VALUES ('p1','P','u1',now());
INSERT INTO "Creative" (id,"projectId",name,status,"updatedAt") VALUES ('c1','p1','A','APPROVED',now());`;
const catalog = async (d) => {
  const q = async (sql) => (await d.query(sql)).rows.map((r) => JSON.stringify(r)).sort();
  return {
    columns: await q(`SELECT table_name, column_name, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public'`),
    constraints: await q(`SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE connamespace='public'::regnamespace`),
    indexes: await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'`),
    types: await q(`SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'`),
  };
};
const base = new PGlite(); await base.exec(init); await base.exec(fixtures);
const db = new PGlite(); await db.exec(init); await db.exec(fixtures);
await db.exec(`BEGIN;\n${m1a}\nCOMMIT;`);
await db.exec(rollback);
const [a, b] = [await catalog(base), await catalog(db)];
let ok = true;
for (const k of Object.keys(a)) { const same = JSON.stringify(a[k]) === JSON.stringify(b[k]); ok &&= same; console.log(`${same ? "PASS" : "FAIL"} rollback restores pre-M1A ${k}`); }
const row = (await db.query(`SELECT status::text s FROM "Creative" WHERE id='c1'`)).rows[0];
console.log(`${row?.s === "APPROVED" ? "PASS" : "FAIL"} pre-M1A rows preserved`); ok &&= row?.s === "APPROVED";
// Guard: refuses when M1A values are in use.
const g = new PGlite(); await g.exec(init); await g.exec(fixtures); await g.exec(`BEGIN;\n${m1a}\nCOMMIT;`);
await g.exec(`UPDATE "Creative" SET status='SUBMITTED' WHERE id='c1'`);
let refused = false; try { await g.exec(rollback); } catch { refused = true; await g.exec("ROLLBACK"); }
const still = (await g.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_name='Finding'`)).rows[0].n === 1;
console.log(`${refused && still ? "PASS" : "FAIL"} rollback refuses (and changes nothing) when M1A statuses are in use`); ok &&= refused && still;
console.log(ok ? "All rollback checks passed." : "Rollback checks FAILED");
