# M1A migration report: existing Render database `cyntique_demo`

Date: 2026-10-09 (UTC ~19:06–19:12). Approved scope: backup plus additive M1A migration. Procedure: `existing-render-db-migration-plan.md` §4, steps 1–6.

**Result: SUCCESS.** All verifications passed.

Not done:
- No reset, `db push` or `migrate reset`.
- No password or account changes.
- No Vercel changes, no deploy, no Git commands.
- No M3 work.

| # | Step | Result |
|---|---|---|
| 1 | Target reconfirmed | PASS. Host `dpg-db3sfh8m7kps73ft1vc0-a.ohio-postgres.render.com`, database `cyntique_demo`, SSL `verify-full`, from `.env` (same as Phase 1) |
| 2 | Backup | PASS. `D:\clyntique-demo\db-backups\clyntique-2026-10-09T19-07-07-024Z\` (outside the repo): 8 table files plus `_manifest.json`, read from one snapshot |
| 3 | Backup verified | PASS. Activity 3, Approval 0, Comment 0, Creative 2, CreativeVersion 0, Evidence 0, Project 2, User 2. Files, manifest and inventory agree |
| 4 | Drift check | PASS. "No difference detected.", exit 0 |
| 5 | Baseline | PASS. `migrate resolve --applied 0_init` → "Migration 0_init marked as applied." Status then showed only `20261009180000_submission_workflow` pending |
| 6 | Migration | PASS. `migrate deploy` → "Applying migration 20261009180000_submission_workflow … All migrations have been successfully applied." |
| 7 | Verification | PASS. Status: "Database schema is up to date!" 23 tables: 8 original, 14 new, plus `_prisma_migrations`. Both migrations finished, none rolled back. New enum values present; markets US, CA, AE; 7 platforms. Every original row and column value is identical to the backup (compared field by field) |
| 8 | Legacy marker | PASS. Both existing creatives are `LEGACY_CLIENT_APPROVAL` (statuses DRAFT and IN_REVIEW, unchanged), with empty `createdById` and `submittedAt`. The column default for new creatives is `SUBMISSION_REVIEW` |

## Incidents (no impact on data)

1. **The first export attempt failed before reading anything.** Prisma's default 2-second wait to open a transaction was too short for Render's slow first connection. It left one empty folder: `db-backups\clyntique-2026-10-09T19-06-52-448Z`, safe to delete. I raised `maxWait` in `prisma/db-export.ts` to 30 seconds and the retry succeeded. Nothing was written to the database.
2. **The first post-migration `migrate status` returned P1001** (could not reach the server). This was a transient network error; the inventory run seconds later succeeded. One retry of the read-only check returned "up to date".

## Production impact

- **Downtime:** none observed. The migration ran in one short command.
- **If Vercel production uses this database:** the currently deployed (pre-M0) code keeps working. It ignores the new columns, and no row uses the new enum values.
- **Avoid the team "Add creative" button until M3.** After the migration it would create a team-made creative marked `SUBMISSION_REVIEW`.
- **Pushing the local code is now database-compatible.** Pushing to `main` deploys automatically. When to push stays your decision.

## Still pending (each needs approval)

1. Rotate the demo passwords and create `client2@clyntique.demo` (plan §4 step 7). The old published passwords are still active.
2. Login tests (step 8), and `LOGIN_RATE_LIMIT=enabled` locally (step 9). Then Vercel environment variables after the next deploy (§5).
3. M3.

## Changed files

- `prisma/db-export.ts`: `maxWait: 30_000`.
- `docs/audit/m1a-migration-applied-report.md`: this report.
