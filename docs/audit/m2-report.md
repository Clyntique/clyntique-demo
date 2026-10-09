# M2 report: workflow rules, server-side permissions, login rate limiting

Dates: started 2026-10-09, finished 2026-10-10. Scope: **M2 only**.

What was not done:
- No connection to Render or any other network database. Builds ran with an unreachable placeholder `DATABASE_URL`.
- No migrations, `db push` or resets.
- No Git commands, no deploy.
- Nothing from M3–M8.

**The new workflow is not usable end-to-end yet.** No page, route or form calls it. The tables it writes to exist only after the M1A migration is applied.

## 1. Implemented modules (`src/lib/workflow/`, `src/lib/auth/rate-limit.ts`)

| Module | What it does |
|---|---|
| `labels.ts` | Display labels and descriptions for outcomes, severity, required actions and finding statuses, plus the fixed review disclaimer. Enum values are never shown to users. Platform and market names come from their reference tables. |
| `policy.ts` | **Central authorization** (pure). `authorize(actor, action, submission)` → allow, or `NOT_FOUND` / `FORBIDDEN` / `LEGACY` / `INVALID_STATE`. `canCreateSubmission`, `canView`. |
| `transitions.ts` | **Transition engine**: DRAFT→SUBMITTED (client), SUBMITTED→IN_REVIEW (team), IN_REVIEW→CHANGES_REQUESTED (team), CHANGES_REQUESTED→SUBMITTED (client), IN_REVIEW→REVIEW_COMPLETE (team). `checkDecisionTarget` rejects stale or conflicting decisions. |
| `findings.ts` | Finding transitions (publish / respond / resolve / reopen / dismiss, each with role and note rules), finding and evidence visibility, resubmission readiness, request-changes and **outcome guards**. |
| `commands.ts` | Server-side commands that apply the rules with guarded transactional writes: `createDraft`, `updateDraft`, `submitForReview`, `respondToFinding`, `resubmit`, `startReview`, `recordFinding`, `reviewFinding`, `requestChanges`, `completeReview`. |
| `src/lib/auth/rate-limit.ts` | Login rate limiter on `LoginAttempt`. |
| `src/app/auth/actions.ts` | `login` calls the limiter **only when `LOGIN_RATE_LIMIT=enabled`**. Default off, so behaviour is unchanged. |

### Permission rules as implemented

**CLIENT**
- Can see only submissions in projects assigned to them (`Project.clientId`), including their own drafts.
- May edit a draft (and a submission sent back for changes), upload, manage evidence, submit, resubmit, and respond to **published** findings.
- Has **no** review action of any kind: start review, findings, request changes, resolve, complete.

**TEAM**
- Sees only submitted work. Client drafts look "not found", the same as missing records.
- May start reviews, record, publish, resolve, reopen and dismiss findings, request changes, and complete reviews.
- Has **no** client action. There is no "on behalf of" command; that waits for decision D6.

**Legacy records** (`workflow = LEGACY_CLIENT_APPROVAL`)
- Every new-workflow action returns `LEGACY`.
- Legacy team drafts stay invisible to clients.
- The existing Phase 4 pages still handle legacy records, unchanged.

**Status gates**
- No uploads or edits while SUBMITTED, IN_REVIEW or REVIEW_COMPLETE. The reviewed file can't change under the reviewer.
- Markets and platforms can be changed only while DRAFT, so a submitted round's review context is fixed.

### Guards against stale and conflicting decisions

- A decision must target the **newest round of the open cycle**, that round's **exact version**, with **no newer version** uploaded and **no decision** already recorded for the round.
- Every status change is a conditional update (`where status = expected`, plus "no newer version"). A double submit, a second tab or two reviewers acting at once match zero rows and write nothing.
- The database adds a second barrier: `ReviewDecision.roundId` is unique, and so is `SubmissionRound (cycleId, number)`.

### Reviewer identity

These rows record the acting user:
- `Finding.createdById`, `resolvedById`
- `FindingEvent.actorId`
- `ReviewDecision.reviewerId`
- `ReviewCycle.openedById`
- `SubmissionRound.submittedById`
- `FindingResponse.authorId`
- `FindingEvidence.linkedById`
- `Activity.userId`

