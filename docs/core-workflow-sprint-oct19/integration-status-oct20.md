# Integration status — `demo/integration-oct22-v2` (Oct 19 evening, for Oct 20)

Built per the CEO's Decision 3. Not merged to `main`, not deployed to Production, no shared-database operation.

## What is in the branch, in merge order
| Step | Source | Commit merged | Conflicts | Notes |
|---|---|---|---|---|
| base | `main` | `a0c90d2` | — | integration-oct22: homepage animations, auth pages |
| 1 | PR #1 `feature/demo-workflow-completion` | `7287d60` | none | hardening, signup, demo login, AI grounding tests |
| 2 | PR #2 `feature/hero-redesign` | `3192278` | none | cloud hero, white second section, mobile fixes; removes the `workflow-section.tsx` lint error |
| 3 | Reviewer chat | `5c2f72d`, taken from the chat thread's bundle at `/mnt/project-files/clyntique/reviewer-chat/feature-reviewer-chat.bundle` (that thread has no GitHub access, so it could not push; the commit keeps its original author and hash) | `package.json` | kept both scripts: `db:concurrency-check` (PR #1) and `db:chat-check` (chat) |
| 4 | PR #4 `feature/core-workflow-sprint-oct19` | `5399c0f` | `prisma/schema.prisma`, `src/components/submissions/submission-view.tsx`, `tests/migrations.test.ts` | schema: both `User` relation lists and both model sets kept (Conversation/Message and the five lifecycle models), then `prisma format`; submission view: "Review record" chip and "Chat with reviewer" button both kept in the header; migrations test: both folders listed, chat first |
| 5 | lint fix | new commit on this branch | — | `src/components/ui/scroll-reveal.tsx`: the one remaining `react-hooks/set-state-in-effect` error (an Antigravity file). The "no IntersectionObserver" fallback is now the lazy initial state instead of a `setState` inside the effect; behaviour unchanged. **For Antigravity to review**; it is a separate commit so it can be dropped or redone. |

Migrations present, in order: `0_init`, `20261009180000_submission_workflow`, `20261011090000_evidence_files`, `20261012190000_round_snapshot`, `20261014220000_compliance_policy_library`, `20261019180000_reviewer_chat`, `20261019190000_lifecycle_records`. Both new migrations are additive; neither has been applied anywhere shared.

## Checks on the integrated branch
| Check | Result |
|---|---|
| `npx prisma generate` + `npx prisma validate` | OK |
| Fresh local PostgreSQL 16, `prisma migrate deploy` | all 7 applied in order; `migrate status` up to date; `migrate diff` schema vs database: empty |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | **0 errors** (was 2 on `main`: one removed by PR #2, one fixed in step 5) |
| `npx vitest run` | 30 files, **392 passed** (371 from PR #4 incl. PR #1, +21 reviewer-chat tests) |
| Real-DB lifecycle check (`vitest.db.config.ts`, local DB with all 7 migrations) | 4 passed |
| `npm run build` | succeeds |

Not run here: `npm run db:chat-check` (the chat thread's real-database check; it will run it on the isolated Preview database), any browser test, any live Gemini call.

## Known behaviour on the auto-built Vercel Preview of this branch
Vercel builds the branch against the general Preview `DATABASE_URL`, which is the shared database without the two new migrations. On that Preview: existing pages work; the reviewer chat hides its card/tab/badge (its code degrades when its tables are missing); the Team AI panel shows an empty scan history; the review record and impact pages show "not available on this environment yet". None of this is a reason to migrate the shared database. The isolated database (see `isolated-preview-setup-oct20.md`) is where the new features are verified.

## What happens next (in order)
1. CEO completes Render + Vercel Steps 1–3 and sends the `db:target` and `migrate status` output (Step 4, non-secret lines only).
2. I confirm the target; CEO (or I, if the URL is added as an environment secret) runs Step 5: migrations, demo accounts with new passwords, sample fixtures.
3. Redeploy the Preview; isolation proof (sample project names) and migration proof (record page shows content).
4. Browser pass, Client and Team, of the full lifecycle; chat thread runs chat and client-isolation checks; failures reported here, demo blockers first.
5. Realistic demo data (synthetic or verified rules only).
6. Only then: client AI pre-check on its own feature branch (Decision 2).

Nothing merges to `main` and nothing reaches Production without a separate approval.
