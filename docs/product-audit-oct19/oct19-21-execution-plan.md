# October 19–21 execution plan

Based on `demo/integration-oct22` @ `a0c90d2` (= `main`), PR #1 @ `7287d60`, PR #2 @ `3192278`, reviewer chat `5c2f72d` (local). Demo: 22 October. Internal completion deadline: 21 October.

Rules for these three days: no feature that needs a migration on `cyntique_demo`; no Production data change, deploy or merge to `main` without Deepanshi's explicit yes; nothing touches the hero thread's or Antigravity's files except through them.

Items marked **[D]** need a decision or action from Deepanshi. Everything else Claude can do once the decision is made.

## Sunday 19 October (evening)

| # | Task | Owner | Depends on |
|---|---|---|---|
| 1 | Answer the decisions in section "Decisions" below | **[D]** | — |
| 2 | Confirm in Vercel which deployment is Production and whether the hero build was meant to be there | **[D]** | — |
| 3 | Create the isolated demo environment: new Render database `clyntique_demo_preview`, new private Blob store, Vercel variables scoped to Preview + the demo branch (steps 1–3 of `isolated-preview-setup.md`) | **[D]** | — |
| 4 | Merge PR #1 (`7287d60`) into `demo/integration-oct22` (merges cleanly), run tests/lint/build, push the integration branch | Claude | Approval of item 1 |
| 5 | Send copy-fix list (homepage "Sample" label, "Learn more", "Evaluator Demo Access", 2 lint errors) to the hero thread / Antigravity | Claude via coordinator | — |

## Monday 20 October (build and first rehearsal)

| # | Task | Owner | Depends on |
|---|---|---|---|
| 1 | `npm run db:target` on the demo environment must show `clyntique_demo_preview`; then `prisma migrate deploy`, seed, `db:demo-fixtures --apply` | Claude | 19/3 |
| 2 | If approved: verify 1–2 source-confirmed rules (e.g. FTC Deception Statement, FTC Endorsement Guides §255.2(b)/§255.5) against official sources, enter them, approve with a second policy admin, **demo database only** | Deepanshi + Claude | Decision 3 |
| 3 | If approved: set `GEMINI_API_KEY`, `DEMO_LOGIN=enabled`, `POLICY_DEFAULT_INDUSTRY` on the demo Preview only | **[D]** | 19/3 |
| 4 | If approved: build the read-only review record page (S1), with tests; no migration | Claude | Decision 4 |
| 5 | Our own copy fixes (client overview step 2, Policy Library header, "Verified regulatory coverage", sandbox "100%") | Claude | Decision 6 |
| 6 | If approved: merge reviewer chat into the integration branch and apply its migration on the demo database only | Claude (chat thread) | Decision 5, 20/1 |
| 7 | **Rehearsal 1** on the demo Preview: full script in `oct22-demo-readiness.md` §7, both clients, Team, phone width, real Blob upload (image and MP4), real AI scan (abstention and, if rules exist, a cited suggestion) | Claude + Deepanshi | 20/1–6 |
| 8 | Fix list from rehearsal 1, fixes same day | Claude | 20/7 |

## Tuesday 21 October (freeze and second rehearsal)

| # | Task | Owner | Depends on |
|---|---|---|---|
| 1 | Code freeze at 12:00 IST; only demo-blocking fixes after | All | — |
| 2 | Reset the demo database to clean fixtures | Claude | 20/1 |
| 3 | **Rehearsal 2**, timed, with Deepanshi presenting; record the screen as the fallback | Deepanshi + Claude | 21/2 |
| 4 | Roadmap slides for stages 7–13, each marked "not built yet" | Deepanshi (Claude drafts) | — |
| 5 | Decide whether anything goes to Production; if not, the demo runs on the isolated Preview | **[D]** | 21/3 |
| 6 | Final check of the sign-in path, accounts and fallback video on the presenting laptop | Deepanshi | 21/3 |

## If the isolated environment isn't ready by Monday midday

Fallback: run the demo on Production with Deepanshi's real accounts and pre-created submissions, only if Deepanshi explicitly approves creating demo data in Production. No demo login, no chat, no test rules. Otherwise use the recorded rehearsal plus a live walkthrough of Policy Library screens.

## Decisions (needed on 19 October)

1. Isolated demo environment: yes (recommended) or demo on Production.
2. Merge PR #1 into the integration branch: yes (recommended).
3. Policy rules for the demo: activate 1–2 verified rules on the demo database only, or show abstention only.
4. Build the read-only review record page (passport preview): yes or no.
5. Reviewer chat in the demo: yes on the demo database only, or screenshots.
6. Copy changes to remove overclaims: yes (recommended).
7. What Production should serve on 22 October.