### Outcome guards (`checkOutcome`)

| Outcome | Allowed when |
|---|---|
| `NO_ISSUES_IDENTIFIED` | no findings other than dismissed ones |
| `ISSUES_RESOLVED` | at least one resolved finding, and every non-advisory finding resolved or dismissed |
| `COMPLETED_WITH_OPEN_ISSUES` | at least one finding still open or awaiting the reviewer |
| `NOT_REVIEWABLE` | always |

Every outcome needs a summary (≥ 10 characters), and no DRAFT finding may remain. Completing the review also closes the cycle.

### Resubmission rule (plan §16.3; working choice)

Every OPEN or RESPONDED, non-ADVISORY finding needs:
- a client response, and
- for REVISE_CONTENT, a version newer than the one the finding was raised on, or
- for PROVIDE_EVIDENCE, at least one linked, shared, non-withdrawn evidence item.

Meeting the required action never resolves a finding. Only the reviewer resolves.

A resubmission creates a new `SubmissionRound` on the newest version. Earlier rounds, findings and decisions are not modified.

### Visibility

- Clients never see DRAFT findings, or findings dismissed before publication.
- INTERNAL evidence is team-only.
- A client can link only shared, active evidence of the same submission.

### Rate limiting

- **Keys:** `HMAC-SHA256(RATE_LIMIT_SECRET or SESSION_SECRET, scope:value)`. Rows never contain an email address or an IP.
- **Limits** (failures per 15-minute window):

  | Scope | Limit | Why |
  |---|---|---|
  | email + IP | 5 | one person guessing one account |
  | email | 20 | kept higher so a real user is hard to lock out |
  | IP | 50 | one address trying many accounts |

- **Concurrency:** the attempt is inserted as a failure **before** the password check, and counted afterwards. Concurrent requests see each other's rows, so overshoot is limited to requests landing at the same instant. On success the rows are marked `succeeded`.
- **Generic response:** the same message is shown whether or not the account exists. A blocked attempt does no account lookup.
- **Fail-open:** if the limiter's database call fails (e.g. the table is missing), sign-in falls back to the normal password check and only the error name is logged.
- **Client address:** taken from `x-forwarded-for`. That is trustworthy on Vercel but spoofable elsewhere, which weakens only the per-IP limit.
- **Pruning:** `pruneAttempts()` exists for old rows but is **not** scheduled.

## 2. Test results

| Command | Result |
|---|---|
| `npm test` | **126/126 pass**, 14 files (73 new in M2) |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass |
| `npx prisma validate` | Valid |
| `npm run build` | Pass (20 pages) |

New test files:

**`workflow-policy.test.ts`** (20 tests)
- client/team visibility and draft privacy
- cross-client denial
- legacy isolation for every action
- clients never perform review actions; the team never performs client actions
- the full status-gate matrix

**`workflow-transitions.test.ts`** (7 tests)
- the full cycle, with one resubmission, and IN_REVIEW → REVIEW_COMPLETE directly
- every wrong-status and wrong-role transition rejected
- no exit from REVIEW_COMPLETE, and no legacy statuses
- stale and conflicting decision targets

**`workflow-findings.test.ts`** (14 tests)
- finding transitions, notes and roles
- finding and evidence visibility
- resubmission rules per required action
- request-changes and all outcome guards
- labels are not raw enum values and never say "approved", "compliant", "certified" or "violation"

**`workflow-commands.test.ts`** (23 tests, Prisma mocked)
- draft creation is explicitly `SUBMISSION_REVIEW`, with project ownership and code validation
- submit opens cycle 1 / round 1 on the newest version with a guarded update
- other clients, TEAM and legacy records are refused, and double submits rejected
- TEAM-only review actions; the reviewer recorded everywhere
- version-tied decisions:
  - a stale round, a mismatched version, a newer upload or an already-decided round each write **nothing**
  - a concurrent conflict writes nothing
- outcome guards, and a FINAL decision that closes the cycle
- responses: unpublished or foreign findings are refused, and only usable evidence can be linked
- resubmission is blocked until requirements are met, then opens the next round without touching earlier decisions
- markets and platforms are locked after submission
- only TEAM can resolve findings

