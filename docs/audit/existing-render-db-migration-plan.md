# Plan: reuse the existing Render database (M1A migration)

Status: **plan only. Nothing has been run against any database.** No connection, migration, reset or account change was made, and no Git command or deploy was run.

Every step below needs your approval. Run them in PowerShell from `D:\clyntique-demo\clyntique`.

## 1. Recommendation: migrate (A), don't reset (B)

**Use approach A: keep the existing dummy records and apply the additive M1A migration.**

| | A. Additive migration (recommended) | B. Reset and rebuild |
|---|---|---|
| Compatibility | The migration was generated *from* the pre-M1A schema that this database was built with (`db push`). It was verified offline: existing rows become `LEGACY_CLIENT_APPROVAL`, nothing is dropped, and the result matches the new schema exactly | Always works, but throws away everything |
| Destructive? | No. It only adds | Yes. Drops every table and row |
| Downtime | None expected. The current Vercel app keeps working on the migrated schema | The live app breaks during the reset and comes back empty |
| Risk | Drift between the live database and the baseline. Step 3 checks this read-only before anything changes | Wrong target means total loss. Accounts and projects must be recreated |
| Rollback | A tested rollback script removes only M1A additions | Restore from the export by hand |

Use B only if the drift check (step 3) shows the database doesn't match the baseline, and only through the separate gated plan in §7.

## 2. Helper commands (prepared; none connect until you run them)

| Command | What it does | Writes? |
|---|---|---|
| `npm run db:target` | Shows the host, database and SSL mode from `.env` without connecting. Add `-- --env-file <file>` to inspect another env file | No |
| `npm run db:check` | Connects; prints the PostgreSQL version and table names | No |
| `npm run db:inventory` | Connects; prints row counts per table, users by role and demo domain, creatives by status/workflow, migration history, M1A objects. No emails, names or secrets | No |
| `npm run db:export -- --out D:\clyntique-demo\db-backups` | Connects; copies every row to JSON in a folder **outside the repo**, from one consistent snapshot. Refuses folders inside the repo | Database: no. Local files: yes |
| `npm run db:migrate:status` | Prisma migration status | No |
| `docs/audit/m1a/rollback-m1a.sql` | Recovery only. Removes M1A objects; refuses if M1A statuses are in use. Verified offline | Yes. Approval needed |

`pg_dump`, `psql`, the Vercel CLI and Docker are **not installed** on this machine. `db:export` is the backup method. On the free plan, Render does not provide database backups or exports, so a local export is the only backup.

**SSL workaround for Prisma CLI commands only.** If `migrate` or `db execute` fails with **P1001** while `db:check` works, set a session-only URL with `sslmode=require`. Nothing is printed:

```powershell
$env:DATABASE_URL = node -e "const d=require('dotenv').config({quiet:true}).parsed; const u=new URL(d.DATABASE_URL); u.searchParams.set('sslmode','require'); process.stdout.write(u.href)"
```

Clear it again afterwards:

```powershell
Remove-Item Env:DATABASE_URL
```

## 3. Safety checks (all read-only). Stop if any fails.

**Before starting: don't push to GitHub** until §4 step 6. If Vercel is connected to the repo, a push deploys the M0/M1A/M2 code, and that code fails on writes against the un-migrated database (see §5).

**Check 1. Which database does local `.env` target?**

```powershell
npm run db:target
```

Expected: `Source: .env`, a Render host `dpg-….render.com`, your database name, and SSL mode `verify-full`.

Note the host and database name (not the URL). **Stop** if `Source` says *environment variable*; clear it with `Remove-Item Env:DATABASE_URL`.

**Check 2. Does Vercel use the same database?**

In the Vercel dashboard:
1. Open **Project → Settings → Environment Variables → `DATABASE_URL`**. Check **Production, Preview and Development** separately.
2. Reveal each value and compare **only the `dpg-…` host** with check 1. Don't copy the URL anywhere.
3. Also note **Settings → Git**: the connected repo and the production branch.
4. Note the **Deployments** list: the commit of the current production deployment.

Same host means the migration affects the live Vercel app (§5). A different host is fine too.

**Check 3. Server version and contents (dummy data?)**

```powershell
npm run db:check
```

Expected: PostgreSQL **12 or newer**, and 8 tables: Activity, Approval, Comment, Creative, CreativeVersion, Evidence, Project, User.

```powershell
npm run db:inventory
```

Expected:
- Users all `demo=true` (only `@clyntique.demo` emails).
- Migration history: `none`.
- `M1A tables present: 0/14`.

**Stop and review** if:
- any `demo=false` user exists (it may not be dummy data),
- `_prisma_migrations` already exists,
- any M1A table is present, or
- the version is below 12.

**Check 4. Does the live schema match the pre-M1A baseline (drift)?**

