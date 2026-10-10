# M4 end-to-end walkthrough: internal team review

- **Date:** 2026-10-10
- **Preview:** `clyntique-demo-ossxqs993-clyntique.vercel.app`, the M4 build of the feature branch
- **Data:** TEST-only records. Demo passwords were entered by the owner; I never saw or stored them.
- **Not done:** no Git commands, no deploys, no production configuration changes, no legacy data changes.

**Result: every M4 check passed.** One new copy issue (I8) was found. The items in §4 are still pending.

## 1. Environment
| Check | Result |
|---|---|
| Preview uses the expected database (ID fingerprint of the TEST records) | PASS |
| M4 build is live (Review queue nav item, new dashboard stats) | PASS |

## 2. Walkthrough
| # | Step | Account | Result |
|---|---|---|---|
| 1 | Review queue lists S1 (SUBMITTED) in round order; dashboard shows Waiting / In review / Changes requested | TEAM | PASS |
| 2 | S1: **Start review**. Status IN_REVIEW; activity "Review started" | TEAM | PASS |
| 3 | Added finding #1 (High · Provide evidence · Canada) and #2 (Advisory · Acknowledge) | TEAM | PASS |
| 4 | Edited #2 to Low, with new action details; marked "Draft", team only | TEAM | PASS |
| 5 | **Complete review** blocked while drafts were unresolved (reason shown) | TEAM | PASS |
| 6 | **Draft privacy:** Alex sees no draft text in the page or in raw HTML; activity shows only "Review started" | CLIENT (Alex) | PASS |
| 7 | **Request changes** with summary. Status CHANGES_REQUESTED; both findings OPEN; "2 findings shared" plus "Changes requested" | TEAM | PASS |
| 8 | DB (read-only): decision on round 1 / V2 by the team user; finding events ∅→DRAFT, DRAFT→DRAFT ("Edited"), DRAFT→OPEN | — | PASS |
| 9 | Client view of S1: findings with severity and required action, reviewer shown as "Clyntique reviewer", decision card | CLIENT (Alex) | PASS |
| 10 | S3: Alex added US + Meta, uploaded and submitted; appears in the queue | CLIENT, then TEAM | PASS |
| 11 | S3: start review, then **Complete review → No issues identified**. Decision card shows V1 / round 1, scope note and disclaimer; stepper "Review complete" | TEAM | PASS |
| 12 | Team dashboard afterwards: "1 review completed in the last 7 days"; stats 0 / 0 / 1; queue clear; activity in the correct order | TEAM | PASS |
| 13 | **Mobile (375 px):** review queue and admin submission page (findings, evidence, decisions, versions, history) have no horizontal overflow | TEAM | PASS (the queue was empty at that point; a filled queue was checked on desktop only) |
| 14 | **Isolation (Jordan):** S1 and S3 pages show "not found" on `/dashboard/creatives/…` and 404 on `/dashboard/submissions/…`; `/admin/…` redirects to his dashboard; both media URLs return 404; no S1/S3 titles, findings, decisions or activity appear on his dashboard, submissions, projects or activity pages | CLIENT (Jordan) | PASS |
| 15 | **Legacy data (read-only DB check against the 9 Oct backup):** every original Project, Creative, Activity and User row is unchanged; still 2 LEGACY_CLIENT_APPROVAL creatives | — | PASS |

## 3. Issues
| ID | Issue | Severity | Plan |
|---|---|---|---|
| I4 | "Not found" pages under `/dashboard/creatives/…` return HTTP 200, though their content is correct and nothing leaks | Low | Known; fix later |
| I5 | Client dashboard still uses legacy wording | Low | M6 |
| I6 | Each action takes about 3–10 s (Render database latency) | Medium for the demo | Review before the demo |
| I7 | TEST records remain in the shared database | Info | Keep or clean up per owner decision |
| **I8 (new)** | Sign-in page tagline is legacy: "Review creatives, share feedback, and track approvals in one place." | Low | Copy fix, M6 or earlier |

## 4. Not covered / pending
1. **Client response and resubmission (M5):** after changes are requested the client can't respond to findings, add evidence or resubmit yet.
2. MP4 playback and seeking (needs a TEST video).
3. Real server-side upload size cap (unit-tested only).
4. Production (`clyntique-demo.vercel.app`): four-ID check, Blob token for Production, `LOGIN_RATE_LIMIT=enabled`. These need owner actions in Vercel.
5. Client dashboard (M6).

## 5. Conclusion
M4 works end to end on the Preview with TEST data: queue, start review, draft findings (add, edit), draft privacy, request changes, completion with an outcome, decisions, dashboard summary, mobile layout and client isolation. Legacy data is unchanged. **Not production-ready:** M5 and the pending items above remain.
