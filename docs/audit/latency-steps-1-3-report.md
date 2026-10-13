# Latency steps 1–3: implementation and measurements

13 Oct 2026. Approved scope: steps 1–3 only. No schema change, no Git commands, no deploy, TEST M5S not modified (measurements only loaded pages).

## Changed files

| File | Change |
|---|---|
| `src/lib/prisma.ts` | Step 1: explicit pool settings: `max: 10` (unchanged pg default), `idleTimeoutMillis: 60_000` (was 10 s), `connectionTimeoutMillis: 10_000` (was unlimited), `keepAlive: true` |
| `src/lib/data/review.ts` | Step 2: the legacy comment/approval thread is no longer queried for new-workflow submissions (they never display it). The scoped access lookup is unchanged |
| `src/components/submissions/submission-view.tsx` | Step 3: review data loads in parallel with the submission instead of after it. Both loaders still apply their own TEAM/CLIENT scope |
| `src/components/layout/app-shell.tsx` | Step 3: the TEAM queue count is computed once per page (React `cache`) instead of twice (sidebar and phone menu) |

Earlier today, separately: "Withdrawn" wording in `labels.ts`, `review-panel.tsx`, `history.tsx`, `findings.ts`, `admin/review/actions.ts`.

## Pool settings vs Vercel and Render

- **Render:** `max_connections` 100, 3 reserved, so 97 available. The app user has no per-role limit. 2 connections were in use before testing. There is no server-side idle timeout, and TCP keep-alive is 300 s.
- **Vercel:** each warm function instance has one pool of at most 10 connections, so about 9 instances can be fully busy at once before reaching the limit. Demo traffic uses 1–3 instances. Connections now stay open up to 60 s after last use, instead of 10 s. A suspended or recycled instance can hold its connections until it is reclaimed; Render's keep-alive then clears dead ones.
- **Connect timeout:** while measuring the old code, one new connection hung for **158 s** before failing. That's the intermittent timeout seen before. It now fails after 10 s.
- **Errors on idle connections** are already handled by the Prisma adapter (it attaches the pool `error` listener), so a dropped connection does not crash the function.

## Measured (local production build, same database, this PC in India)

Method: each page fetched in full, once to warm up, then 5 times back to back ("warm"), then 3 times each after 15 s of inactivity ("after a pause"). A local timing hook counted database queries and new connections; it records no data and is not part of the app. The same method was used before and after the change.

| Page | Queries per load | Warm, median | After a 15 s pause, median | New connections after a pause |
|---|---|---|---|---|
| TEAM submission page (TEST M5S), before | 77 | 4.91 s | 10.38 s | 10 on 2 of 3 |
| TEAM submission page, after | **65** | **3.45 s** | **3.48 s** | 0 |
| CLIENT submission page (Alex, TEST M5S), before | 69 | 5.68 s | 12.18 s | 8–10 on 3 of 3 |
| CLIENT submission page, after | **61** | **4.05 s** | **4.05 s** | 0 (2 on 1 run) |

- Every action ends with this page refresh, so the refresh part of each action improves by these amounts locally.
- The actions themselves were not run, because that would change TEST M5S.
- The query count is higher than the 12–20 estimated earlier. Prisma runs many nested relations as separate queries.
- From this PC, each new connection costs about 2.7 s and each query about 0.34 s, so local savings are larger than they will be on Vercel.

## Estimate for the Preview (not measured)

From Vercel iad1, a new connection costs roughly 0.1–0.2 s and a query about 15–25 ms. Expected on the Preview:
- about 0.1–0.3 s saved per action after a pause;
- about 0.05–0.2 s saved from fewer and shorter-chained queries;
- no more long hangs on a stuck connection.

That makes the likely total about 0.2–0.5 s per action. **This is lower than my earlier 1.5–2.5 s estimate for steps 1–5.** Most of the remaining ~4 s from India is the network between India and the US (the sign-in page alone took 0.3–2.4 s), plus the queries per action. Steps 4–5 and the option of a different region or a connection pooler remain for your decision.

## Verification

