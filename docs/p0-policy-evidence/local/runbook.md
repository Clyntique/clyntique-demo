# P0 local validation on GT (free tier, approved October 29, 2026)

Approved by Deepanshi on October 29 (Option A). Everything runs on GT against a **disposable local PostgreSQL** and a **local Blob mock**.

Nothing touches:
- Render or its databases
- Vercel settings
- any Blob store, real or Production
- Production

PR #7 stays a draft. Credentials stay outside Git and are never printed.

These steps were rehearsed end to end in the cloud workspace on October 29:
- migration check: 15/15
- browser tests: 22 pass, 1 blocked (no Gemini key)

## 0. Tools (one time)

- PostgreSQL 16 portable (EDB Windows x64 zip) in `D:\clyntique-demo\tools\pgsql16`.
- In the worktree `D:\clyntique-demo\p0-preview` on `feature/p0-policy-evidence`: `git pull`, `npm ci`, `npx prisma generate`, `npx playwright install chromium`.

```powershell
$pg = "D:\clyntique-demo\tools\pgsql16\pgsql\bin"
& "$pg\initdb.exe" -D D:\clyntique-demo\local-pg\data -U postgres -A trust -E UTF8
& "$pg\pg_ctl.exe" -D D:\clyntique-demo\local-pg\data -o "-p 5433 -c listen_addresses=localhost" -l D:\clyntique-demo\local-pg\log.txt start
& "$pg\createdb.exe" -h localhost -p 5433 -U postgres p0_local_mig
& "$pg\createdb.exe" -h localhost -p 5433 -U postgres p0_local_app
```

## 1. Migration apply, rollback and re-apply (local only)

```powershell
$env:DATABASE_URL = "postgresql://postgres@localhost:5433/p0_local_mig"
node scripts/p0-local-migration-check.mjs --reset
```

The script refuses any host but localhost and any database not named `p0_local*`. It does the following:
1. Rebuilds the pre-P0 schema exactly as Prisma records it.
2. Applies the P0 script with `migrate resolve`, then checks `migrate status` and `migrate diff`.
3. Rolls back and checks that only P0 objects were removed.
4. Re-applies the migration.
5. Checks that the rollback **refuses** while P0 data exists.

**Gate:** 15 PASS, 0 FAIL.

## 2. Unit, type, lint and DB checks

```powershell
npx tsc --noEmit
npx eslint .
npx vitest run
$env:DATABASE_URL = "postgresql://postgres@localhost:5433/p0_local_mig"; npx prisma migrate deploy
npx vitest run --config vitest.db.config.ts
```

On Windows, two SQL-file tests can fail only because of CRLF line endings in the checkout. If that happens, report it and confirm with `git config core.autocrlf`.

## 3. Local app database: demo accounts, two policy admins, 12 drafts

The passwords come from your local env or files outside the repo. They are never typed in chat. Use a fresh, random admin B password, stored in `D:\clyntique-demo\secrets\local-admin-b.txt`.

```powershell
$env:DATABASE_URL = "postgresql://postgres@localhost:5433/p0_local_app"
npx prisma migrate deploy
$env:SEED_CONFIRM_DATABASE = "p0_local_app"
npx tsx prisma/seed.ts --apply                      # SEED_TEAM_PASSWORD, SEED_CLIENT_PASSWORD, SEED_CLIENT2_PASSWORD set
npm run db:demo-fixtures -- --apply
$env:PREVIEW_ADMIN_CONFIRM_DATABASE = "p0_local_app"
npx tsx prisma/preview-policy-admins.ts --admin-a team@clyntique.demo --admin-b policy-admin-b@clyntique.demo --apply   # PREVIEW_ADMIN_B_PASSWORD set
$env:IMPORT_CONFIRM_DATABASE = "p0_local_app"
npm run db:policy-research-import -- --author team@clyntique.demo --apply
```

**Gate:**
- "Policy admins now: team@clyntique.demo, policy-admin-b@clyntique.demo (2)".
- 13 sources UNVERIFIED and 12 rules DRAFT / UNVERIFIED.

## 4. Local production build with the Blob mock

The mock (`scripts/local-blob-mock.mjs`) stores files in a folder outside the repo. It enforces the client token's signature, expiry, path, type and size. The app accepts mock files only when **all** of these hold (`src/lib/review/local-blob-mock.ts`):
- the setting points at `http://localhost`;
- the database is local;
- the token is a fake `localmock` token;
- the app is not on Vercel.

On Vercel, the build fails if any mock setting is present.

```powershell
$env:DATABASE_URL = "postgresql://postgres@localhost:5433/p0_local_app"
$env:BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_localmock_" + [guid]::NewGuid().ToString("N")
$env:CLYNTIQUE_LOCAL_BLOB_MOCK = "http://localhost:3999"
$env:VERCEL_BLOB_API_URL = "http://localhost:3999"
$env:NEXT_PUBLIC_VERCEL_BLOB_API_URL = "http://localhost:3999"
$env:SESSION_SECRET = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
# Optional live AI: $env:GEMINI_API_KEY from D:\clyntique-demo\secrets\gemini-test.env (a separate free key, never the Production one)
Start-Process node -ArgumentList "scripts/local-blob-mock.mjs","--port","3999","--dir","D:\clyntique-demo\local-blob" -NoNewWindow
npm run build          # if Next.js stops once with its security-upgrade notice, run it again (PR #8 fixes the notice)
npx next start -p 3100
```

## 5. Browser tests

In a second PowerShell, with the same passwords set:

```powershell
$env:BASE_URL = "http://localhost:3100"; $env:OUT_DIR = "D:\clyntique-demo\preview-p0-oct28\local-e2e"
$env:ADMIN_A_PASSWORD = $env:SEED_TEAM_PASSWORD; $env:ADMIN_B_PASSWORD = $env:PREVIEW_ADMIN_B_PASSWORD
$env:CLIENT_PASSWORD = $env:SEED_CLIENT_PASSWORD; $env:CLIENT2_PASSWORD = $env:SEED_CLIENT2_PASSWORD
node docs/p0-policy-evidence/preview/preview-e2e.mjs
```

**Gate:** 23 tests, each PASS, FAIL or BLOCKED, with results in `results.json` and screenshots. Test 12 (live Gemini) is BLOCKED when no test key is set.

## Stop and report

- Stop at any failed gate and report it.
- Stop and report if anything asks for a Render, Vercel or Production credential, because that would be an unexpected Production dependency.
- Afterwards, stop `next start`, the mock and PostgreSQL (`pg_ctl stop`). The local databases can stay for re-runs.
