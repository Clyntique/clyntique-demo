# M1A report: schema preparation and offline migrations

Date: 2026-10-09. Scope: **M1A only**.

What was **not** done:
- No migration was applied.
- Nothing connected to Render or any network database. Every Prisma command ran with `DATABASE_URL` overridden to an unreachable placeholder.
- No `db push`, `migrate dev` or `migrate reset`.
- No Git commands, no deploy.
- Nothing from M2–M8.

AI analysis, government approval, platform acceptance and Compliance Passport generation are **not** implemented. Nothing in the schema represents them as implemented.

## 1. Schema changes (`prisma/schema.prisma`)

All changes are additive. Existing models, columns, relations and enum values are unchanged.

| Area | Change | Notes |
|---|---|---|
| Legacy identification | New enum `CreativeWorkflow { LEGACY_CLIENT_APPROVAL, SUBMISSION_REVIEW }`; `Creative.workflow` (NOT NULL, default `SUBMISSION_REVIEW`) | Existing rows are set to LEGACY by the migration (§2). Never inferred from other columns |
| Client-owned submissions | `Creative.createdById` (nullable FK → User, Restrict), `Creative.submittedAt` | Null on legacy rows |
| Lifecycle | `CreativeStatus` + `SUBMITTED`, `REVIEW_COMPLETE` | `APPROVED` stays as a legacy-only value. `REVIEW_COMPLETE` only means the cycle is closed; the human outcome lives in `ReviewDecision` |
| Review cycles | `ReviewCycle` (creative, number, openedBy, reason, openedAt, closedAt; unique per creative+number) | Reopening (D7) is not implemented |
| Resubmissions | `SubmissionRound` (cycle, number, **exact version submitted**, submittedBy; unique per cycle+number) | Plan §16.6 |
| Human decisions | `ReviewDecision` (cycle, round, **version**, reviewer, kind `CHANGES_REQUESTED`/`FINAL`, outcome?, summary, scopeNote); unique per round | Outcome enum `NO_ISSUES_IDENTIFIED / ISSUES_RESOLVED / COMPLETED_WITH_OPEN_ISSUES / NOT_REVIEWABLE`. **Values pending D3** |
| Findings | `Finding` (cycle, version identified, reviewer, issue, explanation, **severity**, **requiredAction**, **actionDetails**, status, publish/resolve fields, resolvedInVersion) | Severity `HIGH/MEDIUM/LOW/ADVISORY` (reviewer-assessed). Action `REVISE_CONTENT/PROVIDE_EVIDENCE/CLARIFY/ACKNOWLEDGE`. **Values pending B3** |
| Finding history | `FindingEvent` (from/to status, actor, note), append-only | |
| Client responses | `FindingResponse` (author, message, optional version/round), append-only | |
| Evidence associations | `FindingEvidence` (finding ↔ evidence, linkedBy) | |
| Evidence attribution | `Evidence.origin` (`CLIENT_SUBMITTED`/`REVIEWER_ADDED`, null = legacy), `addedById`, `visibility` (`SHARED` default / `INTERNAL`), `versionId?`, `withdrawnAt/ById` | No "verified" field anywhere. File attachments (D8) are **not** added yet |
| Markets and platforms | `Market` (ISO code PK, name, kind COUNTRY/SUBDIVISION, parentCode, active, sortOrder), `AdPlatform`; joins `SubmissionMarket`, `SubmissionPlatform`, `FindingMarket`, `FindingPlatform` | Review context only. Reference rows: US, CA, AE; platforms META, TIKTOK, GOOGLE, SNAPCHAT, LINKEDIN, X, OTHER (**list pending §16.1**). Subdivisions supported but none seeded |
| Activity | `ActivityType` + `SUBMISSION_SUBMITTED, EVIDENCE_SUBMITTED, REVIEW_STARTED, FINDING_RECORDED, RESUBMITTED, REVIEW_COMPLETED`; `Activity.creativeId?` + index | Old rows untouched |
| Rate limiting | `LoginAttempt` (hashed key, succeeded, createdAt; index key+createdAt) | Not used by code yet (M2) |
| Legacy approvals | `Approval` table **unchanged** | Kept as read-only history |

**Deliberately not added** (unapproved): asset types for web/landing pages (§16.2), evidence file columns (D8), claim/rule tables, support-access grants, reviewer assignment. Each can be added later without changing existing rows.

