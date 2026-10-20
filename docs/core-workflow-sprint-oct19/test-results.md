# Test results — Oct 19 sprint

All runs on branch `feature/core-workflow-sprint-oct19` at commit `c85a1f3` plus the fail-soft commit that followed the Vercel Preview build, in the sprint container. No shared database or Blob store was contacted: unit tests mock Prisma; the real-DB check refuses any non-local `DATABASE_URL`.

## 1. TypeScript
```
npx next typegen && npx tsc --noEmit
```
Clean (no output).

## 2. ESLint
```
npx eslint .
✖ 2 problems (2 errors, 0 warnings)
  src/components/marketing/workflow-section.tsx  react-hooks/set-state-in-effect
  src/components/ui/scroll-reveal.tsx            react-hooks/set-state-in-effect
```
Both errors pre-exist on `main` (Antigravity's homepage files) and were reported in the Oct 19 audit. PR #2 removes the first. No new lint findings.

## 3. Unit tests (`npx vitest run`)
```
 Test Files  30 passed (30)
      Tests  371 passed (371)
```
Base with PR #1 merged: 332. New today: 39.

| Suite | Tests | What it proves |
|---|---|---|
| `tests/lifecycle-commands.test.ts` (new) | 16 | **Re-review**: TEAM opens cycle N+1 with round 1 on the latest version; guarded `REVIEW_COMPLETE→SUBMITTED` update; old cycle/decisions/findings never written; CLIENT and every other status refused with zero writes; a still-open cycle refused; a concurrent reopen loses the guarded update; reason/note validated; legacy records refused; trigger rule version must exist and only for POLICY_CHANGE. **External submission**: owning client records (always CLIENT_REPORTED, activity written, version looked up scoped to the creative); TEAM needs an explicit basis; another client gets "not found" with zero writes; needs a completed review; allowed during a re-review on a reviewed version only; destination/name/date/codes validated. **External outcome**: client approval stored as reported, no decision or status write; rejection/changes need the reason; append-only (two outcomes = two rows, no update/delete); other client and unknown submission refused; supporting document must be own active evidence, shared-only for a client. |
| `tests/external-status.test.ts` (new) | 6 | Exact labels; no bare "Approved"; awaiting outcome when none; latest outcome by date then record time; reported vs team-checked approval; overall "most demanding wins"; platform and regulator kept apart. |
| `tests/scan-history.test.ts` (new) | 7 | Success run recorded with creative, exact version, cycle, round, user, prompt version, rule versions evaluated, only validated suggestions (invented citation dropped), nothing unsubmitted; insufficient coverage recorded with no rules and no model call; thrown provider error recorded as ERROR with error *name* only (message with a secret-looking URL never stored); rate-limited answer recorded with findings dropped; failed history write never hides the result; cached repeat not recorded twice, forced re-run is; CLIENT refused, nothing recorded. |
| `tests/policy-rule-events.test.ts` (new) | 5 | RULE_CREATED on create (note says not active until approved); VERSION_PROPOSED with change summary; VERSION_APPROVED only after maker-checker and verified sources, naming the superseded version; RULE_RETIRED keeps version rows; non-admin TEAM writes nothing. |
| `tests/migrations.test.ts` (+1) | 9 | New folder in the ordered list; lifecycle migration contains only CREATE TYPE/TABLE/INDEX and ADD COLUMN/CONSTRAINT on the expected tables; RESTRICT on rule-version, version and rule FKs; the "no destructive statements" check now also covers it. |
| `tests/lifecycle-unavailable.test.ts` (new) | 4 | On a database without the lifecycle tables (Prisma P2021): the Team submission page's scan history degrades to empty; the record and impact loaders raise `LifecycleUnavailableError`, which their pages turn into a plain notice; any other DB error still surfaces; a client never triggers the history query. Added because Vercel built a Preview of this branch against the shared database, which has not received the migration. |
| `tests/workflow-transitions.test.ts` (updated) | 7 | `REVIEW_COMPLETE` now leads only to `SUBMITTED` via TEAM-only `REOPEN_REVIEW`; wrong-role rejection covers it. |
| All 23 pre-existing suites | 317 | Unchanged and passing: submissions, review, remediation, findings, policy, AI grounding, auth, rate limit, proxy, security headers, seeds, scope. |

## 4. Real-database check (`DATABASE_URL=<local> npx vitest run --config vitest.db.config.ts`)
```
 ✓ scripts/db-check/lifecycle.db.test.ts (4 tests)
 Test Files  1 passed (1)   Tests  4 passed (4)
```
Against the local PostgreSQL with all six migrations applied:
1. Client submits → team starts and completes the review → another client cannot record an external submission or outcome → client records a Meta submission and a reported approval → `getLifecycle` for the client shows `APPROVED_REPORTED` (platform) / `NOT_SUBMITTED` (regulator), cycle 1 with its outcome, can record external, cannot reopen; `getLifecycle` for the other client is null; TEAM can reopen and sees the recorder's name.
2. An AI scan with no verified rules is recorded as `INSUFFICIENT_COVERAGE` with cycle id, prompt version and no rule checks; the client view has no summary or model; the team view has the summary.
3. Re-review opens cycle 2 on the same version; creative is `SUBMITTED`; cycle 1's `closedAt`, decisions and rounds are byte-for-byte the same; cycle 2 has reason `TEAM_REQUEST` and one round; a second reopen is refused; the external record survives and the client can still read both cycles.
4. `createDbPolicyRule` writes exactly one `RULE_CREATED` event; the impact loader lists it for TEAM and returns null for a client.
Everything created is tagged and deleted afterwards (CASCADE and RESTRICT behaved as designed during cleanup).

## 5. Production build (`npm run build`)
Succeeds. New routes compile as dynamic pages (`◐`), the same as the existing creative pages: `/admin/creatives/[creativeId]/record`, `/dashboard/creatives/[creativeId]/record`, `/admin/policy-library/impact`. One first attempt failed because `params` was awaited outside the Suspense boundary (cacheComponents); fixed by passing the promise through, as the existing creative page does.

## Not verified (must be stated)
- No browser click-through of the new pages on this branch (no Preview deployment of it exists). Forms were exercised only through their commands.
- No live Gemini call (no key in the container); the provider path is unchanged from PR #1.
- Impact analysis with a *real* superseded rule version was not run end to end (it needs two policy administrators approving in a browser); its loader and page build and read events.
- Nothing was run against Preview or Production.
