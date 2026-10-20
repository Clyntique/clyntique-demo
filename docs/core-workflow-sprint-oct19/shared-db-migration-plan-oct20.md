# Shared Render database: findings, plan and exact commands (Oct 20)

For the CEO's decision of Oct 19 (18:42 UTC): no new Render database; keep the existing instance (`dpg-db3sfh8m7kps73ft1vc0-a`, Ohio, database `cyntique_demo`, shared by Production and every Vercel Preview) for the Oct 22 demo.

**Status: nothing has been run against any shared database.** No migration, seed, fixture, merge or deploy. This container has no connection string for the Render instance, so the read-only inspection in §1 has to run on GT; every command, script and failure path below was verified on local PostgreSQL 16 copies instead (log in §10). Nothing in PR #5 is merged to `main` and nothing is deployed to Production.

## 0. Summary and recommendation

| Question (CEO's numbering) | Finding |
|---|---|
| 1. Current schema and migration history | Not readable from here. §1 gives five read-only commands for GT, including a new `npm run db:preflight` that prints exactly what the decision needs (no secrets). Expected state: 5 migrations applied, 27 tables, none of the 15 new objects present. |
| 2. Compatibility of the two migrations with existing data | Compatible by construction: 7 `CREATE TABLE`, 6 `CREATE TYPE`, 2 nullable `ADD COLUMN`, indexes and foreign keys on the new tables only. No row is read, updated, deleted or backfilled; no existing constraint changes. The only link to existing rows is `ReviewCycle.triggerRuleVersionId`, NULL for every existing row. §2. |
| 3. Second logical database on the same instance | **Supported by Render, same plan, no cost**: Render's docs say to run `CREATE DATABASE <name>` and connect with the same URL and the new name; the feature request for this was marked complete by Render in April 2022. Whether the database role may do it is the one unknown: `db:preflight` prints `Role can CREATE DATABASE: YES/NO`. **Recommended: Option A (§3).** Production's database is not touched at all. |
| 4. If not possible: backup-first plan for the shared database | Option B (§4): export, target check, then each migration as one all-or-nothing command (`prisma db execute`, verified atomic) followed by `migrate resolve --applied`. Option B is also the step that Production will need before the integrated code goes live, whichever option is chosen for the rehearsal. |
| 5. Production with the new tables before the integrated deploy | Unaffected: the running Production build has no code for them, selects name their columns explicitly, inserts into `ReviewCycle` leave the two new columns NULL. One side effect to decide on: after Option B, the auto-built Previews of PR #4/#5 start writing real chat and lifecycle rows into the shared database. §5. |
| 6. Backup, restore, rollback | `db:export` (snapshot-consistent JSON) → `db:restore` into a recovery database (round trip verified: every row identical). Two rollback scripts, one transaction each, remove only what the migrations add and **refuse while any new record exists**, so records are never dropped without an export first. §6. Found and fixed on the way: `db:restore` did not know 11 of the 34 tables (policy library, chat, lifecycle); a restore would have silently lost them. |
| 7. Client/Team workflows, auth, uploads, policy data | Unchanged tables, unchanged `authorize()` rules except the new `REOPEN_REVIEW` transition; 396 tests pass on the merged branch. §7. |
| 8. Locks, failures, deployment risks | Milliseconds of locking; the only lock that can queue is `ADD COLUMN` on `ReviewCycle`, bounded by `lock_timeout = 5s` in the apply scripts (tested: a held lock makes the apply fail after 5 s and leave nothing). Risks are in deployment order and in the Previews, not in the SQL. §8. |

Also found while preparing this: PR #5's branch (`bb4fdd2`) did **not** contain the fail-soft commit `5399c0f` (it is in PR #4, but the merge into the integration branch was taken one commit too early), so its Preview on the shared database would have errored on the record and impact pages instead of showing the notice. Merged now as `0a813ec`; tsc clean, ESLint 0 errors, 396 tests, build OK. The earlier status document's claim about graceful degradation is true from this push on.

## 1. Read-only inspection (run on GT, nothing writes)

PowerShell, `D:\clyntique-demo\clyntique`. `.env` on GT points at `cyntique_demo` (confirmed on Oct 9); `db:target` proves it before anything connects.

```powershell
git fetch origin demo/integration-oct22-v2
git checkout demo/integration-oct22-v2
npm ci
npm run db:target            # host, port, database, SSL mode only; no connection
npm run db:preflight         # connects, reads only (new script, below)
npm run db:inventory         # row counts per table, users by role, migration rows
npx prisma migrate status    # Prisma's own view of the history
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
```

What to send me (none of it contains secrets): the five outputs. Expected:
- `db:target`: `Host: dpg-db3sfh8m7kps73ft1vc0-a.ohio-postgres.render.com`, `Database: cyntique_demo`, `SSL mode: verify-full`.
- `db:preflight`: PostgreSQL version, `Role can CREATE DATABASE: YES` or `NO`, the list of databases on the instance, connection count, `_prisma_migrations` with the 5 known migrations finished and not rolled back, all 10 referenced tables present, collision check `none`, verdict lines.
- `db:inventory`: 27 tables (not counting `_prisma_migrations`), demo accounts only.
- `migrate status`: 7 found, 2 not yet applied (`20261019180000_reviewer_chat`, `20261019190000_lifecycle_records`).
- `migrate diff`: only additions (`CreateEnum` ×6, `CreateTable` ×7, `AlterTable "ReviewCycle"` adding two columns, indexes and foreign keys). **Anything else listed is drift: stop and send it.**

If a Prisma CLI command fails with `P1001` while `db:preflight` works, use the session-only `sslmode=require` URL from `docs/audit/existing-render-db-migration-plan.md` §2 and retry; Oct 9 showed one transient `P1001` on Render.

Also read from the Render dashboard (not available by SQL): the instance's **plan** (Free or paid), its **expiry date** if Free, and whether **point-in-time recovery / on-demand exports** are offered. Render's docs state these exist for all paid databases; a Free instance has only our own `db:export`.

`npm run db:preflight` is new in this branch (`prisma/db-preflight.ts`): read-only catalog queries, prints names and counts, never the URL, user list, emails or hashes.

## 2. Compatibility of both migrations with existing data

| Property | `20261019180000_reviewer_chat` | `20261019190000_lifecycle_records` |
|---|---|---|
| Statements | `CREATE TABLE` ×2, `CREATE INDEX` ×6, `ADD CONSTRAINT … FOREIGN KEY` ×6 | `CREATE TYPE` ×6, `ALTER TABLE "ReviewCycle" ADD COLUMN` ×2 (both nullable, no default), `CREATE TABLE` ×5, `CREATE INDEX` ×7, `ADD CONSTRAINT … FOREIGN KEY` ×19 |
| Reads, updates, deletes, backfills of existing rows | none | none |
| Changes to existing columns, types, constraints, indexes | none | none (two columns added to `ReviewCycle`) |
| Existing rows that could violate a new constraint | impossible: no constraint applies to an existing table | `ReviewCycle.triggerRuleVersionId` is NULL on every existing row, so its foreign key is satisfied |
| Objects it depends on | `User`, `Creative`, enum `Role` (all from `0_init`) | `User`, `Creative`, `CreativeVersion`, `ReviewCycle`, `SubmissionRound`, `Evidence`, `AdPlatform`, `Market` (M1A), `PolicyRule`, `PolicyRuleVersion` (`20261014220000`) |
| Name collisions | none expected; `db:preflight` checks all 7 tables, 6 types and 2 columns | same |
| Order | first (timestamp) | second; independent of chat, both orders would work |

`tests/migrations.test.ts` asserts the additive-only statement set on every run. Verified locally (§10): both apply on a database carrying the first 5 migrations, `migrate diff` against the schema is then empty, and both apply again after a rollback.

## 3. Option A (recommended): a second logical database on the existing instance

What it gives: the integrated branch's Preview gets its own schema and data, `cyntique_demo` is never written to, Production keeps its exact state. What it shares: CPU, memory, disk, the connection limit (97 on this instance per the pool notes) and the instance's plan terms (a Free instance's expiry date applies to both databases). Render's dashboard shows the instance; the second database is visible through SQL (`db:preflight` lists databases).

Steps (GT, same terminal as §1, after I confirm the §1 outputs):

```powershell
# A1. Still on cyntique_demo. Preflight must say: Role can CREATE DATABASE: YES
npm run db:target
npm run db:preflight

# A2. STOP: approval for the one statement below (creates an empty database; touches nothing else)
npx prisma db execute --file docs/core-workflow-sprint-oct19/sql/create-preview-database.sql

# A3. Point THIS terminal at the new database: same URL, last path segment changed. Prints nothing.
$env:DATABASE_URL = node -e "const d=require('dotenv').config({quiet:true}).parsed; const u=new URL(d.DATABASE_URL); u.pathname='/clyntique_demo_preview'; process.stdout.write(u.href)"
npm run db:target                 # must show Database: clyntique_demo_preview (same host)
npx prisma migrate status         # must show 7 migrations not yet applied on an empty database
npm run db:preflight              # lists both databases; history MISSING is expected here

# A4. STOP: send the three outputs. After my confirmation:
npx prisma migrate deploy         # empty database: nothing to protect, standard deploy is fine
npx prisma migrate status         # Database schema is up to date!
```

Then `isolated-preview-setup-oct20.md` **Steps 2 to 6 apply unchanged** (new private Blob store; the five Vercel variables scoped to Preview + branch `demo/integration-oct22-v2`, with `DATABASE_URL` = the External Database URL whose path ends in `/clyntique_demo_preview`; demo accounts with new passwords via `seed.ts` with `SEED_CONFIRM_DATABASE=clyntique_demo_preview`; `[SAMPLE]` fixtures; redeploy; isolation proof). The write scripts already refuse `cyntique_demo` by name, which now protects the neighbouring database on the same host.

If `db:preflight` says `NO` for CREATE DATABASE: Render's docs describe the feature without naming a required plan, so the next check is Render support or the dashboard's "Access control" / role settings; failing that, Option B.

Undo: `DROP DATABASE "clyntique_demo_preview"` from a session on `cyntique_demo` (approval needed; never while Vercel still points at it). Render does not keep backups of a dropped database.

## 4. Option B: apply both migrations to the shared database, backup first

Use when Option A is impossible, or later, as the Production step before the integrated code is deployed. Both migrations are additive, so Production keeps working throughout (§5).

```powershell
# B0. Window: nobody is using the app; no Vercel deploy in progress; terminal env clear (Remove-Item Env:DATABASE_URL)
npm run db:target                 # Database: cyntique_demo, host dpg-db3sfh8m7kps73ft1vc0-a…
npm run db:preflight              # verdict: READY (additive only; export first)
npm run db:export -- --out D:\clyntique-demo\db-backups        # snapshot export, outside the repo
npm run db:restore -- --dir D:\clyntique-demo\db-backups\clyntique-<stamp>   # DRY RUN: validates the export, no connection
npm run db:target                 # re-check the target immediately before writing

# B1. STOP: send db:target, the preflight verdict, the export's table counts (they must equal db:inventory)

# B2. Apply. One command per migration; each file runs as ONE transaction (all or nothing), lock_timeout 5 s.
npx prisma db execute --file docs/core-workflow-sprint-oct19/sql/apply-reviewer_chat.sql
npx prisma migrate resolve --applied 20261019180000_reviewer_chat
npx prisma db execute --file docs/core-workflow-sprint-oct19/sql/apply-lifecycle_records.sql
npx prisma migrate resolve --applied 20261019190000_lifecycle_records

# B3. Verify
npx prisma migrate status         # Database schema is up to date!
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
echo $LASTEXITCODE                # 0
npm run db:inventory              # original tables: same counts as the export; 7 new tables with 0 rows
npm run db:preflight              # verdict: ALREADY APPLIED
```

Why `db execute` + `resolve --applied` instead of `migrate deploy`: tested on Oct 19, `prisma migrate deploy` does **not** run a migration in a transaction (a failing migration left its first table behind and the history row marked failed), whereas `prisma db execute --file` sends the file as a single command, which PostgreSQL runs as one transaction (a failing script left nothing). `migrate resolve --applied` then records the migration with the checksum of the migration folder, so `migrate status`, `migrate diff` and future `migrate deploy` behave exactly as after a normal deploy (verified). The apply scripts are the migration files plus a two-line timeout header; `tests/shared-db-apply-scripts.test.ts` fails if they ever differ.

| If this happens | Then |
|---|---|
| `db execute` fails (any error, including `canceling statement due to lock timeout`, `P1001`) | Nothing was applied. Fix the cause (wait for the open transaction, retry the network) and run the same command again. `db:preflight` confirms "collision: none" before the retry. |
| `db execute` succeeds, `migrate resolve` fails | Run `resolve` again; it is safe to repeat ("already recorded as applied" is the expected message on a repeat). |
| Verification differs from expectations | Do not continue to the next migration; send the outputs. The rollback scripts in §6 remove exactly what was applied. |

## 5. How Production behaves with the new tables before the integrated code is deployed

- The Production build (currently `feature/hero-redesign`) was generated from a Prisma schema without these models. Its queries name their columns explicitly, so the two new `ReviewCycle` columns are never selected; its `ReviewCycle` inserts leave them NULL (no default needed). It never references the 7 new tables or the 6 new types.
- No trigger, default, sequence or index on an existing table changes, so neither query plans nor write latency change. Storage grows by a few empty tables.
- Foreign keys from the new tables are `RESTRICT` towards users, rule versions and creative versions: they would only block a deletion once a new row references the target, and no new rows exist until the integrated code runs. The application has no delete path for users or rule versions anyway.
- Deployment order that keeps everything working: migrate (Option B) **before** deploying the integrated code to Production. The reverse order also does not crash (the integrated code degrades: chat hidden, empty scan history, notice on record and impact pages), but the features would be missing.
- **Side effect to decide on:** every Vercel Preview uses the shared database. After Option B, the Previews of PR #4 and PR #5 start writing real `Conversation`, `Message`, `AIScanRun`, `ExternalSubmission`, `ExternalOutcome`, `PolicyRuleEvent` rows whenever someone uses them, and those rows will be visible to Production once the integrated code is live. Acceptable for demo data, but it means the rehearsal data is Production data. Option A avoids this entirely.

## 6. Backup, restore and rollback (verified)

**Backup.** `npm run db:export -- --out D:\clyntique-demo\db-backups` reads every public table in one `REPEATABLE READ` snapshot and writes one JSON file per table plus a manifest, outside the repository. It contains password hashes: keep it private. Verify with the dry-run `db:restore` (checks files, counts and the main foreign keys without connecting). On a paid Render plan also take an on-demand export from the dashboard before the apply; on Free there is none.

**Restore** (only for actual data loss, which these migrations cannot cause; never into the live database without its own approval, because it truncates):
```powershell
# into an EMPTY recovery database that has the same migrations (e.g. clyntique_demo_preview, or a local one)
$env:DATABASE_URL = "<recovery database URL>"
npm run db:target
npx prisma migrate deploy
$env:RESTORE_CONFIRM_DATABASE = "<its database name>"
npm run db:restore -- --dir D:\clyntique-demo\db-backups\clyntique-<stamp> --apply
```
Fixed in this branch: `prisma/db-restore.ts` listed only the 22 original tables, so `PolicySource`, `PolicyRule`, `PolicyRuleVersion`, `PolicyRuleVersionSource`, `Conversation`, `Message` and the five lifecycle tables would have been truncated by the cascade and never re-inserted. It now covers all 34 tables in dependency order (policy versions before `ReviewCycle` and `Finding`, which reference them), stops if a backup contains a table it does not know, and skips tables an older backup lacks with a visible `[SKIP]`. Round trip verified locally: export of a database with users, chat and lifecycle rows, restore into a fresh database, every table's row count and row contents identical. Only `_prisma_migrations` timestamps lose sub-millisecond digits through JSON (the application tables are millisecond precision already).

**Rollback** of a migration (removes only the objects it added; one transaction; `IF EXISTS` so it also cleans up a partial apply):
```powershell
npm run db:export -- --out D:\clyntique-demo\db-backups         # preserves any new records first
npx prisma db execute --file docs/core-workflow-sprint-oct19/sql/rollback-lifecycle-records.sql
npx prisma db execute --file docs/core-workflow-sprint-oct19/sql/rollback-reviewer-chat.sql   # only if chat must go too
npx prisma migrate status                                        # the rolled-back migration(s) show as not yet applied
```
Record protection: each script counts the records in its tables (and, for lifecycle, `ReviewCycle` rows with a re-review reason) and **refuses** while any exist. To drop them deliberately after the export, uncomment the single `SET LOCAL clyntique.rollback_confirm = 'drop-new-records';` line in a copy of the script. Prisma refuses to mark a successful migration as rolled back, so the script deletes its own `_prisma_migrations` row inside the same transaction; `migrate status` is consistent afterwards (verified). Re-applying later is §4 B2 again, and exported records can be re-inserted from the JSON (a small import script for just those tables is not written yet; say so if it becomes needed).

## 7. Compatibility of existing workflows, authentication, uploads and policy data

- **Client/Team permissions:** `authorize()` and the transition table are unchanged for every existing action; the sprint added one transition (`REVIEW_COMPLETE → SUBMITTED` via `REOPEN_REVIEW`, TEAM only) and new commands that all pass through the same `authorize()` and `creativeScope(user)`. Tests cover the other client on every new command.
- **Authentication:** `User`, `LoginAttempt` and the session code are untouched; `User` gains relation fields in the Prisma schema only (no column).
- **Uploads:** `CreativeVersion`, Vercel Blob handling and the media routes are untouched; the new tables only reference `CreativeVersion.id`.
- **Policy data:** `PolicySource`, `PolicyRule`, `PolicyRuleVersion`, `PolicyRuleVersionSource` are untouched. New `RESTRICT` foreign keys only prevent deleting a rule version that a scan, finding cycle or event cites; `retireDbRule` changes status and never deletes. The integrated code writes a `PolicyRuleEvent` on create/propose/approve/retire from now on; there is no backfill for earlier rule history.
- **Evidence:** `ExternalOutcome.evidenceId` is `SET NULL` on evidence deletion, so evidence withdrawal keeps working.
- Proof on the merged branch `0a813ec`: `tsc` clean, ESLint 0 errors, 31 test files / 396 tests passed (including the chat suite, the migration statement checks and the lifecycle fail-soft suite), production build succeeds.

## 8. Locks, migration failures and deployment risks

| Statement | Lock on an existing table | Duration |
|---|---|---|
| `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` on a new table | none | ms |
| `ADD CONSTRAINT … FOREIGN KEY` from a new (empty) table | `SHARE ROW EXCLUSIVE` on the referenced table (`User`, `Creative`, `CreativeVersion`, `ReviewCycle`, `SubmissionRound`, `Evidence`, `AdPlatform`, `Market`, `PolicyRule`, `PolicyRuleVersion`): concurrent reads continue, concurrent writes to that table wait | ms (nothing to validate in an empty table) |
| `ALTER TABLE "ReviewCycle" ADD COLUMN` (nullable, no default) | `ACCESS EXCLUSIVE` on `ReviewCycle`: must wait for any open transaction touching that table, then blocks reads and writes of it | ms once acquired; no rewrite in PostgreSQL 11+ |

The application's transactions are one request long (row locks via `lockSubmission` inside a command), and the Vercel pool holds at most 5 connections per instance, so the wait is normally zero. The apply scripts set `lock_timeout = '5s'`: tested with another session holding `ReviewCycle`, the apply failed after 5 s with "canceling statement due to lock timeout" and left no object behind. `db:preflight` reports open or long transactions beforehand.

Failure modes and what the plan does about them:
- Partial apply: impossible with the apply scripts (single transaction); with `migrate deploy` it would leave objects and a failed history row, which is why `migrate deploy` is not used on the shared database. If it ever is and fails, the rollback scripts' `IF EXISTS` clean-up plus `migrate resolve --rolled-back` recover it.
- Network drop mid-command (`P1001`, seen once on Oct 9): the server either committed or rolled back the single command; `db:preflight` shows which (collision `none` or all 15 objects present), then continue with `resolve` or retry.
- Wrong target: every write step is preceded by `db:target`; the seed, fixtures and check scripts refuse `cyntique_demo` by name.
- Connection budget: the apply uses one connection; the instance allows 97.

Deployment risks (not SQL):
- Vercel builds every pushed branch against the shared database (general Preview `DATABASE_URL`). Pushing `0a813ec` rebuilds PR #5's Preview; with fail-soft it degrades instead of erroring. After Option B those Previews write real rows (§5).
- Production must not receive the integrated code before Option B is applied if the demo is to use the new features; either order is crash-free.
- `DEMO_LOGIN` and `CLIENT_SIGNUP` must stay unset on Production (demo login is already forced off when `VERCEL_ENV=production`).
- Demo data on the shared database can only be created through the UI: `seed.ts` writes accounts only, and `demo-fixtures.ts` refuses `cyntique_demo` by design. Relaxing that guard would be a separate decision.
- A Free Render instance expires; its date applies to Production and to the second logical database alike. Read it from the dashboard (§1).
- Deployment Protection on Vercel: testers of the Preview need a Vercel login or a shareable link.

## 9. Approvals needed, in order

1. **Now, no risk:** run the read-only inspection in §1 on GT and send the outputs (they connect but write nothing). I cannot run it from here without a connection string; adding the shared database's URL as an environment secret is possible but I recommend GT, so Production credentials stay on your machine.
2. **Choose the path after reading `db:preflight`:** Option A (second logical database, recommended if `CREATE DATABASE: YES`) or Option B (apply to the shared database).
3. **Option A:** approve the single `CREATE DATABASE "clyntique_demo_preview"` statement (A2), then, after the A3 outputs, `migrate deploy` on the new database (A4), then Steps 2 to 6 of the isolated-preview document (Blob store, Vercel branch-scoped variables, demo accounts, fixtures, redeploy).
4. **Option B, or later for Production:** approve the export plus the two apply commands in one window (B0 to B3), and accept the Preview side effect in §5.
5. Any rollback (§6) or `DROP DATABASE` needs its own approval; they are never run as part of the steps above.
6. Unchanged from before: no merge of PR #5 into `main`, no Production deployment, no fixtures on `cyntique_demo` without a separate decision.

## 10. Local verification log (Oct 19, PostgreSQL 16.15 in the sprint container)

| Test | Result |
|---|---|
| `prisma migrate deploy` with a deliberately failing migration (table, then invalid statement) | first table remained, history row marked failed: **not atomic** |
| `prisma db execute --file` with the same failing script | no table remained: **atomic**; identical result with and without explicit `BEGIN/COMMIT` |
| Database with the first 5 migrations → `db execute` chat file, `resolve --applied`, same for lifecycle | `migrate status`: up to date; `migrate diff` schema vs database: no difference; history rows present (`applied_steps_count` 0, as Prisma records resolved migrations) |
| Apply script while another session held `ReviewCycle` (`ACCESS EXCLUSIVE`, 15 s) | failed after 5 s with lock timeout; 0 new tables, 0 new types |
| Apply scripts (with timeout header) on the 5-migration database | both succeed; status up to date; diff empty; repeating `resolve --applied` reports "already recorded" and changes nothing |
| Rollback scripts with fake chat and lifecycle rows present | both **refused** with the row counts; history rows untouched |
| Rollback scripts with the confirmation line enabled, then `migrate diff` against a fresh 5-migration database | both succeed; no difference; status shows the two as not yet applied; re-apply succeeds; rollback with empty tables needs no confirmation |
| `CREATE DATABASE "clyntique_demo_preview"` through `prisma db execute` from the existing database, then `migrate status`/`deploy` on it | created; 7 pending; all applied; original database unchanged |
| `db:preflight` on the 5-migration database / the 7-migration database | READY / ALREADY APPLIED, CREATEDB detected, collisions listed correctly |
| `db:export` of a database with users, chat and lifecycle rows → fixed `db:restore --apply` into a fresh 7-migration database | 34 of 34 tables handled; row counts identical; `User`, `Message`, `PolicyRuleEvent`, `Market` row contents identical; `_prisma_migrations` identical except sub-millisecond timestamp digits |
| Merged branch `0a813ec` | `tsc` clean; ESLint 0 errors; vitest 31 files, 396 passed; `next build` OK |

Not verified here, by design: anything against the Render instance; the Vercel dashboard steps; the Render role's `CREATEDB` privilege (that is what `db:preflight` is for).
