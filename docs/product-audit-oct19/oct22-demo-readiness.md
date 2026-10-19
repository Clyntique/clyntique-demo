# October 22 demo readiness (Roadmap A)

Based on `demo/integration-oct22` @ `a0c90d2` (= `main`), PR #1 @ `7287d60`, PR #2 @ `3192278`, the reviewer chat report (`5c2f72d`, local only), and public pages of Production fetched on 19 October. Stage detail is in `original-workflow-vs-built.md`.

**Bottom line:** we can honestly demonstrate one creative going from client upload through AI abstention, human findings, client remediation with evidence, and an internal review outcome. Everything after the internal decision (external submission, outcome, passport, monitoring, rule-change impact, re-review) must be presented as the roadmap, clearly labelled, not as product.

## 1. Already working (in code, needs one rehearsal on the demo environment)

| Feature | Last verified | Where |
|---|---|---|
| Client creates a draft, uploads image/video, picks markets and platforms, submits | Local E2E 16 Oct; Preview 12 Oct (older UI) | Client: Submissions |
| Drafts invisible to Team | Unit tests + local E2E | Both |
| Team review queue, start review, draft findings, publish via Request changes | Local E2E 16 Oct | Team: Review queue → submission |
| Client responds per finding, uploads revision, adds evidence, resubmits | Local E2E 16 Oct | Client: submission page |
| Team resolves findings and completes with an outcome and disclaimer | Local E2E 16 Oct | Team: decision panel |
| History, activity timeline, 30 s auto-refresh | Local E2E | Both |
| AI scan abstains: "Insufficient policy coverage — manual review required." | Local E2E 16 Oct | Team: AI panel |
| Policy Library screens, maker-checker | Unit tests only | Team: Policy library |
| Client signup, demo login (Preview only) | Local E2E 16 Oct | Sign-in page |

None of these has been verified on the build Production is serving now. That is the first thing to fix.

## 2. Must-fix demo blockers

| # | Blocker | Why it blocks | Fix | Owner | Needs approval |
|---|---|---|---|---|---|
| B1 | **No isolated demo environment.** Production and Preview share `cyntique_demo`; the 16 Oct setup (new Render database, Blob store, Preview variables) was never done | Demo data, demo login, test rules and the chat migration can't go anywhere safe. Rehearsing on Production writes to Production | Steps 1–4 of `/mnt/project-files/clyntique/demo-workflow-completion/isolated-preview-setup.md` | Deepanshi (Render, Vercel), then Claude | Yes |
| B2 | **Production is serving an unconfirmed build** (hero branch, includes a `wip` commit) and **lacks `7287d60`** | Race fixes, 45 s upload stall guard, signup rate limit and maker-checker fixes are missing from what would be shown | Confirm in Vercel which deployment is Production; merge PR #1 into the integration branch; decide what Production should serve on 22 Oct | Deepanshi decides, Claude merges | Yes |
| B3 | **Never rehearsed end to end on Vercel** since 12 Oct: real Blob uploads, MP4 playback in Chrome/Safari, real Gemini call, both roles, phone width | A failure in front of the audience | Two full rehearsals on the demo environment (20 and 21 Oct) | Claude + Deepanshi | No |
| B4 | **Demo accounts and passwords.** Rotated passwords aren't in the project; demo login is off on Production by design | Can't sign in smoothly on stage | Use demo login on the isolated Preview, or Deepanshi signs in with real passwords on Production | Deepanshi | Choice |
| B5 | **Claims in UI and homepage that the product doesn't back** (table in `original-workflow-vs-built.md`) | An investor or doctor asks "show me rule META-HEALTH-04" or clicks "Learn more" | Label sample cards "Sample", remove or link "Learn more", change "verifies compliance" to "helps reviewers check", fix library header copy | Hero thread / Antigravity (their files) | Routing only |
| B6 | **AI with zero verified rules** | Every scan abstains; we can't show a cited finding | Either present abstention as the feature, or verify and activate 1–2 source-confirmed rules in the **demo database only** with two different policy admins | Deepanshi decides which rules | Yes |

