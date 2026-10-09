# Clyntique dev database on Render: setup guide

Goal: a **new, empty** PostgreSQL database for development and the M3+ demo, with the M1A migrations applied. The existing Render database stays untouched.

Run commands in PowerShell from `D:\clyntique-demo\clyntique`.

**Golden rule: run `npm run db:target` before every command that writes.** If the host shown is not the new dev database, stop.

## 1. Create the database in Render

Dashboard → **New** → **Postgres**, then fill in:

| Field | Value |
|---|---|
| Name | `clyntique-dev` |
| Database | `clyntique_dev` |
| User | `clyntique_dev` (or leave blank) |
| Region | Same as the existing database (Ohio) |
| PostgreSQL version | **16** (anything 12 or newer works) |
| Plan | Free is fine for the demo, but Render's free databases expire. Check the current limit, or pick the smallest paid plan if it must survive past the demo |

When it shows **Available**:
- Open it, then **Connect** → copy the **External Database URL**. Keep it private.
- Note the hostname inside it (`dpg-…`). It is **different** from the existing database's hostname.
- Optional: under **Networking / Access Control**, allow only your own IP.

## 2. Point your local `.env` at the dev database

Keep a copy of the current settings first. The copy is git-ignored, because `.gitignore` covers `.env*`.

```powershell
Copy-Item .env .env.shared-render.backup
```

Edit `.env`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The dev **External Database URL**, with `?sslmode=verify-full` appended (the same SSL mode your current URL uses) |
| `SESSION_SECRET` | A **new** random value (command below). Dev sessions then can't be used on the shared app, and vice versa |
| `BLOB_READ_WRITE_TOKEN` | Leave empty for now. Uploads need a separate private dev Blob store, which can be set up later |
| `LOGIN_RATE_LIMIT` | `enabled`, but **only after step 4** |

Generate the new secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 3. Verify the target (read-only)

Check where `.env` points, without connecting:

```powershell
npm run db:target
```

**Host** must be the new `dpg-…` hostname, and **Database** must be `clyntique_dev`. Anything else: stop and fix `.env`.

Connect read-only and list the tables:

```powershell
npm run db:check
```

It must print **`Tables (0): none`**. If any tables are listed, this is not the new empty database: **stop**.

Read-only migration check:

```powershell
npm run db:migrate:status
```

It should list 2 migrations not yet applied: `0_init` and `20261009180000_submission_workflow`.

If a Prisma command fails with **P1001** while `db:check` works, rerun that one command with `sslmode=require` instead of `verify-full`. That's the known Render workaround from the README.

## 4. Apply the migrations to the dev database only

Run `npm run db:target` once more, and confirm the dev host. Then:

```powershell
npx prisma migrate deploy
```

This builds the database from scratch: the `0_init` baseline, then the additive M1A migration, including the US/CA/AE markets and the 7 platforms.

**Use `migrate deploy` only.** Never `db push`, `migrate dev` or `migrate reset`.

Verify:

```powershell
npm run db:migrate:status
```

This should say the database schema is up to date. Then:

```powershell
npm run db:check
```

It should show **23 tables**: the original 8, the 14 new ones, and `_prisma_migrations`.

Optional, in Render's PSQL shell: `SELECT code FROM "Market";` should return US, CA and AE.

Now you can set `LOGIN_RATE_LIMIT=enabled` in `.env`.

## 5. Create the demo accounts (dev only)

Choose fresh passwords of at least 12 characters, and set them for this PowerShell session only. Don't put them in `.env`.

```powershell
$env:SEED_TEAM_PASSWORD = "<new team password>"
```

```powershell
$env:SEED_CLIENT_PASSWORD = "<new client password>"
```

```powershell
$env:SEED_CLIENT2_PASSWORD = "<second client password, for isolation tests>"
```

```powershell
$env:SEED_CONFIRM_DATABASE = "clyntique_dev"
```

Dry run first. It should plan `create` for 3 accounts:

```powershell
npx tsx prisma/seed.ts
```

Then create them:

```powershell
npx tsx prisma/seed.ts --apply
```

Clear the variables:

```powershell
Remove-Item Env:SEED_TEAM_PASSWORD, Env:SEED_CLIENT_PASSWORD, Env:SEED_CLIENT2_PASSWORD, Env:SEED_CONFIRM_DATABASE
```

## 6. Quick smoke test

```powershell
npm run dev
```

Then, in the browser:
- Sign in as `team@clyntique.demo`. Create one project assigned to Alex Morgan, and one assigned to Jordan Lee (the second client).
- Sign in as each client. Each one should see only their own project.
- **Don't use the team "Add creative" button on dev.** Team creation for clients is deferred (D6), and M3 replaces it with client-owned submissions.

## 7. Afterwards

- From now on, `.env` points at the dev database. `.env.shared-render.backup` holds the old settings, and should only be restored deliberately.
- The shared database has had nothing run against it. Its pending steps (backup, password rotation, migration) are still in `m0-operator-steps.md` and `m1a-report.md` §5B. They're for later and need your approval.
- When steps 1–6 are done, tell me the output of `npm run db:target` and the table count from `db:check`. **Don't paste the URL.** Then I can start M3.
