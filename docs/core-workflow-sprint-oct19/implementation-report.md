# Core Workflow Completion Sprint — Implementation Report (Oct 19, 2026)

Branch: `feature/core-workflow-sprint-oct19` (draft PR). Base: `main` at `a0c90d2` plus the hardening commit `7287d60` from PR #1, merged in `455eba6`.

This sprint turned the four stages the Oct 19 audit found missing (Submit, Regulatory/Platform Outcome, Compliance Passport, Re-review) and the two it found partial (Rule Change, Impact Analysis) into working, tested code, and made AI checks persistent. Nothing was rebuilt; every change is additive and sits on the existing workflow engine, loaders and UI primitives.

**Nothing touched a shared database, Production or `main`.** The new migration exists only on this branch and in a disposable local PostgreSQL inside the sprint container.

## Step 0 — state of the code before the sprint

| Item | Finding | Decision |
|---|---|---|
| `main` | `a0c90d2` = the `demo/integration-oct22` integration branch (homepage animations, auth page). Does not include PR #1. | Base of the sprint branch. |
| PR #1 `feature/demo-workflow-completion` (`7287d60`) | Hardening: row lock on submissions (`lockSubmission`), upload stall guard, signup rate limit, maker-checker fixes, signup/demo login, AI grounding tests. 332 unit tests. Merges cleanly into `main`. | **Merged into the sprint branch** so the new commands get the row lock and the fixed maker-checker. PR #1 itself is untouched. |
| PR #2 `feature/hero-redesign` | Homepage/hero only. Merges cleanly with `main` and with this branch (no overlapping files). | Not merged here; it is Antigravity's work. |
| PR #3 `docs/product-audit-oct19` | Docs only. | Not merged here. |
| Reviewer chat | Built in another thread as local commit `5c2f72d` on `demo/integration-oct22`; not pushed. Inspected through its bundle/patch under `/mnt/project-files/clyntique/reviewer-chat/`. Owns `Conversation`/`Message` tables, migration `20261019180000_reviewer_chat`, nav badge code, and small edits to `submission-view.tsx` (Messages tab), `app-shell.tsx`, `dashboard-view.tsx`, `demo-fixtures.ts`, `package.json`, `tests/migrations.test.ts`. | Not rebuilt. This sprint's migration is timestamped later (`20261019190000`), avoids nav/badge code, and keeps its `submission-view.tsx` and `tests/migrations.test.ts` edits small. Expected merge conflicts and their resolution are listed in `oct20-21-integration-plan.md`. |
| Production | Serving a `feature/hero-redesign` build, promoted by the CEO. | Left alone. |
| Database | `cyntique_demo` on Render is shared by Production and Preview. | A separate PostgreSQL 16 (`clyntique_sprint`, 127.0.0.1:5433, inside the container) was created for this sprint. All existing migrations plus the new one were applied there only. |

## What was built, in the brief's order

### 1. Safe base + hardening
Sprint branch from `main`, PR #1 merged, `npm ci`, local PostgreSQL. `prisma migrate status` on the local DB: up to date after the new migration.

### 2. Persistent AI scan history (Priority 1) — DONE
- **Schema**: `AIScanRun` (scan id, creative, exact submitted version, cycle, round, initiating user, status `SUCCESS | INSUFFICIENT_COVERAGE | RATE_LIMITED | ERROR`, model, prompt version, summary, error *name*, extracted visual text, detected claims, validated suggested findings, discarded count, execution time, timestamp) and `AIScanRuleCheck` (one row per rule version evaluated: rule version id, rule code, version number; `ON DELETE RESTRICT` on the rule version).
- **Service** (`src/lib/ai/service.ts`): every exit of `analyzeCreativeCompliance` goes through `recordScan`: insufficient coverage (no rules listed), provider throw (status ERROR, error *name* only, never the message, which can echo request details), non-success provider answers (findings dropped), and success (only server-validated suggestions whose citations were rebuilt from the Policy Library). A failed history write never hides the scan result; the result then carries no `scanId`. The cache stores the recorded result, so a cached repeat is not recorded twice; a forced re-run is. `promptVersion` is exposed by the Gemini provider (`grounded-2026-10-16`).
- **Grounding preserved**: the applicable-rule filter, the abstention, the citation rebuild and the manual-review fallback are unchanged; only recording was added around them. Clients still cannot run a scan.
- **Display**: the Team AI panel now has a "Scan history" list (version, cycle, status, time, user, rules checked, counts, model, prompt) with a link to the full review record. The review record shows every scan; a client sees only that a check ran, on which version, with which status and against which rule codes. AI suggestions reach a client only as human-recorded findings.
- **Not stored**: raw provider output, provider error messages, API keys, image bytes.

