# M4 report: internal team review

Date: 2026-10-10. Scope: as approved (decisions 1–6).

Not done:
- No schema change, migration or database write. Builds and tests ran with an unreachable placeholder `DATABASE_URL`.
- No Git commands, no deploy, no production configuration changes.
- Legacy data untouched.

**Status: implemented and passing every automated check. It has not yet been checked in a browser,** because the new code isn't deployed to a Preview yet (§5).

## 1. What was built

| Feature | Where | Behaviour |
|---|---|---|
| **Review queue page** | `/admin/review` (TEAM nav: "Review queue") | Two sections, *Waiting for review* (SUBMITTED) and *In review* (IN_REVIEW). **Oldest submission first.** Each row shows thumbnail, title, client — project, markets and platforms, round and version, how long ago it was submitted, and the draft-finding count. Client drafts and legacy records never appear |
| **Team dashboard** | `/admin` | Stats are now **Waiting for review / In review / Changes requested** (submission workflow only), and the header notes reviews completed in the last 7 days. The "Needs revision" list is replaced by a **Review queue** preview (5 oldest) linking to the queue. Recent projects and activity are unchanged. The client dashboard is unchanged (M6) |
| **Start review** | Submission page, SUBMITTED | "Start review" → `startReview`. TEAM only, guarded: a second reviewer gets "already started". Writes `REVIEW_STARTED` with the reviewer |
| **Findings** | Submission page, IN_REVIEW | "Add finding": issue, explanation, **severity** (High/Medium/Low/Advisory, with meanings), **required client action**, **action details** (required), and optional relevant markets/platforms (from the submission's selection). Saved as a **DRAFT, team only**, tied to the cycle and the round's **version**, attributed to the reviewer |
| **Edit / dismiss drafts** | Each draft finding | **Edit** (new `updateDraftFinding`: draft only, recorded as a `FindingEvent`). **Dismiss** with a required reason (kept in history). Published findings can't be edited |
| **Request changes** | Aside card | Summary for the client. **Publishes all draft findings** and records a `ReviewDecision` (CHANGES_REQUESTED) on the **exact round and version**. Status becomes CHANGES_REQUESTED. Activity: "N findings shared" plus "Changes requested" |
| **Complete review** | Aside card | Outcome (No issues identified / Issues resolved / Completed with open issues / Not reviewable). Options the M2 guards don't allow are disabled, with the reason shown. Summary required; scope note pre-filled with markets, platforms and version; fixed disclaimer. Records a FINAL decision on the exact round and version and closes the cycle |
| **Draft findings must be resolved first** | Complete review | With drafts outstanding, completion is **blocked** until each one is dismissed, **or** the reviewer ticks "Share the N draft findings with this outcome". The outcome is then judged on the findings as shared, so "No issues identified" is impossible while findings exist. Enforced on the **server** |
| **Review decisions** | Aside card | Every decision with version, round, reviewer (shown as "Clyntique reviewer" to clients), kind/outcome, summary, scope and time. Disclaimer under final outcomes |
| **Evidence** | Submission page (submitted+) | Read-only list: TEAM sees all, the CLIENT sees SHARED only. Origin, "Added by reviewer" and withdrawn tags. **No new-workflow evidence exists yet**, because adding client evidence is M5/D8; the panel shows an empty state |
| **Client view** | Submission page | Status banner and stepper. After *Request changes* or *Complete review*: the published findings (severity, "Reviewer-assessed severity", required action and details) and the decisions with outcome and disclaimer. **No response controls yet (M5)** |
| **Copy fixes** | — | I1 project-created banner, I2 client page title "Submissions · Clyntique", I3 "This project isn't available." |

## 2. Security and validation (server-side)

- **Unpublished findings never reach clients.** The loader (`src/lib/data/submission-review.ts`) filters them **in the Prisma query** (`status ≠ DRAFT` and `publishedAt` set), and only once the submission has reached CHANGES_REQUESTED or later. No API route returns findings. Pages are server-rendered from this loader, so there's no client-side path to them.
- **Findings are never published one at a time.** `reviewFinding` no longer accepts PUBLISH. Publishing happens only inside `requestChanges` / `completeReview`, in the same transaction as the decision. A count check rolls everything back if a draft changed meanwhile.
- **Every action re-checks role, status and legacy workflow** through the M2 policy. Decisions must target the newest round's exact version; a stale or second decision is refused, guarded by the unique `roundId`. Outcome guards run on the server.
- **The client submission workflow and its access rules are unchanged.** All M3 tests still pass, and the queue and review loaders use the same scope (TEAM never sees client drafts).

## 3. Tests

| Command | Result |
|---|---|
| `npm test` | **171/171 pass** (16 files; 21 new in `tests/m4-review.test.ts`) |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 problems |
| `npx prisma validate` | Valid |
| `npm run build` | Pass, 22 pages (new: `/admin/review`) |

New tests cover:
- **Queue:** TEAM-only, never drafts or legacy, oldest first; summary is TEAM-only.
- **Finding visibility at the query level:** a client gets no draft/unpublished findings and no internal evidence; no findings while the submission is a draft; another client or TEAM-on-draft gets nothing; outcome data is TEAM-only.
- **Drafts:** edit is recorded; published findings and clients can't edit; PUBLISH is refused; dismiss requires a reason.
- **Completion with drafts:** refused unless they're shared; sharing records a FINAL decision on the exact round/version plus the activity; "No issues identified" is impossible while findings exist; works after dismissal.
- **Request changes:** writes the "findings shared" activity; rolls back on a draft race.
- **Form actions:** signed-out and client refusal; TEAM creates a draft with the reviewer recorded; values are kept on error; the share flag is passed through.
- **Copy fix I3.**

One M2 test mock was updated for the stricter publish count check.

## 4. Files

**New**
- `src/app/admin/review/page.tsx`, `src/app/admin/review/actions.ts`
- `src/lib/data/review-queue.ts`, `src/lib/data/submission-review.ts`
- `src/components/views/review-queue-view.tsx`
- `src/components/submissions/review-panel.tsx`, `findings-list.tsx`, `review-history.tsx`
- `tests/m4-review.test.ts`
- `docs/audit/m4-report.md`

**Modified**
- `src/lib/workflow/commands.ts`: `updateDraftFinding`, shared validation and publishing, completion with explicit draft sharing, no single publish, I3
- `src/components/submissions/submission-view.tsx`
- `src/components/views/dashboard-view.tsx`
- `src/components/layout/nav-links.tsx`
- `src/components/views/project-detail-view.tsx` (I1)
- `src/app/dashboard/creatives/page.tsx` (I2)
- `tests/helpers.ts`, `tests/workflow-commands.test.ts`

## 5. Remaining work and blockers

1. **Browser walkthrough of M4 (needs your approval and a Preview deploy).** Push the branch so Vercel builds a new Preview (your Git step). Then, with TEST data only:
   - TEST S1: start review → add 2 findings (one High / Provide evidence, one Advisory / Acknowledge) → edit one → request changes → check the client view as Alex and that Jordan can't see anything.
   - A new TEST submission: start → complete with "No issues identified".
   - Mobile check of the queue and review panel.
2. **The client can't respond or resubmit yet** (M5). After changes are requested, the client sees the findings, and can upload a new version and edit details, but there's **no resubmit button** yet.
3. **Pending from M3, not covered:** MP4 playback and seeking (needs a test video), and the real server-side upload size limit (unit-tested only).
4. **Production** (`clyntique-demo.vercel.app`): four-ID check, Blob token for Production, `LOGIN_RATE_LIMIT=enabled`. Not done; needs your Vercel actions.
5. **Client dashboard** wording is still legacy (M6).
