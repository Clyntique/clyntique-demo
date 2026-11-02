# Migration rehearsal runbook: 20261102170000_evidence_dictionary

For GT (the CEO's Windows PC). Every write in this runbook targets a
**local, disposable PostgreSQL database** on port 5433. The only Production
contact is **read-only** (an export and `migrate status`). Nothing here applies
the migration to Production or Preview, merges PR #25, or changes Production
data. Record every command's output in a log under
`D:\clyntique-demo\preview-p0-oct28\policy-verification\` (or the folder the
CEO prefers).

Conventions: `<LOCAL>` is a connection string to the local PG16 instance on
port 5433 (`postgresql://<user>:<pass>@localhost:5433/<db>`); `<PROD>` is the
Production `DATABASE_URL` from the git-ignored `.env` and is never printed.
Prisma commands read `DATABASE_URL` from the environment or `.env`; set it per
step with `$env:DATABASE_URL = "<LOCAL>"` in PowerShell and confirm with
`npm run db:target` before anything that writes.

## 0. Checkout (LF line endings)

```powershell
cd D:\clyntique-demo\clyntique
git fetch origin feature/mvp-passport-evidence-dictionary
git worktree add D:\clyntique-demo\pr25-release origin/feature/mvp-passport-evidence-dictionary
cd D:\clyntique-demo\pr25-release
git config core.autocrlf false
git rm -rq --cached . ; git reset -q --hard   # re-checkout with LF endings
git log --oneline -1                           # expect the PR #25 head commit
npm ci
```

## 1. Final PR checks from the PR head

```powershell
npx tsc --noEmit -p tsconfig.json
npx eslint .
npx vitest run            # expect 48 files, 580 tests
npm run build             # Production build
```

## 2. Read-only Production facts (no writes)

```powershell
$env:DATABASE_URL = "<PROD>"
npm run db:target                     # prints which database you point at
npx prisma migrate status             # expect: 9 applied, 1 pending (20261102170000_evidence_dictionary)
npm run db:inventory                  # row counts per table (read-only)
npm run db:export -- --out D:\clyntique-demo\db-backups\clyntique-<timestamp>   # fresh export, read-only SELECTs
```

Also read-only, for the Preview risk section: on the Production connection,
`SELECT datname FROM pg_database WHERE datname LIKE 'clyntique%' OR datname LIKE 'cyntique%';`
and, if `clyntique_demo_preview` exists, connect to it with the same role and
run `SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at;`.
Do not change anything there.

## 3. Isolated rehearsal database from the fresh export

```powershell
# local PG16 on 5433; create an empty database for the rehearsal
psql -h localhost -p 5433 -U <user> -c 'CREATE DATABASE pr25_rehearsal;'
$env:DATABASE_URL = "<LOCAL>/pr25_rehearsal"
npm run db:target                                      # must say local / pr25_rehearsal
# recreate the Production schema at main (9 migrations) on the empty database,
# from the MAIN checkout so the new migration is not applied yet:
cd D:\clyntique-demo\main-release ; git fetch origin main ; git checkout --detach origin/main ; npm ci
npx prisma migrate deploy                              # 9 migrations on the local db
npx prisma migrate status                              # 9 applied, none pending
$env:RESTORE_CONFIRM_DATABASE = "pr25_rehearsal"
npm run db:restore -- --dir D:\clyntique-demo\db-backups\clyntique-<timestamp> --apply
npm run db:inventory > D:\...\pr25-inventory-before.txt
```

Confirm the restored counts equal the Production inventory from step 2.

## 4. Apply the migration (local only), check schema and data

```powershell
cd D:\clyntique-demo\pr25-release
$env:DATABASE_URL = "<LOCAL>/pr25_rehearsal"
npm run db:target
npx prisma migrate status                              # 9 applied, 1 pending
npx prisma migrate deploy                              # applies 20261102170000_evidence_dictionary
npx prisma migrate status                              # 10 applied, none pending
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # expect an empty migration (no drift)
npm run db:inventory > D:\...\pr25-inventory-after.txt
```

Compare before/after: every pre-existing table has the same count;
`EvidenceRecord` and `EvidenceRecordCheck` have 0 rows; every `Evidence` row has
`recordId IS NULL`:

```sql
SELECT count(*) AS evidence, count("recordId") AS linked FROM "Evidence";
SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('Evidence_recordId_fkey','EvidenceRecord_ownerClientId_fkey','EvidenceRecord_createdById_fkey','EvidenceRecordCheck_recordId_fkey','EvidenceRecordCheck_reviewerId_fkey');  -- all confdeltype = 'r' (RESTRICT)
```

## 5. Backward compatibility: current Production code on the migrated database

With the migration applied and **the main checkout (current Production code)**:

```powershell
cd D:\clyntique-demo\main-release
$env:DATABASE_URL = "<LOCAL>/pr25_rehearsal"
npm run db:check
npx prisma migrate status      # main's folder lacks the new migration: expect a note that one applied migration is missing locally, NOT an error
npm run build ; npx next start -p 3100
```

Sign in with a **local-only** test user created in `pr25_rehearsal` (never a
Production account or password) and open: a client dashboard, one creative,
its Evidence tab, its review record (`/record`); then the team views of the
same creative and `/admin`. Expect the pages to render as they do in Production
today. Stop the server afterwards.

## 6. Foreign-key integrity and rollback (local only)

In `pr25_rehearsal`:

```sql
-- integrity: create a record and a check, then prove RESTRICT holds
INSERT INTO "EvidenceRecord" ("id","ownerClientId","createdById","title","type","description","updatedAt")
  SELECT 'rehearsal-rec', u.id, u.id, 'Rehearsal record', 'OTHER', 'local only', now() FROM "User" u WHERE u.role = 'CLIENT' LIMIT 1;
INSERT INTO "EvidenceRecordCheck" ("id","recordId","reviewerId","result","note")
  SELECT 'rehearsal-chk', 'rehearsal-rec', u.id, 'NEEDS_MORE_INFO', 'local only' FROM "User" u WHERE u.role = 'TEAM' LIMIT 1;
DELETE FROM "EvidenceRecord" WHERE id = 'rehearsal-rec';   -- expect: violates foreign key (check references it)
DELETE FROM "User" WHERE id = (SELECT "createdById" FROM "EvidenceRecord" WHERE id='rehearsal-rec');  -- expect: violates foreign key
DELETE FROM "EvidenceRecordCheck" WHERE id = 'rehearsal-chk';
DELETE FROM "EvidenceRecord" WHERE id = 'rehearsal-rec';   -- now succeeds
```

Rollback, from the PR checkout:

```powershell
cd D:\clyntique-demo\pr25-release
$env:DATABASE_URL = "<LOCAL>/pr25_rehearsal"
npx prisma db execute --file docs/evidence-dictionary/rollback-20261102170000_evidence_dictionary.sql
npx prisma migrate status                   # 9 applied, 1 pending again
npm run db:inventory                        # counts equal pr25-inventory-before.txt
npx prisma migrate deploy                   # re-apply: proves the rollback left a clean state
npx prisma migrate status                   # 10 applied, none pending
```

Also show that the rollback refuses while a record exists: insert the
rehearsal record again, run the rollback script, expect the "Refusing" error
and no change; delete the record; run it again successfully.

## 7. Report back

One message with: commit hash tested; results of steps 1–6 with the exact
numbers (test counts, migration counts, inventory before/after, the diff
output); the Preview database facts from step 2; anything unexpected. Do not
include connection strings, passwords or hashes. Do not apply the migration to
Production or Preview, and do not merge.
