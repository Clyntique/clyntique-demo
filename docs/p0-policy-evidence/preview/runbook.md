# P0 Preview runbook (approved October 28, 2026)

Approved by Deepanshi on October 28: prepare and run the P0 Preview migration and deployment, set up exactly two Preview test policy admins, import the 12 research drafts as DRAFT / UNVERIFIED, and run the Preview end-to-end tests.

**Not approved:** any Production change, including the Production database, Production env vars, Production permissions, merging into `main`, or a Production deploy. The separate YC demo-login and clickable-logo work stays unchanged.

The commands run on GT (Windows, PowerShell) in the local checkout. Never print, paste or commit a connection string, password or token. Every step has a **gate**: if it fails, stop and report.

## 0. Branch

```powershell
git fetch origin
git checkout feature/p0-policy-evidence
git pull origin feature/p0-policy-evidence
npm ci
npx prisma generate
```

## 1. Confirm the target is Preview (read-only)

Point `DATABASE_URL` at the Preview database for this PowerShell session only. Take the value from the local env file that holds the Preview URL. Don't print it.

```powershell
npm run db:target -- --env-file <file>     # repeat for each candidate env file
# Load the one whose Database line is clyntique_demo_preview into this session, e.g.
#   $env:DATABASE_URL = (Get-Content <file> | Select-String '^DATABASE_URL=').ToString().Split('=',2)[1].Trim('"')
npm run db:target                          # must print: Database: clyntique_demo_preview
npm run db:preflight
npx prisma migrate status
```

**Gate:** `Database: clyntique_demo_preview` on the expected Render host. `migrate status` lists exactly one pending migration, `20261028000000_policy_structure_and_evidence`. If it shows `cyntique_demo` (Production) or anything else, **stop**.

## 2. Recoverable backup (read-only)

```powershell
npm run db:export -- --out D:\clyntique-demo\db-backups
```

**Gate:** the export finishes, and its table and row counts match `npm run db:inventory`. Note the backup folder name for the report. Never commit it.

## 3. Verify the rollback plan before applying

- **Rollback 1, SQL:** `docs/p0-policy-evidence/sql/rollback-policy-structure-and-evidence.sql`. It runs as one transaction and removes only what the migration added. It refuses while any P0 record exists, unless its confirmation line is uncommented after a fresh export. It was tested on PostgreSQL 16: apply, rollback, re-apply, and refusal while data exists.
- **Rollback 2, restore:** `npm run db:restore -- --dir <backup folder>` (dry run first) restores the export from step 2 into an empty database.
- **Rollback 3, app:** the Preview deployment can be redeployed from any earlier commit. Production is untouched throughout.

Check the scripts:

```powershell
npx vitest run tests/shared-db-apply-scripts.test.ts tests/migrations.test.ts
npm run db:restore -- --dir <backup folder>        # dry run only: reads the export, writes nothing
```

**Gate:** the tests pass and the restore dry run reads every table with no errors.

## 4. Apply the migration to Preview

```powershell
npm run db:target                                  # again: clyntique_demo_preview
npx prisma db execute --file docs/p0-policy-evidence/sql/apply-policy_structure_and_evidence.sql
npx prisma migrate resolve --applied 20261028000000_policy_structure_and_evidence
npx prisma migrate status                          # "Database schema is up to date"
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code   # exit 0 = no difference
npm run db:inventory                               # same row counts as before, plus EvidenceAssessment = 0
```

**Gate:** the schema is up to date, the diff is empty and the existing row counts are unchanged. If the apply fails, it rolls back on its own (one transaction). Report the error and stop.

## 5. Exactly two Preview policy admins

Admin A is `team@clyntique.demo`, which already exists on Preview. Admin B is a separate TEAM account, created by the script. Its password comes from the environment secret `PREVIEW_ADMIN_B_PASSWORD`, which you set from your password manager and never type into chat.

```powershell
npx tsx prisma/preview-policy-admins.ts --admin-a team@clyntique.demo --admin-b policy-admin-b@clyntique.demo
$env:PREVIEW_ADMIN_CONFIRM_DATABASE = "clyntique_demo_preview"
npx tsx prisma/preview-policy-admins.ts --admin-a team@clyntique.demo --admin-b policy-admin-b@clyntique.demo --name-b "Preview Policy Admin B" --apply
```

**Gate:** "Policy admins now: … (2)". The script refuses any database other than `clyntique_demo_preview`, and it stops if any other account already has the flag.

## 6. Import the 12 research drafts (DRAFT / UNVERIFIED)

```powershell
npm run db:policy-research-import -- --author team@clyntique.demo --preview-approved
$env:IMPORT_CONFIRM_DATABASE = "clyntique_demo_preview"
npm run db:policy-research-import -- --author team@clyntique.demo --preview-approved --apply
```

**Gate:** 13 sources added as UNVERIFIED and 12 rules as DRAFT / UNVERIFIED. Nothing is verified or approved by the import, and nobody verifies or approves these 12 during testing.

## 7. Vercel settings for the P0 branch Preview (Preview only)

The P0 branch must use the **Preview** database, the Preview-only Blob store and its own session secret, never Production values. In Vercel, set these variables as **Preview, branch `feature/p0-policy-evidence`**, with the same values as the `demo/integration-oct22-v2` branch variables:

- `DATABASE_URL` (Preview database)
- `BLOB_READ_WRITE_TOKEN` (Preview store)
- `SESSION_SECRET`
- `GEMINI_API_KEY`
- `DEMO_LOGIN`, if the Preview demo buttons are wanted

```powershell
vercel env ls preview                       # names only; check what applies to all Previews
# For each variable above:
#   vercel env add <NAME> preview feature/p0-policy-evidence
```

Then redeploy the branch: push a commit, or use "Redeploy" on the latest branch deployment.

**Gate:** the branch deployment is Ready, and the login page loads through the share link. Production env vars are not touched.

## 8. Preview end-to-end tests

Run `docs/p0-policy-evidence/preview/preview-e2e.mjs`. The header of that file lists the environment it needs. It creates only records labelled `[P0 PREVIEW TEST]`, including its own clearly labelled test rule and source, and it never verifies or approves the 12 research drafts. Results go to `results.json` plus screenshots, each test marked PASS, FAIL or BLOCKED.

## Report back

For each step, report the gate result, the backup folder name, the Preview URL and the test results. Never include connection strings, passwords or tokens.