**`rate-limit.test.ts`** (9 tests)
- keys contain no email or IP, and are normalised
- insert-before-count ordering
- the window and exact-limit boundaries
- `login`:
  - off by default (no limiter queries)
  - when enabled, blocks before any account lookup
  - marks successful sign-ins
  - fails open on limiter errors

All tests are mocked. They never connect to a database or Blob store.

## 3. Existing behaviour preserved

- No page, route, form or existing server action imports `src/lib/workflow/*` (checked by grep).
- `login` is unchanged unless `LOGIN_RATE_LIMIT=enabled`.
- All 53 earlier tests still pass. They pin the current Phase 4 behaviour: TEAM uploads, CLIENT decides on legacy creatives.

## 4. Remaining integration work (M3–M5; not started)

1. **Read scoping in the existing pages.** `creativeScope` (`src/lib/data/workspace.ts`) and `findAccessibleVersion` (used by `/api/media`) must exclude **new-workflow client drafts for TEAM** and include them for the owning client. Until that is done, client drafts would show up in the current team lists. This can only change once the `workflow` column exists, so it has to ship together with the migration and M3.
2. **Uploads.** The upload-token route and `finalizeVersion` must use `authorize(user, "UPLOAD_VERSION", …)` for new-workflow submissions (client uploads). Today they are TEAM-only, for legacy.
3. **Evidence.** Client evidence create, edit and withdraw (`MANAGE_EVIDENCE`), and reviewer evidence (`ADD_REVIEWER_EVIDENCE`, pending D8). Set `origin`, `addedById` and `visibility`.
4. Server actions and forms around each command. Review queue and review page (M4). Remediation UI (M5). Dashboards and labels (M6).
5. **Team creative creation** (`createCreative`) currently relies on the column default. Once migrated, it must set `workflow` explicitly. Which value depends on D6: it should stay legacy until on-behalf creation is decided.
6. Enable `LOGIN_RATE_LIMIT` only after the migration. Schedule `pruneAttempts` later.
7. Integration tests against a real test database (plan §11) before the pilot.

## 5. Blockers and decisions

- **Blocker for browser testing of M3+:** the M1A migration must be applied to a database. Recommended: the separate development database (`m1a-report.md` §5A). This requires operator action.
- **Pending decisions:**
  - D6: team "on behalf of" creation.
  - B3: the resubmission and blocking rules are implemented as working choices and are easy to change in `findings.ts`.
  - Whether markets and platforms are required before submit. Not enforced.
- Values you confirmed (outcomes, severity, actions, platforms) are used as given.

## 6. Files

**New:**
- `src/lib/workflow/labels.ts`, `policy.ts`, `transitions.ts`, `findings.ts`, `commands.ts`
- `src/lib/auth/rate-limit.ts`
- `tests/workflow-policy.test.ts`, `tests/workflow-transitions.test.ts`, `tests/workflow-findings.test.ts`, `tests/workflow-commands.test.ts`, `tests/rate-limit.test.ts`
- `docs/audit/m2-report.md`

**Modified:**
- `src/app/auth/actions.ts`: optional rate limiting, off by default
- `tests/helpers.ts`: Prisma mock covers the new models
- `.env.example`: `LOGIN_RATE_LIMIT` and `RATE_LIMIT_SECRET` names

M2 is complete. I'm stopping here and waiting for approval.

## Addendum (after review)

- **Resubmission rules approved as implemented.**
- **New rule, implemented:** submitting needs a file, **at least one active target market** and **at least one active advertising platform**. Drafts may be saved incomplete. The check is the pure function `src/lib/workflow/submission.ts`, applied in `submitForReview`. Resubmissions keep the markets and platforms locked at first submission. Tests: 128/128 pass; tsc, lint, validate and build pass.
- **D6 deferred:** no team creation on behalf of clients; the MVP uses client-owned submissions. M3 must also stop the legacy team "Add creative" from creating new-workflow rows once the database is migrated.
- **New scripts:**
  - `npm run db:target` prints the host and database name in `DATABASE_URL` without connecting.
  - `npm run db:migrate:status` is a read-only migration check.
- **Dev database setup guide:** `docs/audit/dev-database-setup.md`.