- Automated tests 233/233, TypeScript 0 errors, lint 0 problems, production build passes.
- Same content for each role, before vs after (timestamps excluded):
  - TEAM submission page, compare view, review queue and submissions list: identical.
  - TEAM overview: identical except that the phone "Menu" text now streams in at a different point in the HTML. No visible difference.
  - CLIENT submission page, overview, submissions list, and the redirect away from the team URL: identical.
- Another client (Jordan, local, after the change):
  - TEST M5S page and compare link show "doesn't exist, or you don't have access".
  - The team URL redirects.
  - V1, V2 and the evidence file return 404.
  - Nothing about M5S appears in the HTML.
- Legacy records: the page still loads with the "Earlier workflow" marker. Neither legacy record has a version, so no current data reaches the thread code. Its code path for legacy records is unchanged.

## Remaining risks

- Up to 10 open connections per warm Vercel instance for up to 60 s. That's fine for demo traffic; watch connection counts if traffic grows or many instances start.
- A connection that takes more than 10 s now fails the request instead of waiting. Previously it hung, once for 158 s.
- If a page ends in "not found", the review loader it started in parallel has already run one scoped query. It returns nothing the user can't see.
- Seen, not changed: the TEAM overview shows "no findings yet" for TEST M5S, which has one resolved and one withdrawn finding. This text was the same before the change.

## Preview results (13 Oct, new `kz1k7vowe` vs old `4wd0objph`)

Measured from India. Each run loads the full TEAM submission page for TEST M5S: 1 warm-up, 5 back to back, then 3 after a 15 s pause.

| | Warm, median | After a 15 s pause | First request after several quiet minutes |
|---|---|---|---|
| Old Preview | 0.83 s (0.77–1.13) | **3.39 s** (2.89–3.99) | 3.0 s |
| New Preview, run 1 | 0.92 s (0.71–1.04) | **0.83 s** (0.73–0.93) | 0.83 s (instance was warm) |
| New Preview, run 2 | 0.81 s (0.72–1.31) | **0.91 s** (0.75–0.98) | 4.4 s |

- The 2.5–3 s penalty after a pause is gone. Warm loads are unchanged.
- A cold start after several quiet minutes is still 3–4 s.
- Vercel reports `x-vercel-cache: HIT` because only the static shell (the "Loading…" placeholders) is served from the CDN. Private content is rendered per request and streamed into the same response.
- A request without a session is redirected to sign-in before anything is served.

Checks on the new Preview:
- **Build:** finding #2 reads "Withdrawn"; "Dismissed" no longer appears.
- **TEAM:** M5S, compare, the Evidence tab ("Submitted with round 2"), V1, V2 (206) and the evidence PDF (200) all load. The queue lists M5S. `/dashboard` redirects to the team area.
- **Alex:** overview, list and M5S load. The team URL redirects. V2 (206) and their own evidence (200) load. No team names appear. "Withdrawn" is not shown yet, as designed: reviewer moves reach the client only after a decision.
- **Jordan:** M5S page and compare show "doesn't exist, or you don't have access". The team URL redirects. V1, V2 and the evidence return 404. No M5S text appears in any response.
- **Vercel logs:** 0 warnings, 0 errors, 0 fatal entries, no connection errors. The only 404s are Jordan's blocked files.

### New risk found: idle connections held by paused instances

- Open connections after testing: 12 idle at the start, then **41 idle** across 6 sources, all Vercel instances of the two Previews (no local server was running).
- Some had been idle for up to 393 s, although the pool should close them after 60 s.
- Vercel pauses idle function instances, and timers do not run while an instance is paused. So the pool cannot release connections until the instance resumes or is shut down.
- The old settings had the same exposure. Now each instance holds up to 10 connections for longer, and 41 of 97 were in use after light testing by one person.

Options for your decision, not implemented:
- **(a)** Lower `max` per instance (for example to 5). Smallest change; caps what each paused instance holds.
- **(b)** Vercel's `attachDatabasePool` (package `@vercel/functions`), which closes idle connections before an instance is paused. This adds a dependency, and the app would pass a `pg.Pool` to the Prisma adapter.
- **(c)** A connection pooler in front of Render.

Recommended: (a) now, (b) before real traffic.