### 3. Compliance Passport MVP = read-only review record (Priority 2) — DONE
- Routes `/admin/creatives/[id]/record` (TEAM) and `/dashboard/creatives/[id]/record` (CLIENT), built from the same loaders as the workspace (`getSubmission`, `getSubmissionReview`, new `getLifecycle`), so the page shows exactly what that viewer may see elsewhere: a client never sees draft findings, team-only evidence or AI suggestions; TEAM never sees a client draft.
- Content: summary (internal status, latest internal outcome, platform status, regulator status, markets, platforms, versions), every review cycle with its change requests, final decision, scope note and findings table, evidence table, automated checks, external submissions and outcomes, footer with record code and generation time.
- Every record states, at the top and in the footer: *"This is Clyntique's internal review record. It is not legal advice, not government approval, and not acceptance by any advertising platform. External outcomes below are recorded manually and are not independently certified by Clyntique."*
- Print-friendly: "Print or save as PDF" button; app chrome and forms are hidden in print; cards avoid page breaks.
- The submission page shows a "Review record" link once a review has completed. The "passport" is derived from existing records plus the new tables: no separate Passport entity, so nothing can go stale.

### 4. External submission and outcome tracking (Priority 3) — DONE
- **Schema**: `ExternalSubmission` (creative, reviewed version, cycle, destination type `AD_PLATFORM | REGULATOR`, destination name, optional platform and market codes, submitted-on date, external reference, note, basis `CLIENT_REPORTED | TEAM_VERIFIED`, recorded by, timestamp) and `ExternalOutcome` (submission, kind `APPROVED | CHANGES_REQUESTED | REJECTED`, outcome date, note, optional evidence document, basis, recorded by, timestamp). Both append-only: no update or delete path exists in code.
- **Commands** (`recordExternalSubmission`, `recordExternalOutcome`): allowed for the owning client (`REPORT_EXTERNAL`) and TEAM (`RECORD_EXTERNAL`) only after a completed internal review (a closed cycle), on a version that was actually submitted for review; a client's record is always `CLIENT_REPORTED`; TEAM must say whether it is client-reported or team-verified; dates must be real and not in the future; a rejection or change request needs the reason; an attached document must be this submission's own active evidence (shared evidence only, for a client). Each record adds an Activity entry. Nothing changes the internal review status.
- **Status** (`src/lib/workflow/external.ts`): exact labels "Not submitted", "Submitted externally · awaiting outcome", "Approved by external authority/platform (reported, not independently verified)", "Approved by external authority/platform (document checked by Clyntique team)", "Changes requested externally", "Rejected externally". Platform and regulator statuses are kept apart; overall, the most demanding state wins so nobody reads "approved" while a regulator said no.
- **UI**: forms on the review record (client: "Tell Clyntique you submitted this externally"; team: "Record an external submission"), "Record outcome" per submission, with the disclaimer that Clyntique did not submit anything.

### 5. Re-review foundation (Priority 4) — DONE
- New transition `REOPEN_REVIEW`: `REVIEW_COMPLETE → SUBMITTED`, TEAM only. `openReviewCycle` opens cycle N+1 with round 1 on the latest version, records why (`reasonKind`: policy change, platform/regulator outcome, client update, evidence expired, reviewer request; a free-text note shown to the client; optionally the approved rule version that triggered it). Cycle N, its rounds, findings and decisions are never written to and nothing is copied: the reviewer records new findings explicitly, and old ones stay visible under their own cycle. A guarded status update and the unique `(creativeId, number)` key refuse a second concurrent reopen; a cycle that is still open blocks it. The client is not asked to resubmit.
- UI: "Re-review" form on the Team review record; "Open re-review" per impacted submission on the impact page.