## 3. Small missing core features that could safely be added (no migration)

| # | Feature | What it is | Effort | Risk | Recommend |
|---|---|---|---|---|---|
| S1 | **Review record page ("Compliance Passport preview")** | Read-only page per submission assembled from existing data: submitted versions and snapshots, markets/platforms, findings with rule code and version where linked, client responses, evidence list, each decision with reviewer and date, outcome with the disclaimer, activity history. Browser print to PDF. Labelled "Internal review record. Not a government or platform approval." Team and owning client only | ~1 day incl. tests | Low: read-only, reuses existing access checks | **Yes, if approved on 19/20 Oct** |
| S2 | Copy fixes in our own files (client overview step 2 text, Policy Library header, "Verified regulatory coverage", sandbox "100%") | Wording only | 1–2 hours | Very low | Yes (dashboards are Antigravity's look; text change coordinated) |
| S3 | Fix the 2 lint errors in homepage files | Keeps CI/build clean | <1 hour | Low | Route to hero thread |

Anything needing a new table (external submissions, outcomes, passport status, scan history, chat) needs a migration. On the demo database that is fine once B1 exists; on `cyntique_demo` it needs explicit approval.

## 4. Show as clearly labelled concepts (slides or a static "Roadmap" screen, marked "Coming next")

- Submit to platform/regulator and record the external outcome (manual entry, no integrations).
- Full Compliance Passport: status, external outcomes, rule versions checked, share link.
- Living rulebook monitoring: source change detected → Team verifies → new rule version.
- Impact analysis: "3 passports cite the old version" → flagged for re-review.
- Re-review cycle and notifications.
- Landing-page/website claim review.
- AI pre-check for clients before submission.

Each concept slide should say "Not built yet" in plain words. Do not put concept buttons into the live app.

## 5. Do NOT rush into Production

- Any migration on `cyntique_demo` (including reviewer chat), unless Deepanshi explicitly approves.
- Importing the 18 research candidates (known source flaws, see policy brief).
- Activating any rule that hasn't been checked against its official source by a person.
- External submission/outcome tables, passport status, monitoring jobs.
- Enabling `DEMO_LOGIN` or `CLIENT_SIGNUP` on Production.
- The hero redesign, unless Deepanshi has signed it off (it may already be there).

## 6. Chat with Reviewer

Built and tested locally (346 tests, 21/21 real-database checks), not pushed, needs two new tables. It is demonstrable only if B1 exists (migration on the isolated database) or Deepanshi approves the additive migration on the shared database. Recommendation: include it on the isolated demo environment only; if B1 slips, show the screenshots in `/mnt/project-files/clyntique/reviewer-chat/screenshots/`.

## 7. Demo script that stays honest (about 12 minutes)

1. Homepage (30 s): position as the compliance operating layer; say the review loop is live and the lifecycle after approval is the roadmap.
2. Client 1 (3 min): new submission, upload, markets/platforms, evidence, submit. Show that the Team can't see the draft before submit.
3. Team (3 min): queue, open, AI scan. If no rules: show "Insufficient policy coverage — manual review required" and explain why abstaining is the safety feature. If a verified rule is active: show the cited suggestion, accept it as a draft finding. Add a human finding, request changes.
4. Client 1 (2 min): respond, upload revision, add evidence linked to the finding, resubmit.
5. Team (1.5 min): compare versions, resolve, complete review with "Issues resolved" and the disclaimer.
6. Review record page (1 min) if S1 is built.
7. Client 2 (30 s): sees nothing of Client 1.
8. Roadmap slides (1.5 min): stages 7–13, marked "not built yet".

## 8. Fallbacks

- Screen recording of rehearsal 2 (21 Oct) ready to play.
- Screenshots of each step.
- If Gemini fails on stage, the "AI scan failed — manual review required" state is itself honest; move on.