## Preview checks after you push (done 13 Oct, see above)

1. **Build check:** on TEST M5S as the team, finding #2's status pill reads "Withdrawn".
2. **Timing:** sign in as the team on both the old Preview (`clyntique-demo-4wd0objph-clyntique.vercel.app`) and the new one. I run the same page-load measurement on both (5 warm, 3 after a 15 s pause), so we get a like-for-like Preview comparison. The old Preview URL stays live after a new push.
3. **Optional action timing:** only with your approval, since it changes data. Run the same actions on a new TEST submission, not M5S.
4. **Permissions:**
   - The team sees M5S, compare, and the evidence.
   - Alex sees M5S.
   - Jordan gets not-found for M5S and 404 for V1, V2 and the evidence.
5. **Connections:** I run a read-only count of open database connections after browsing; expect well under 97.
6. **Logs:** check the Vercel function logs for connection timeout errors.

## Follow-up 13 Oct: option (a), pool limit 10 → 5

Change: `src/lib/prisma.ts`, `max: 10` → `max: 5`, with an updated comment. Nothing else changed.

Checks: tests 233/233, TypeScript 0 errors, lint 0 problems, production build passes.

Compatibility, measured locally. From this PC every query takes about 0.34 s, so queueing for connections is about 20× worse than on Vercel.

| Simultaneous TEAM page-data loads (read-only) | Pool of 10 | Pool of 5 |
|---|---|---|
| 1 | 2.6 s | 3.4 s |
| 3 | 5.2 s | 10.1 s |
| 6 | 10.4 s | 20.2 s |
| 10 | 17.6 s, 0 errors | 31.8 s, 3 of 10 failed: "timeout exceeded when trying to connect" |

- **Real pages** (local production build, signed in as the team, pool of 5): single load about 5.1 s, versus 3.45 s with 10 yesterday. 3 at once 13.6 s; 6 at once 26.9 s. All complete, 1,030 queries, 0 query or connection errors, no server errors.
- **Why it's slower:** one page runs up to about 10 queries in parallel, so with 5 connections half of them wait their turn.
- **Where the 3 timeouts come from:** the 10 s limit also applies to waiting for a free pooled connection (pg-pool). Locally, 10 simultaneous loads exceed it.
- **On Vercel (estimate, not measured):**
  - Queries are about 20× faster, so the extra wait per page is about 0.05–0.15 s.
  - A 10 s queue would need on the order of a hundred or more simultaneous loads on one instance.
  - Demo traffic is far below that, and Vercel spreads load across instances.
- **Trade-off:** each paused instance holds at most 5 connections instead of 10, for a small per-page cost.
- **To confirm on the Preview after push:** page timing (expect roughly 0.85–1.0 s), no timeout errors in Vercel logs, and no more than 5 idle connections per instance in `pg_stat_activity`.

## Follow-up 13 Oct: TEAM overview "no findings yet" fix

- **Cause:** the overview's In review row only counted draft findings, and fell back to "no findings yet" when there were none. TEST M5S (round 2) has no drafts but one resolved and one withdrawn finding.
- **Fix:**
  - `src/lib/data/review-queue.ts`: loads the status of every finding in the current (open) review cycle (`findingStatuses`). The draft count is now derived from those statuses.
  - `src/lib/workflow/findings.ts`: new pure helper `inReviewFindingsLabel`.
  - `src/components/views/dashboard-view.tsx`: uses the helper.
- **Labels, in priority order:**
  - "N draft findings";
  - "N findings awaiting your decision" (responded);
  - "N open findings";
  - "no open findings" (only resolved or withdrawn);
  - "no findings yet".
- **Unchanged:**
  - The review queue page, which shows draft counts only.
  - Statuses, permissions and history. The queue is TEAM-only and returns nothing to clients.
  - No schema change.
- **Tests:**
  - 5 new label tests in `tests/workflow-findings.test.ts`.
  - 1 new loader test in `tests/m4-review.test.ts` (current-cycle scope, draft count). An existing fixture was updated.
  - 239/239 pass; TypeScript, lint and the production build pass.