### 6. Living rulebook + impact analysis foundation (Priority 5) — DONE (foundation)
- `PolicyRuleEvent` (rule, version, kind `RULE_CREATED | VERSION_PROPOSED | VERSION_APPROVED | RULE_RETIRED`, actor, note, time) written inside the existing Policy Library transactions. Approval still requires a second administrator and verified sources; nothing is activated automatically.
- `/admin/policy-library/impact` (linked from the Policy Library header): for each rule with a superseded or retired version, the submissions judged against the old version, split into **Confirmed** (a reviewer's finding cites that rule version) and **Potentially affected** (an AI pre-check ran against it), with client, project, status and a per-row "Open re-review" that cites the new version. Rows already re-reviewed show "Re-review opened"; rows mid-review say the re-check applies in the current cycle. Below: the append-only rule history.
- Existing source metadata (`lastAuditedAt`, verification status, version history, `effectiveFrom/To`) is what the page reads; no new source fields were needed for the foundation.

### 7. Client AI pre-check (Priority 6) — NOT BUILT
Out of time and, more importantly, it needs a product decision on what a client may see of an automated check before a human has looked (see `remaining-work.md`).

### 8. Reviewer chat (Priority 7) — NOT TOUCHED
Coordinated by file/migration separation only; see the integration plan.

## Files changed or added

New: `prisma/migrations/20261019190000_lifecycle_records/`, `src/lib/workflow/external.ts`, `src/lib/data/lifecycle.ts`, `src/lib/data/policy-impact.ts`, `src/lib/lifecycle/actions.ts`, `src/components/record/{review-record,lifecycle-forms,print-button}.tsx`, `src/components/policy/impact-view.tsx`, `src/app/admin/creatives/[creativeId]/record/page.tsx`, `src/app/dashboard/creatives/[creativeId]/record/page.tsx`, `src/app/admin/policy-library/impact/page.tsx`, `scripts/db-check/lifecycle.db.test.ts`, `vitest.db.config.ts`, tests `external-status`, `lifecycle-commands`, `scan-history`, `policy-rule-events`.

Modified: `prisma/schema.prisma`, `src/lib/ai/{service,types,gemini-provider}.ts`, `src/lib/workflow/{policy,transitions,labels,commands}.ts`, `src/lib/policy/db.ts`, `src/components/submissions/{submission-view,ai-compliance-panel}.tsx`, `src/components/policy/policy-library-view.tsx`, `tests/{helpers,migrations.test,workflow-transitions.test}.ts`.

Untouched: homepage/marketing files, auth pages, dashboards, nav, app shell, `package.json`, seeds, fixtures.

## Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint .` | 2 errors, both pre-existing in Antigravity's homepage files (`marketing/workflow-section.tsx`, `ui/scroll-reveal.tsx`); identical to `main`. PR #2 removes one of them. |
| `npx vitest run` | 29 files, **367 passed** (332 on the base with PR #1, +35 new) |
| Real-DB check (`vitest.db.config.ts` against local `clyntique_sprint`) | 4 passed: submit → review → complete → external record → outcome; AI scan persisted and client-filtered; re-review keeps cycle 1 intact and refuses a duplicate; rule event written and read by the impact page |
| `npm run build` | succeeds; new routes are dynamic (`◐`) like the existing creative pages |

See `test-results.md` for the full output and what each suite proves.

## Rules honoured

No rebuild · no destructive DB change (migration is CREATE/ADD only) · no shared DB migration · no deployment · no merge to `main` · no fake approvals (external outcomes are labelled by basis and never a Clyntique decision) · no invented policy references (the AI path still rebuilds citations from verified Policy Library rows; impact rows come from stored rule version ids) · no automatic activation (events only; approval unchanged) · permissions unchanged for every existing action, new actions go through `authorize()` · client drafts remain invisible to TEAM in every new loader · no review or evidence history is modified by any new command · no demo buttons without a working backend · no redesign (existing primitives only) · Antigravity's files untouched · all 332 pre-existing tests still pass.