```powershell
npx prisma migrate diff --from-config-datasource --to-schema docs/audit/m1a/pre-m1a-schema.prisma --exit-code
```

Then:

```powershell
echo $LASTEXITCODE
```

`0` means no differences: continue. `2` means differences: **stop**. Run it again without `--exit-code` to see a summary (it contains no secrets) and send it to me. `1` is an error: use the SSL workaround above and retry.

**Check 5. Is the migration history compatible?**

```powershell
npm run db:migrate:status
```

Expected: Prisma says the database is **not managed by Prisma Migrate** (no history yet), and lists `0_init` and `20261009180000_submission_workflow` as not applied. **Stop** if it lists any other migration names or a failed migration.

**Check 6. Are the old published demo passwords still active?**

Start the app locally (`npm run dev`, then http://localhost:3000). Try signing in with the **old** demo passwords from the earlier README.

Expected today: they **work** (audit finding S1). This is fixed in §4 step 7. Signing in only reads from the database while rate limiting is off.

## 4. Migration procedure (needs your explicit go-ahead)

**Step 1. Backup (export).**

```powershell
npm run db:export -- --out D:\clyntique-demo\db-backups
```

Expected: one line per table with its row count, then `Export written to D:\clyntique-demo\db-backups\clyntique-<time>`. The counts should match the inventory.

The export contains password hashes. Keep it private, outside the repo. **Stop** if it fails.

**Step 2. Re-verify the target.**

```powershell
npm run db:target
```

It must show the same host and database as in check 1.

**Step 3. Drift check again.** Repeat check 4 immediately before writing. It must exit `0`.

**Step 4. Mark the baseline as applied.** This writes only Prisma's `_prisma_migrations` table; it does not run `0_init`.

```powershell
npx prisma migrate resolve --applied 0_init
```

Expected: `Migration 0_init marked as applied.`

**Step 5. Apply M1A.**

```powershell
npm run db:migrate:status
```

Expected: only `20261009180000_submission_workflow` is pending.

```powershell
npx prisma migrate deploy
```

Expected: `Applying migration 20261009180000_submission_workflow`, then `All migrations have been successfully applied.`

**If it reports an error, stop** and go to §6.

**Step 6. Verify.**

```powershell
npm run db:migrate:status
```

Expected: `Database schema is up to date!`

```powershell
npm run db:inventory
```

Expected:
- Original tables have the same row counts as the export.
- New tables are present, plus `_prisma_migrations`.
- Every creative shows `LEGACY_CLIENT_APPROVAL / <its old status>`, so an old `APPROVED` stays `APPROVED`.
- `M1A tables present: 14/14`.
- The `CreativeStatus` enum ends with `SUBMITTED,REVIEW_COMPLETE`.
- `CreativeWorkflow` exists.
- Markets `US,CA,AE`; platforms `META,TIKTOK,GOOGLE,SNAPCHAT,LINKEDIN,X,OTHER`.

**Step 7. Rotate the demo passwords and add the second test client.** This writes only those demo accounts.

Set the passwords for this PowerShell session only (at least 12 characters, new, not stored in `.env`):

```powershell
$env:SEED_TEAM_PASSWORD = "<new team password>"
```

```powershell
$env:SEED_CLIENT_PASSWORD = "<new client password>"
```

```powershell
$env:SEED_CLIENT2_PASSWORD = "<second client password>"
```

```powershell
$env:SEED_CONFIRM_DATABASE = "<database name from db:target>"
```

Dry run:

```powershell
npx tsx prisma/seed.ts
```

Expected: `skip … already exists` for team and client, and `create … client2@clyntique.demo`.

Apply:

```powershell
npx tsx prisma/seed.ts --apply --rotate
```

Expected: `done: rotate password for TEAM…`, `done: rotate password for CLIENT…`, `done: create CLIENT client2@…`.

Clear the variables:

```powershell
Remove-Item Env:SEED_TEAM_PASSWORD, Env:SEED_CLIENT_PASSWORD, Env:SEED_CLIENT2_PASSWORD, Env:SEED_CONFIRM_DATABASE
```

**Step 8. Login tests** (local, `npm run dev`):
- Team signs in with the new password and lands on `/admin`.
- Client signs in and lands on `/dashboard`, seeing their existing dummy project.
- Client2 signs in and sees **no** projects.
- The **old** passwords now show "Invalid email or password."
- Existing pages still load: projects, creatives, activity.

**Don't use the team "Add creative" button** until M3. After migration it would create a team-made creative marked as new-workflow. D6 is deferred, and M3 replaces this flow.

**Step 9. Enable login rate limiting locally.** Add `LOGIN_RATE_LIMIT="enabled"` to `.env` and restart `npm run dev`.

Test it: enter a wrong password for client2 six times. The sixth attempt should show "Too many sign-in attempts…". That account stays locked for 15 minutes from that address.

`npm run db:inventory` then shows rows in `LoginAttempt`. They store hashed keys only.

**Step 10. Ready for M3 when:**
- inventory matches step 6,
- all logins work and old passwords fail,
- rate limiting works locally, and
- Vercel has been handled per §5.

Send me the outputs of `db:inventory` and `db:migrate:status`. They contain no secrets.

## 5. Vercel: coordinate the deployment

What's in the repo:
- No `vercel.json`, `.vercel` folder or CI config.
- The build runs `prisma generate && next build`. **Deploys never run migrations.**
- The Git remote is GitHub `Clyntique/clyntique-demo`.
- Whether Vercel deploys automatically on push is set in the Vercel dashboard (check 2), not in the repo.

| Situation | Effect |
|---|---|
| **Current production code + migrated database** | Works. The changes are additive and the old Prisma client ignores new columns. One catch: the old "Add creative" button would create new-workflow-marked rows, so don't use it |
| **New code (M0/M1A/M2) + un-migrated database** | **Breaks writes.** The new Prisma client expects columns that don't exist yet. This happens if you push before §4 step 5 |
| **New code + migrated database** | Works. Same behaviour as today; M2 isn't wired into the UI |
| **Preview deployments** | Use the *Preview* `DATABASE_URL`. If it's the same database, previews follow the same rules |

**Order:**
1. Don't push until the migration is verified (§4 step 6).
2. Migrate.
3. Push and let Vercel deploy. That's your Git step.
4. In Vercel **Environment Variables** (Production, and Preview if it uses this database):
   - Set `LOGIN_RATE_LIMIT=enabled` **only after** the new code is deployed.
   - Optionally set a new `SESSION_SECRET` (≥ 32 characters) to end all existing sessions.
   - Redeploy so the variables take effect.
5. Test the production login with the new passwords.

If a new deployment misbehaves, use Vercel's **Instant Rollback** to the previous deployment. The migrated database supports both versions.

**Expected downtime: none.** The migration takes seconds on these small tables, and the current app keeps serving throughout.

## 6. Recovery

| Problem | What to do |
|---|---|
| A check in §3 fails | Change nothing. Send me the (secret-free) output |
| `migrate resolve` hit the wrong database | Nothing is migrated yet. Stop, and send me the `db:migrate:status` output |
| `migrate deploy` fails | Run `npm run db:migrate:status` and `npm run db:inventory` and send them to me. Then, with approval, run the rollback (below). Pre-M1A data is untouched. After fixing the cause, run `npx prisma migrate deploy` again |
| Need to undo M1A after a successful migration | The same rollback commands. The script refuses if any creative or activity already uses the new statuses or event types |
| Lost or damaged dummy data | The JSON export from step 1 is the reference copy. Rows can be re-inserted with a small import script; I'll write it if needed |
| Bad Vercel deploy | Vercel → Deployments → Instant Rollback |

Rollback (approval needed):

```powershell
npx prisma db execute --file docs/audit/m1a/rollback-m1a.sql
```

Then mark the migration rolled back:

```powershell
npx prisma migrate resolve --rolled-back 20261009180000_submission_workflow
```

## 7. Reset plan (only if the drift check fails, with a separate approval)

Use this only if check 4 shows real differences that can't be fixed by adjusting the baseline, and only after explicit written approval naming the database. **Dummy data doesn't make an uncontrolled reset safe**: it deletes everything, including accounts, and breaks the live app until you re-seed.

1. **Gate.** Take the export (§4 step 1) and confirm it succeeded. Run `npm run db:target` and confirm the host and database aloud. In Vercel, pause automatic deploys or accept that production will be empty.
2. **Reset.** `npx prisma migrate reset` drops all tables and data in that database, then applies `0_init` and M1A from scratch. It asks for confirmation; answer only after re-checking the host. Don't add `--force`. The configured seed runs in dry-run mode and creates nothing.
3. **Rebuild.** Run the seed (§4 step 7, with `--apply`, without `--rotate`). Recreate the dummy projects in the UI.
4. **Recovery.** If you need the old dummy rows back, restore them from the JSON export with an import script (not written yet; I'll prepare it on request).

## 8. Approvals I need from you

1. Running the read-only checks in §3 (they connect to the database). You can run them yourself, or approve me to.
2. Step 1 (export) and steps 4–6 (baseline and migration).
3. Step 7 (password rotation and creating `client2@clyntique.demo`).
4. Step 9, and the Vercel environment changes in §5.
5. The push/deploy timing in §5 (your Git step).
6. Any rollback (§6) or reset (§7). Each needs its own explicit approval.

Once the outputs in step 10 look right, M3 can start.