- **Local check:** the TEAM overview now reads "TEST M5S — Remediation demo · Alex Morgan · no open findings".

## Privacy check: "awaiting your decision" counts only resubmitted responses

Inspected, 13 Oct. No code change was needed.

- **A client response sets the finding's stored status to RESPONDED immediately** (`respondToFinding`, `commands.ts`). The stored status alone is therefore not private.
- **It writes no activity entry and doesn't touch the submission**: no `creative.update` or `updateMany`, so no team-visible timestamp moves. The finding's own `updatedAt` is not shown on any TEAM page.
- **Responses are only allowed while changes are requested.** `RESPOND_TO_FINDING` is limited to CHANGES_REQUESTED (`policy.ts:59`).
- **The only way out of CHANGES_REQUESTED is resubmission** (`resubmit`, `commands.ts:341`, gated on CHANGES_REQUESTED). The legacy status writes in `review/actions.ts` are all limited to the legacy workflow:
  - uploads to new submissions return before the legacy status change;
  - sharing requires `isLegacy`;
  - decisions are limited to `LEGACY_CLIENT_APPROVAL`.
- **The TEAM queue and overview only load SUBMITTED and IN_REVIEW submissions**, and the label is shown only for IN_REVIEW.
- **Together:** every RESPONDED status the label counts was part of a resubmission. A submission with draft responses (CHANGES_REQUESTED) never reaches this query.
- **The "Waiting on clients" row** counts open + responded together, so it stays constant while a client drafts responses. It is unchanged.

Regression tests added:

| Test file | What it checks |
|---|---|
| `tests/m5-remediation.test.ts` | A draft response writes no activity and leaves the submission untouched |
| `tests/m5-remediation.test.ts` | Responses are refused once SUBMITTED, IN_REVIEW or REVIEW_COMPLETE |
| `tests/m4-review.test.ts` | The queue never includes CHANGES_REQUESTED submissions |

- **Mutation check:** allowing responses during IN_REVIEW, or adding CHANGES_REQUESTED to the queue, makes 4 tests fail (including the new ones). Both changes were reverted.
- **Final run:** 242/242 tests, TypeScript 0 errors, lint 0 problems, production build passes.

## Pool trial on the Preview (13 Oct): new `noc5my5qr` (limit 5) vs `kz1k7vowe` (limit 10)

Read-only page loads of the TEAM submission page for TEST M5S, from India, run back to back in the same session.

| | Warm, median | After a 15 s pause, median | 3 loads at once | 6 loads at once | Errors |
|---|---|---|---|---|---|
| kz1k7vowe, limit 10 | 0.84 s (n=5) | 0.85 s (n=3) | 5.9 s | 4.4 s | 0 |
| noc5my5qr, limit 5, run 1 | 0.96 s | 1.36 s | 2.2 s | 4.2 s | 0 |
| noc5my5qr, limit 5, run 2 | 1.01 s | 0.91 s | 1.2 s | 2.9 s | 0 |
| noc5my5qr, both runs | 0.98 s (n=10) | 1.19 s (n=6) | | | 0 |

- **Single page loads** are about 0.15 s slower warm, and about 0.3 s slower after a pause (noisy; small samples).
- **Simultaneous loads** were no slower, often faster: the old Preview's 3-at-once figure includes new instances starting.
- **Every load was complete.**

Vercel logs: 0 warnings, 0 errors, 0 fatal entries. Statuses were 200 and 307 only. No "timeout exceeded", ETIMEDOUT or "too many clients".

Database connections (read-only `pg_stat_activity`):

| When | Open connections |
|---|---|
| Before testing | 0 |
| After run 1 on noc5my5qr only | 22 idle |
| After run 2 on noc5my5qr and one kz1k7vowe run | **64 idle of 97** |

- The oldest connection was about 6 minutes old. They clear when Vercel shuts down paused instances.
- "Sources" in `pg_stat_activity` are Vercel's outgoing addresses, not instances, so connections per instance can't be read from this. That corrects an earlier note.
- Both Previews (and any other deployment using this database) share the one Render limit.

TEAM overview on noc5my5qr: "TEST M5S — Remediation demo · Alex Morgan · no open findings".