## 2. Migrations (`prisma/migrations/`)

| Order | Folder | Content |
|---|---|---|
| 1 | `0_init/migration.sql` | **Baseline**: the schema exactly as it existed before M1A, generated with `migrate diff --from-empty --to-schema <pre-M1A schema>`. On Render it must be **marked as applied**, not run (§5) |
| 2 | `20261009180000_submission_workflow/migration.sql` | Additive changes, generated with `migrate diff --from-schema <pre-M1A> --to-schema prisma/schema.prisma`, plus **two marked hand edits** |
| — | `migration_lock.toml` | `provider = "postgresql"` |

The pre-M1A schema is kept at `docs/audit/m1a/pre-m1a-schema.prisma`. The operator needs it for the read-only drift check.

**Hand edit 1, the legacy marker.** The generated SQL added `workflow … DEFAULT 'SUBMISSION_REVIEW'`, which would have marked **existing** creatives as new-workflow. The migration instead does:

```sql
ADD COLUMN "workflow" "CreativeWorkflow" NOT NULL DEFAULT 'LEGACY_CLIENT_APPROVAL';  -- every existing row
ALTER TABLE "Creative" ALTER COLUMN "workflow" SET DEFAULT 'SUBMISSION_REVIEW';       -- every new row
```

**Hand edit 2, reference data.** `INSERT … ON CONFLICT DO NOTHING` for the 3 markets and 7 platforms.

The migration contains **no DROP, RENAME, TRUNCATE, DELETE, UPDATE or column-type change**.

## 3. Verification (offline)

**In-memory PostgreSQL (PGlite 0.2.17, PostgreSQL 16)**, installed in a scratch folder rather than in the project. Script: `docs/audit/m1a/verify-migrations.mjs`.

1. Applied `0_init`.
2. Inserted fictional legacy rows: creatives in IN_REVIEW, DRAFT, **APPROVED** and CHANGES_REQUESTED, plus a version, a client approval, evidence and activity.
3. Applied the additive migration in one transaction, as `migrate deploy` does.

| Check | Result |
|---|---|
| All existing creatives became `LEGACY_CLIENT_APPROVAL` | PASS |
| Existing statuses unchanged (APPROVED stays APPROVED) | PASS |
| New columns null on existing creatives | PASS |
| Legacy approval, evidence and activity rows untouched | PASS |
| Row counts preserved | PASS |
| A new creative defaults to `SUBMISSION_REVIEW` / `DRAFT` | PASS |
| New enum value usable after commit | PASS |
| Markets US, CA, AE and 7 platforms seeded | PASS |
| Migrated database **identical** to a database built straight from the new `schema.prisma` (columns, defaults, constraints, indexes, enum values) | PASS |

**Control run:** the same script against the *unedited* generated SQL fails as expected. Existing rows came out as `SUBMISSION_REVIEW` and there was no reference data. The checks are meaningful.

**Project checks** (with the offline `DATABASE_URL`):

| Command | Result |
|---|---|
| `npx prisma validate` | Valid |
| `npx prisma generate` | OK |
| `npx tsc --noEmit` | Pass, after the compatibility edit below. Before it: **4 errors** |
| `npm run lint` | Pass |
| `npm test` | **53/53 pass** (48 existing + 5 new static migration checks in `tests/migrations.test.ts`) |
| `npm run build` | Pass (20 pages) |

**Failure caused by the schema change, and the fix.** Adding enum values broke three exhaustive `Record<…>` lookup maps:
- `STATUS_STYLES` in `src/components/ui/status-badge.tsx`
- `REVIEW_STATE` (two entries) in `src/components/workspace/copy.ts`
- the activity dot map in `src/components/workspace/activity-feed.tsx`

I added **label/colour entries only** ("Submitted", "Review complete", and dot colours for the new activity types). No code sets these values, so app behaviour is unchanged. These three edits are the only application-code changes. Revert them if you'd rather have the build fail until M6.

## 4. Compatibility risks

