# Original workflow vs what is built

Audit date: 19 October 2026. Demo: 22 October 2026.

## What this audit is based on

| Source | Exact version | How it was checked |
|---|---|---|
| Latest integrated code | `demo/integration-oct22` at `a0c90d2` (17 Oct). **`main` points at the same commit.** | Code read line by line, schema read in full, `vitest run`: 24 files, **321/321 pass**. `eslint`: **2 errors** (`src/components/marketing/workflow-section.tsx`, `src/components/ui/scroll-reveal.tsx`) |
| Hardening fixes | `feature/demo-workflow-completion` (draft PR #1) at `7287d60` | **Not in `main` or the integration branch.** Merges cleanly (checked with `git merge-tree`) |
| Homepage hero | `feature/hero-redesign` (draft PR #2) at `3192278` | Not in `main` |
| Reviewer chat | `feature/reviewer-chat` at `5c2f72d` | Exists only in another thread's container; not pushed. Taken from that thread's report |
| Production | https://clyntique-demo.vercel.app | Public pages fetched on 19 Oct. **Signed-in pages not checked** (demo passwords are not available to me) |
| Database | `cyntique_demo` on Render, shared by Production and Preview | **Not queried.** Row counts come from project notes (15 Oct: 0 PolicyRule, 0 PolicySource) |
| Earlier reports | `docs/audit/`, `/mnt/project-files/clyntique/demo-workflow-completion/`, `/mnt/project-files/clyntique/reviewer-chat/`, the policy review in `/mnt/project-files/clyntique/policy-review/` | Read and cross-checked against code |

### What Production is actually serving

Project notes say Production was deployed from `main` at `5f456d1` on 13 October. That is no longer true:

- `main` has moved to `a0c90d2` (the integration branch, pushed 17 October).
- The Production homepage loads `/images/hero/hero-bg-v2.png` and `/images/hero/clouds.png`. Those files exist **only** on `feature/hero-redesign` (added 19 October). So Production is serving a build of the hero branch, which is `main` plus 7 homepage commits (one is labelled `wip`).
- That build therefore contains signup, demo login code and AI grounding (`f55dd36`) but **not** the race, upload and rate-limit fixes (`7287d60`).
- The Production sign-in page shows no demo buttons (correct: demo login is forced off when `VERCEL_ENV=production`).

Nobody in the project has recorded approving that promotion. It needs confirming in Vercel (Deployments → Production).

## Status labels

- **COMPLETE & VERIFIED**: built, and checked working on the environment named.
- **IMPLEMENTED BUT NOT FULLY VERIFIED**: the code exists and passes tests and local browser checks, but has not been checked on the current Preview or Production build.
- **PARTIALLY IMPLEMENTED**: some of the intent exists; important parts don't.
- **NOT IMPLEMENTED**: nothing in code or database beyond, at most, a name in marketing copy.
- **BLOCKED**: cannot progress without a decision or access.

A page, button, table or unit test on its own never earns "complete".

## Verification key

- **Local**: real browser against a local Postgres copy of the schema and a fake Blob service (16 October thread).
- **Preview**: Vercel Preview on the shared database. Last full pass: 12 October (12/12 checks), on code that has since been restyled and extended.
- **Production**: nothing signed-in has been verified since the 13 October deploy, and the code serving Production has changed since then.

## Summary

| # | Stage | Status | Demonstrable 22 Oct? |
|---|---|---|---|
| 1 | Create / Upload | IMPLEMENTED BUT NOT FULLY VERIFIED | Yes, after a rehearsal on the demo environment |
| 2 | AI Check | PARTIALLY IMPLEMENTED | Only the "insufficient coverage" answer, unless verified rules are activated in the demo database |
| 3 | Improve | PARTIALLY IMPLEMENTED | Yes (human-led remediation loop). No AI suggestions to the client |
| 4 | Evidence | IMPLEMENTED BUT NOT FULLY VERIFIED | Yes |
| 5 | Human Review | IMPLEMENTED BUT NOT FULLY VERIFIED | Yes, strongest part of the product |
| 6 | Approve | PARTIALLY IMPLEMENTED | Yes, as an internal review outcome (never as "approved") |
| 7 | Submit (to regulator/platform) | NOT IMPLEMENTED | Concept only |
| 8 | Regulatory / Platform Outcome | NOT IMPLEMENTED | Concept only |
| 9 | Compliance Passport | NOT IMPLEMENTED | Concept, or a small read-only record page if approved (see `oct22-demo-readiness.md`) |
| 10 | Monitor | NOT IMPLEMENTED | Concept only |
| 11 | Rule Change | PARTIALLY IMPLEMENTED | Policy Library screens, empty in Production |
| 12 | Impact Analysis | NOT IMPLEMENTED | Concept only |
| 13 | Re-check / Re-review | NOT IMPLEMENTED | Concept only |

Count: **0** complete and verified, **3** implemented but not fully verified, **4** partial, **6** not implemented, of 13 stages.

In plain terms: stages 1 to 6 (getting one creative through one internal review) are real and reasonably well built. Stages 7 to 13 (everything that happens after the internal decision: external submission, outcome, passport, monitoring, rule-change impact, re-review) do not exist in code or in the database. Weighted roughly, about a third of the original lifecycle is implemented.

---

## Stage 1: Create / Upload

1. **Intended:** a client (or agency) creates a creative, uploads the asset and states where it will run.
2. **Implemented:** the client creates a draft submission (title, description, campaign context, format, markets, platforms), uploads an image (JPEG/PNG/WebP, up to 50 MB) or video (MP4/WebM, up to 500 MB) directly to a private Vercel Blob store, and can upload new versions. The draft is private until submitted. `src/lib/workflow/commands.ts` (`createDraft`, `updateDraft`, `submitForReview`), `src/lib/review/actions.ts` (`finalizeVersion`), `src/lib/media.ts`.
3. **Client dashboard:** Submissions → new submission, upload, save draft, submit. Submit is refused until a file, a market and a platform are chosen (`src/lib/workflow/submission.ts`).
4. **Team dashboard:** sees the submission only after it is submitted. Team cannot create a submission for a client (decision D6; `src/app/admin/projects/actions.ts:89` refuses). Team creates projects and assigns them to a client.
5. **Backend:** server actions with role and ownership checks (`src/lib/workflow/policy.ts`), conditional status updates, Blob upload tokens scoped to the submission.
6. **Database:** `Project`, `Creative`, `CreativeVersion`, `SubmissionMarket`, `SubmissionPlatform`, `Market`, `AdPlatform`, `SubmissionRound` (with a snapshot of the submitted title/description/context).
7. **Tested:** unit tests (`tests/m3-submissions.test.ts`, `workflow-commands.test.ts`); local browser E2E 16 Oct with a fake Blob; Preview 12 Oct (older UI).
8. **Missing:** landing-page or website URL as a reviewable item; carousel or multi-asset creatives; text-only ads (copy without a file); industry per project or client (industry comes from one environment variable, `POLICY_DEFAULT_INDUSTRY`); duplicate-retry protection on create; the upload-during-submit race fix (`7287d60`, not integrated).
9. **UI-only:** the "New creative" page under a Team project still exists but only shows a refusal.
10. **Demo 22 Oct:** yes, if uploads are rehearsed on the demo environment with the real Blob store. Not verified on the current build anywhere.

**Status: IMPLEMENTED BUT NOT FULLY VERIFIED.**

## Stage 2: AI Check

1. **Intended:** AI checks the creative against applicable, verified rules before human review, cites the rule, and abstains when coverage is missing.
2. **Implemented:** a Team-only "AI scan" on a submitted version (`src/lib/ai/service.ts`). It sends only the submitted snapshot and file (images only; video is not read). Only rules that are ACTIVE, VERIFIED, in effect, backed by verified sources, and matching the submission's markets, platforms and industry are given to the model (`src/lib/ai/applicability.ts`). With no such rule the model is not called and the answer is "Insufficient policy coverage — manual review required." Model citations are discarded and rebuilt from the database. A Team reviewer can accept a suggestion as a draft finding linked to the exact rule version (`Finding.ruleVersionId`).
3. **Client dashboard:** nothing. The client cannot run a check before submitting. The client overview text says "Clyntique verifies compliance against active policies" (`src/components/views/dashboard-view.tsx:827`), which overstates what happens.
4. **Team dashboard:** AI panel on the submission: extracted text, detected claims, suggested findings, "Accept Finding".
5. **Backend:** Gemini provider (`src/lib/ai/gemini-provider.ts`), in-memory 30-minute cache.
6. **Database:** none for scans. Scan runs, detected claims and the list of rules checked are **not stored**. Only accepted suggestions persist, as findings.
7. **Tested:** unit tests with a fake provider (`tests/m7b-gemini-integration.test.ts`, `tests/ai-grounding-hardening.test.ts`). Local E2E saw the failure state and the insufficient-coverage state only. **A real Gemini call has never been verified in this project's test runs** (no key in the test environments). Whether Production has `GEMINI_API_KEY` set is not verified.
8. **Missing:** any verified, active rule in any shared database (Production has 0), so in Production every scan abstains; a client-side pre-check; video analysis; stored scan history (needed for the passport and impact analysis); stored claims; per-submission industry; jurisdiction coverage beyond what the empty library holds.
9. **UI-only:** the "Grounding sandbox" in the Policy Library runs a keyword matcher over preset aesthetics scenarios (Botox, laser, Japan), not the AI, and shows "100% Policy Grounded". The preset scenarios are outside the healthcare-doctor pilot scope in the CEO brief (Rev 5).
10. **Demo 22 Oct:** the abstention behaviour is real and worth showing. A grounded finding with a citation needs at least one verified rule activated in the demo database plus a working Gemini key, which is a decision for Deepanshi.

**Status: PARTIALLY IMPLEMENTED.**

## Stage 3: Improve

1. **Intended:** the client fixes the creative, helped by specific, cited guidance (AI and human).
2. **Implemented:** the human remediation loop. Team publishes findings (issue, explanation, severity, required action, action details, optional market/platform and rule link) and requests changes. The client responds per finding, uploads a revised version, adds evidence and resubmits. Readiness checks block resubmission until every open finding has what it needs (`src/lib/workflow/findings.ts` `resubmissionGaps`).
3. **Client dashboard:** "Your changes needed", per-finding Respond, Upload a revised version, Resubmit.
4. **Team dashboard:** sees responses, new rounds and versions; resolves, reopens or withdraws findings.
5. **Backend:** `respondToFinding`, `resubmit`, `reviewFinding`, `requestChanges`.
6. **Database:** `Finding`, `FindingEvent` (append-only), `FindingResponse`, `SubmissionRound`, `ReviewDecision` (kind `CHANGES_REQUESTED`).
7. **Tested:** unit tests (`tests/m5-remediation.test.ts`, `m5-stabilization.test.ts`); local E2E 16 Oct; Preview 12 Oct.
8. **Missing:** AI-suggested rewrites for the client; side-by-side compare of the revised file (exists in the Team workspace, needs Blob to verify); the client cannot add a note or evidence while the Team is reviewing (by design).
9. **UI-only:** none found.
10. **Demo 22 Oct:** yes.

**Status: PARTIALLY IMPLEMENTED** (human loop is solid; AI-assisted improvement is absent).

## Stage 4: Evidence

1. **Intended:** substantiation for every claim, tied to the claim and rule, kept with the creative's record.
2. **Implemented:** evidence items (title, type, description, source, URL, date, optional PDF/image up to 10 MB), origin (client or reviewer), visibility (shared or Team-only), linked to a version and to findings, withdrawal with history.
3. **Client dashboard:** Add evidence (file or link), link to a finding, withdraw. Only in Draft or Changes requested.
4. **Team dashboard:** sees shared evidence; can add internal (Team-only) evidence.
5. **Backend:** `addEvidence`, `withdrawEvidence`, `/api/evidence` media route with access checks.
6. **Database:** `Evidence`, `FindingEvidence`.
7. **Tested:** unit tests; local E2E with links and with fake-Blob files; real Blob not verified on the current build.
8. **Missing:** claims as records, so evidence can't be tied to a claim; evidence requirements per rule; validity or expiry dates; reuse of evidence across creatives.
9. **UI-only:** none found.
10. **Demo 22 Oct:** yes.

**Status: IMPLEMENTED BUT NOT FULLY VERIFIED.**

## Stage 5: Human Review

1. **Intended:** a qualified human reviewer decides, with a full record.
2. **Implemented:** review queue, Start review, draft findings (Team-only until published), Request changes, Complete review with one of four outcomes and a scope note, decisions locked to the exact round and version (`checkDecisionTarget` in `src/lib/workflow/transitions.ts`), append-only history, activity timeline, 30-second auto-refresh.
3. **Client dashboard:** sees status, published findings, decisions, permitted history. Never sees draft findings or internal evidence.
4. **Team dashboard:** Review queue, submission workspace (stage, compare, inspector), findings, decision panel.
5. **Backend:** `startReview`, `recordFinding`, `updateDraftFinding`, `reviewFinding`, `requestChanges`, `completeReview`.
6. **Database:** `ReviewCycle`, `SubmissionRound`, `ReviewDecision` (unique per round), `Finding`, `FindingEvent`, `Activity`.
7. **Tested:** the most tested area. Unit tests across `m4-review`, `workflow-*`; real-Postgres concurrency check (20/20, on `7287d60` only); local E2E 16 Oct; Preview 12 Oct.
8. **Missing:** reviewer assignment (any Team user can act on anything); reviewer qualifications; second-reviewer sign-off; the row-lock fixes (`7287d60`, not integrated: without them a finding can land after a final decision under concurrent use).
9. **UI-only:** none found.
10. **Demo 22 Oct:** yes.

**Status: IMPLEMENTED BUT NOT FULLY VERIFIED.**

## Stage 6: Approve

1. **Intended:** a clear, recorded approval for the creative to be used, for stated markets and platforms.
2. **Implemented:** "Complete review" with outcome `NO_ISSUES_IDENTIFIED`, `ISSUES_RESOLVED`, `COMPLETED_WITH_OPEN_ISSUES` or `NOT_REVIEWABLE`, a summary and scope note. Every outcome carries: "Internal human review only. Not legal advice, not government approval, and not acceptance by any advertising platform." (`src/lib/workflow/labels.ts:22`).
3. **Client dashboard:** sees the outcome and disclaimer.
4. **Team dashboard:** records it.
5. **Backend:** `completeReview` with outcome guards (`checkOutcome`).
6. **Database:** `ReviewDecision` (kind `FINAL`), `ReviewCycle.closedAt`, status `REVIEW_COMPLETE`. The old `Approval` table belongs to the retired, backwards workflow.
7. **Tested:** unit and local E2E; Preview 12 Oct.
8. **Missing:** an explicit "cleared for use" state per market/platform; client acknowledgement; validity period; link from the outcome to which rules were checked.
9. **UI-only:** none.
10. **Demo 22 Oct:** yes, presented as an internal review outcome.

**Status: PARTIALLY IMPLEMENTED.**

## Stage 7: Submit (to a regulator or platform)

1. **Intended:** record that the approved creative was submitted to an ad platform or regulator: when, where, reference.
2. **Implemented:** nothing.
3–5. No client or Team screens, no backend.
6. **Database:** no model.
7. **Tested:** n/a.
8. **Missing:** everything. Note: Clyntique has no platform or government API integration and should not imply one.
9. **UI-only:** the homepage's "Structured Process" ends at "tracking"; no screen exists.
10. **Demo 22 Oct:** concept only.

**Status: NOT IMPLEMENTED.**

## Stage 8: Regulatory / Platform Outcome

1. **Intended:** record the external result (approved, rejected, changes requested) with supporting documents.
2. **Implemented:** nothing. Internal outcomes are deliberately labelled as not platform or government decisions.
3–7. Nothing.
8. **Missing:** everything, including a clear distinction between client-reported and Team-verified outcomes.
9. **UI-only:** none.
10. **Demo 22 Oct:** concept only.

**Status: NOT IMPLEMENTED.**

## Stage 9: Compliance Passport

1. **Intended:** one record per creative: claims, rules and their versions, evidence, reviewer decisions, creative version, external submissions and outcomes, status, change history; downloadable and shareable.
2. **Implemented:** no passport. Why: during the 12–13 October sprint the standing rule was "no AI/Compliance Passport" and "no fake metrics or buttons". That was a deliberate scope decision at the time, not an oversight. The CEO brief of 19 October makes the passport core.
3–5. No screens, no backend.
6. **Database:** no passport model. Fragments exist: versions, round snapshots, decisions, findings with `ruleVersionId`, evidence, finding events, activity. Missing fragments: rules checked by AI scans, claims, external outcomes, passport status.
7. **Tested:** n/a.
8. **Missing:** the passport entity, status model, snapshot on completion, export (PDF), share link, change history.
9. **UI-only:** none.
10. **Demo 22 Oct:** a read-only "review record" page built from existing data is feasible without a migration (see `oct22-demo-readiness.md`). A full passport is not.

**Status: NOT IMPLEMENTED.**

## Stage 10: Monitor

1. **Intended:** watch approved creatives and policy sources for changes that affect them.
2. **Implemented:** nothing. No scheduled jobs, no source checks, no notifications.
3–7. Nothing.
8. **Missing:** everything.
9. **UI-only:** none.
10. **Demo 22 Oct:** concept only.

**Status: NOT IMPLEMENTED.**

## Stage 11: Rule Change

1. **Intended:** a living, Team-verified rulebook with sources, applicability, effective dates, versions, and human verification before activation.
2. **Implemented:** the Policy Library (`/admin/policy-library`). Rules have code, authority type, jurisdiction, sub-jurisdiction, platform, industry, category. Versions are immutable with effective dates, applicability conditions, exceptions, change summary, maker and approver. Sources have verification status. Maker-checker: a policy admin can't approve their own version. Retiring a rule. Candidate import gated by `POLICY_CANDIDATE_IMPORT`.
3. **Client dashboard:** nothing (Team-only).
4. **Team dashboard:** library list, rule drawer, rule editor, propose version, approve, verify source, sandbox.
5. **Backend:** `src/lib/policy/db.ts`, `actions.ts`, `auth.ts`.
6. **Database:** `PolicySource`, `PolicyRule`, `PolicyRuleVersion`, `PolicyRuleVersionSource` (migration `20261014220000_compliance_policy_library`).
7. **Tested:** unit tests (`tests/policy-library.test.ts`, `m7a-policy-persistence.test.ts`). Not browser-verified on Preview or Production.
8. **Missing:** any verified rule (0 in Production); detection of source changes; notifications on rule change; the maker-checker fixes in `7287d60` (not integrated: without them an importing admin can approve their own import, and approval doesn't check the version belongs to the rule); a second real policy admin; admin rights still granted by hard-coded email (`src/lib/policy/auth.ts:13`, decision F4); per-client applicability (industry). `src/lib/policy/store.ts` is an unused in-memory copy.
9. **UI-only / overclaiming copy:** the library header says "Verified government regulations, ad platform standards, and internal risk policies for US and UAE healthcare and aesthetics advertising. 100% persisted in PostgreSQL." (`src/components/policy/policy-library-view.tsx:157`) while the library is empty, and aesthetics is no longer the pilot focus.
10. **Demo 22 Oct:** the screens and maker-checker flow, on the demo database only.

**Status: PARTIALLY IMPLEMENTED.**

## Stage 12: Impact Analysis

1. **Intended:** when a rule changes, list the creatives and passports it affects.
2. **Implemented:** nothing. The only link from a creative to a rule is `Finding.ruleVersionId`, which exists only when a reviewer accepted an AI suggestion. A creative that was checked against a rule and passed has no record of that rule, so impact can't be computed even in principle until scan runs are stored.
3–7. Nothing.
8. **Missing:** everything, plus the stored "rules checked" it depends on.
9. **UI-only:** none.
10. **Demo 22 Oct:** concept only.

**Status: NOT IMPLEMENTED.**

## Stage 13: Re-check / Re-review

1. **Intended:** reopen a completed review because a rule changed or the creative changed, and record a new cycle.
2. **Implemented:** within one review, any number of resubmission rounds. After "Complete review" the submission is final: `REVIEW_COMPLETE` has no outgoing transition (`src/lib/workflow/transitions.ts`), and only review cycle 1 is ever created (`src/lib/workflow/commands.ts:254`). The schema (`ReviewCycle.number`, `openedReason`) was designed to allow later cycles.
3–7. No screens or commands for a new cycle.
8. **Missing:** "open new review cycle" command and UI, trigger from rule change, notifications.
9. **UI-only:** none.
10. **Demo 22 Oct:** concept only.

**Status: NOT IMPLEMENTED.**

---

## Cross-cutting findings

| Area | Status | Notes |
|---|---|---|
| Accounts, sign-in, sessions | IMPLEMENTED BUT NOT FULLY VERIFIED | bcrypt, signed httpOnly cookie, role checks. Production signed-in flow not checked since 13 Oct |
| Client signup | IMPLEMENTED BUT NOT FULLY VERIFIED | Behind `CLIENT_SIGNUP`. The "always rate limited, fails closed" fix is in `7287d60`, not integrated |
| Demo login | IMPLEMENTED BUT NOT FULLY VERIFIED | Behind `DEMO_LOGIN`, impossible on Production by design. Only usable on a Preview |
| Client privacy (drafts never shown to Team) | IMPLEMENTED BUT NOT FULLY VERIFIED | Unit tests plus local E2E; enforced in data loaders and AI input |
| Client-to-client isolation | IMPLEMENTED BUT NOT FULLY VERIFIED | Local E2E both directions |
| Chat with Reviewer | IMPLEMENTED LOCALLY, NOT INTEGRATED | Commit `5c2f72d` in another thread's container; 346 tests; needs a two-table migration that has not been applied anywhere shared. In progress |
| Homepage hero | IN PROGRESS | PR #2, apparently serving Production |
| Landing page / website claim review | NOT IMPLEMENTED | Only uploaded image/video files can be reviewed |
| Notifications | PARTIAL | In-app counts and 30 s refresh only. No email |
| Isolated demo environment | BLOCKED | Waiting since 16 Oct on a new Render database, Blob store and Vercel variables (`isolated-preview-setup.md`) |

## Marketing and UI claims that go beyond the product

These are not bugs in the workflow, but a careful viewer could catch them during the demo:

| Where | Text | Problem |
|---|---|---|
| Homepage, Policy section (`feature/hero-redesign` `src/components/marketing/policy-library-section.tsx`) | "RULE-META-HEALTH-04 … Rule Verified" with an AI citation | That rule doesn't exist in the library; the card reads as a real verified rule. Needs a "Sample" label |
| Homepage feature cards | "Learn more →" on six cards | Not links. Violates the "no fake buttons" rule |
| Homepage footer | "Evaluator Demo Access" | Opens the normal sign-in page; Production has no demo access |
| Client overview (`dashboard-view.tsx:827`) | "Clyntique verifies compliance against active policies." | AI is Team-only and never verifies compliance |
| Policy Library header | "Verified … US and UAE healthcare and aesthetics … 100% persisted" | Library is empty in Production; aesthetics is out of the pilot scope |
| Team overview (`dashboard-view.tsx:228`) | "Verified regulatory coverage" | Shown whenever any active rule exists and no turnaround figure is available |
| Grounding sandbox | "100% Policy Grounded", aesthetics presets | Keyword matcher, not the AI; presets outside pilot scope |

Homepage and dashboards are Antigravity's and the hero thread's areas; these should be routed to them, not edited here.
