# Oct 20–21 integration plan

Goal: one integrated branch on Preview by the end of Oct 20, a signed-in rehearsal on Oct 21, and nothing on Production that the CEO has not approved. Each step names who decides. Nothing below merges to `main`, migrates the shared DB or deploys without the CEO saying so in writing.

## Branches in play
| Branch | Content | State |
|---|---|---|
| `main` (`a0c90d2`) | integration-oct22: homepage animations, auth pages | Base |
| `feature/demo-workflow-completion` (PR #1, `7287d60`) | hardening, signup, demo login, AI grounding | Merges cleanly into `main`; already inside the sprint branch |
| `feature/hero-redesign` (PR #2) | cloud hero, mobile fixes, removes one lint error | Merges cleanly with `main` and with the sprint branch (no shared files); Production is serving a build of it |
| `docs/product-audit-oct19` (PR #3) | audit docs | Docs only |
| reviewer chat (`5c2f72d`, unpushed, bundle in `/mnt/project-files/clyntique/reviewer-chat/`) | Conversation/Message tables, migration `20261019180000`, nav badges, Messages tab | Needs to be pushed from its thread |
| `feature/core-workflow-sprint-oct19` (this sprint) | lifecycle records, record page, external records, re-review, rule events, impact | Draft PR |

## Oct 20 — integrate
1. **Push the reviewer chat** from its thread as `feature/reviewer-chat` and open a draft PR (its owner).
2. **Create `demo/integration-oct22-v2` from `main`** and merge, in this order:
   1. PR #1 (hardening) — clean.
   2. PR #2 (hero) — clean; resolves one homepage lint error.
   3. reviewer chat — expect conflicts only with nothing yet (it was built on `main`).
   4. this sprint — expected conflicts, all small: `prisma/schema.prisma` (keep both model sets and both `User` relation lists), `tests/migrations.test.ts` (ordered list: chat folder, then lifecycle folder), `tests/helpers.ts` (keep both mock additions), `src/components/submissions/submission-view.tsx` (chat's Messages tab + sprint's scan-history load, panel props and header link; hunks are separate). PR #3 can be merged any time (docs only).
3. After the merge: `npx prisma generate`, `npx tsc --noEmit`, `npx vitest run` (expect 367 + chat's tests), `npm run build`. Fix only merge fallout; no new features.
4. **Decision (CEO): apply migrations to the shared `cyntique_demo`** — `20261019180000_reviewer_chat` then `20261019190000_lifecycle_records`, via `prisma migrate deploy` from the integration branch. Both are additive. Take a Render backup first (same procedure as `D:\clyntique-demo\db-backups`). Without this step Preview will 500 on the new pages.
5. Push the integration branch; Vercel builds a Preview. Signed-in smoke test as `client@clyntique.demo` and `team@clyntique.demo`:
   - submission page loads for both roles (regression), Messages tab (chat) visible;
   - Team AI panel: run a scan (expect "no verified rules" unless rules were activated), scan history shows the run;
   - `/record` for both roles, print preview;
   - client records an external submission + outcome; team records a team-verified outcome;
   - team opens a re-review from the record; submission shows "Waiting for review", cycle 2; finish it;
   - Policy Library → "Rule changes & impact": propose v2 of a rule, approve with a second admin (needs `compliance-admin@clyntique.com` or an `isPolicyAdmin` user), confirm the impacted list and "Open re-review".
6. Record every failure in the sprint thread; fixes go to the integration branch as small commits.

## Oct 21 — rehearse and decide
1. **Demo data** on the shared DB, entered through the UI (preferred) or a fixture the CEO approves: two client accounts (the two pilot doctors, fictional names), one completed submission each, one external outcome, one rule with a superseded version. Nothing invented about real regulations: demo rules must be clearly synthetic or verified from an official source first.
2. **Rehearsal script** (15 minutes): upload → AI check (honest abstention or verified rules) → findings → changes → evidence → complete → record page → "I sent it to Meta" → outcome → rule changes → impact → re-review → record shows both cycles. Say "internal review" and "as reported" out loud at the right places.
3. **Decision (CEO): promote to Production.** Options: (a) merge the integration branch to `main` and let Vercel deploy; (b) keep Production on the hero build and demo from Preview. The record is: Production currently serves `feature/hero-redesign`; the integration branch includes it, so (a) does not lose the homepage.
4. Rotate the demo passwords and confirm the Production Blob token (open items from Oct 9 and 16).

## Things that stay off the table until the CEO says otherwise
- Running any migration or seed against `cyntique_demo`.
- Merging anything to `main`.
- Importing or activating policy rules without a verified official source and two administrators.
- Touching Antigravity's homepage or auth files beyond merge conflict resolution.

## If time runs short
Priority of what to keep working on Preview: (1) existing review flow + chat, (2) record page, (3) external records, (4) re-review, (5) impact page. Each is independent; a broken (5) does not block (1)–(4).