1. **New code against an unmigrated database fails on writes.** The regenerated Prisma client includes the new columns. Prisma calls that return every column (e.g. `activity.create`, `creative.update`, `evidence.create` without `select`) will fail against an unmigrated database with a "column does not exist" error. This is expected from how Prisma works; I didn't run it, because that would mean connecting to the database. **Don't run this tree against the shared Render database until it is migrated.** Reads with explicit `select` keep working.
2. **The old app against a migrated database works**: the changes are additive, with nullable columns or defaults, and the new enum values are unused. **One exception:** a creative created through the current team "Add creative" flow would get the default `SUBMISSION_REVIEW` even though it follows the legacy flow. The workflow value is never updated afterwards. Mitigation: create no creatives between the migration and the M3 deploy, or apply both in the same window. M3 sets `workflow` explicitly (D6 decides the team on-behalf case).
3. **Enum names become expensive once applied.** Before the migration is applied, every new enum and value can still be renamed for free. Afterwards, renaming needs another migration, and `ADD VALUE` cannot be undone easily. **Confirm D3 (outcomes), B3 (severity/actions) and the §16.1 platform list before applying.**
4. **The baseline must match the live database.** `0_init` assumes Render matches the pre-M1A schema exactly, which the audit read suggests. Confirm with the read-only drift check (§5 step 3) before `migrate resolve`.
5. **PostgreSQL 12 or newer is required.** The migration adds enum values inside a transaction. Check the Render instance's version.
6. **Delete behaviour.** Child rows cascade from `Creative` as today. Actor foreign keys are `Restrict`, so users with review history can't be deleted. That is intended for audit, and no user deletion feature exists.
7. **`sslmode`.** Migrate commands may need the README's `sslmode=require` workaround.

## 5. Database preparation (REQUIRES OPERATOR APPROVAL; none of this was run)

**Recommended for the October 23 demo timeline: a separate development database first.** It unblocks M2+ browser testing without touching shared data.

- **A. New empty dev database:**
  1. Create a new Render/Postgres instance.
  2. Set its URL locally.
  3. `npx prisma migrate deploy`: applies `0_init` and then the M1A migration from scratch.
  4. Run the seed with `--apply` (M0 procedure), setting `SEED_CONFIRM_DATABASE` to the dev database name.
- **B. Shared Render database**, in this order:
  1. Confirm the enum names (§4 point 3).
  2. Take a Render backup or snapshot.
  3. Rotate the demo credentials (`m0-operator-steps.md`).
  4. Drift check (read-only):
     ```bash
     npx prisma migrate diff --from-config-datasource --to-schema docs/audit/m1a/pre-m1a-schema.prisma --exit-code
     ```
     Exit code 0 means the live database equals the baseline. Exit code 2 means **stop and report**.
  5. Mark the baseline as applied (writes only the `_prisma_migrations` table):
     ```bash
     npx prisma migrate resolve --applied 0_init
     ```
  6. Check what is pending (read-only):
     ```bash
     npx prisma migrate status
     ```
  7. Apply the additive migration:
     ```bash
     npx prisma migrate deploy
     ```
  8. Verify with a read-only query, e.g. `SELECT workflow, status, count(*) FROM "Creative" GROUP BY 1,2;`. Every pre-existing row should read `LEGACY_CLIENT_APPROVAL`, and the counts should match the backup.
  9. Deploy the matching application code in the same window (§4 points 1–2).
- **Never:** `db push`, `migrate dev`, `migrate reset` or `--accept-data-loss` against Render.

## 6. Files

**New:**
- `prisma/migrations/0_init/migration.sql`
- `prisma/migrations/20261009180000_submission_workflow/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `tests/migrations.test.ts`
- `docs/audit/m1a-report.md`
- `docs/audit/m1a/pre-m1a-schema.prisma`
- `docs/audit/m1a/verify-migrations.mjs`

**Modified:**
- `prisma/schema.prisma`
- `src/components/ui/status-badge.tsx`, `src/components/workspace/copy.ts`, `src/components/workspace/activity-feed.tsx` (labels only)
- `README.md`: migrations replace `db push` for new databases
- `docs/audit/stage-a-correction-plan.md`: M1 row

**Regenerated, git-ignored:** `src/generated/prisma`, `.next`.

## 7. Next steps (each needs your approval)

1. **Product confirmations before applying anything:** D3 outcome names, B3 severity and actions, the §16.1 platform list, D6 (team on-behalf creation), and A4 (dev database).
2. **Operator:** create the dev database (§5A). Optionally plan the Render steps (§5B).
3. **M2 (workflow core):** pure transition and policy modules plus the rate limiter, with mocked tests. This can start before any database is migrated.
4. **M3–M6:** submissions, review, remediation and dashboards. Browser testing needs the dev database.

M1A is complete. I'm stopping here and waiting for your approval.
