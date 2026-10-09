# Phase 1: read-only check results (existing Render database)

Date: 2026-10-09. Only read-only commands were run. Nothing was written to the database: no export, `migrate resolve`, `migrate deploy`, password change, reset or rollback. No Git commands, no deploy.

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Target | **PASS** | `.env` → host `dpg-db3sfh8m7kps73ft1vc0-a.ohio-postgres.render.com`, database `cyntique_demo`, SSL `verify-full`. No environment override |
| 2 | Version and tables | **PASS** | PostgreSQL 18.6 (12+ required). 8 tables: Activity, Approval, Comment, Creative, CreativeVersion, Evidence, Project, User |
| 3 | Dummy data | **PASS** | 2 users (1 TEAM, 1 CLIENT), both `@clyntique.demo`. 2 projects, 2 creatives (1 DRAFT, 1 IN_REVIEW), 3 activity rows. 0 versions, approvals, comments and evidence |
| 4 | Migration history | **PASS** | `_prisma_migrations` does not exist (expected for a `db push` database) |
| 5 | M1A objects | **PASS** | 0/14 M1A tables. Enums `CreativeStatus` and `ActivityType` have only their pre-M1A values; `CreativeWorkflow` is absent |
| 6 | Drift vs pre-M1A baseline | **PASS** | `migrate diff --from-config-datasource --to-schema docs/audit/m1a/pre-m1a-schema.prisma --exit-code` → "No difference detected.", exit 0 |
| 7 | Migration status | **PASS** | 2 migrations found; `0_init` and `20261009180000_submission_workflow` not yet applied. Exit 1 is Prisma's normal code for pending migrations |

**Database name.** It is `cyntique_demo`, without the "l". That is how it was created; just use that exact spelling for `SEED_CONFIRM_DATABASE`.

**Important for the next phase.** `0_init` must be marked as applied with `migrate resolve` *before* `migrate deploy`. Otherwise deploy would try to create tables that already exist, and fail.

**Not checked:** the old-password sign-in test (plan check 6). It wasn't in this approval, and it would start the app.

## Vercel (local view)

- The repo has no `vercel.json`, `.vercel` folder or CI configuration.
- The build runs `prisma generate && next build`, so a deploy never migrates the database.
- Local `.env` contains only `DATABASE_URL` and `SESSION_SECRET`, with no `VERCEL_*` variables. So it was not pulled from Vercel, and it doesn't show which database Vercel uses.

**Check manually in the Vercel dashboard:**
1. **Settings → Environment Variables → `DATABASE_URL`** for Production, Preview and Development. Compare only the host with `dpg-db3sfh8m7kps73ft1vc0-a`.
2. **Settings → Git:** whether the repo is connected, and which branch deploys to production automatically.
3. **Deployments:** which commit production is running. It should be pre-M0 code, which works on the migrated schema.

**Verdict: the database is ready for the additive M1A migration** (plan §4, steps 1–6), pending your approval and the Vercel check above.
