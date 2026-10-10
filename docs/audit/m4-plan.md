# M4 plan: internal team review (for approval)

Status: **plan only.** Nothing is implemented. M3 passed end to end on the Preview (`m3-e2e-test-report.md`).

**No schema change is needed.** M1A already has `ReviewCycle`, `SubmissionRound`, `ReviewDecision`, `Finding`, `FindingEvent`, `FindingMarket`, `FindingPlatform` and the activity types. **M2 already has** the policy, transitions, outcome guards and server commands (`startReview`, `recordFinding`, `reviewFinding`, `requestChanges`, `completeReview`), all with mocked tests. M4 is mostly **wiring and UI**, plus two small new commands.

## 1. Scope (your M4 focus list)

| Feature | Implementation |
|---|---|
| **Internal review queue** | A new **Review queue** page at `/admin/review`, also in the TEAM nav: submissions in SUBMITTED (waiting) and IN_REVIEW (in progress), **oldest submission first**. Each row shows client, project, markets/platforms, round number, submitted time and age. The team dashboard gets a "Review queue" section; its stat cards change to *Waiting for review / In review / Changes requested*, fixing I5 for the team |
| **Start review** | A "Start review" button on a SUBMITTED submission page → `startReview`. One click only: if a second reviewer races, the guarded update makes them "already started". Activity `REVIEW_STARTED` records who started it |
| **Findings with severity** | Review panel (TEAM, IN_REVIEW only): "Add finding" form with issue, explanation, **severity** (High / Medium / Low / Advisory, labels from `labels.ts`), optional relevant markets/platforms (from the submission's selections). Creates a **DRAFT** finding, team-only, tied to the round's version, with `createdById` = reviewer |
| **Required client actions** | In the same form: **required action** (Revise the creative / Provide evidence / Clarify / Acknowledge) and **action details** ("what exactly to do", required) |
| **Edit or dismiss draft findings** | *New small command* `updateDraftFinding`: edit the text, severity or action while DRAFT; rejected once published. Dismissing uses `reviewFinding(DISMISS)` with a reason. No hard deletes; every change writes a `FindingEvent` |
| **Request client changes** | A "Request changes" panel: a summary, required, plus a preview list of the draft findings to be published → `requestChanges`. It publishes the draft findings (OPEN), records a `ReviewDecision` (CHANGES_REQUESTED) on the **exact round and version**, moves the submission to CHANGES_REQUESTED and writes activity |
| **Version-linked decisions** | "Complete review" panel: the outcome (No issues identified / Issues resolved / Completed with open issues / Not reviewable), a **summary** and an optional **scope note** (pre-filled with the selected markets/platforms) → `completeReview`. The outcome guards from M2 apply, so options that aren't allowed are disabled with the reason shown. The fixed disclaimer appears on the form and on the result. Each decision shows "Decision on V*n* (round *r*) by *reviewer*, *time*" |
| **Decision history** | The submission page gets a "Review history" card listing decisions per round, each with version, reviewer, kind/outcome and summary. Earlier rounds are read-only |

## 2. What the client sees in M4 (read-only)

- The status banner and stepper show "Being reviewed", then "Changes requested" or "Review complete".
- **Published findings only**: issue, explanation, severity with the caption "Reviewer-assessed severity", required action and its details. DRAFT findings and dismissed-before-publish findings never appear (the M2 `findingVisibleTo` rule).
- The decision summary and outcome, with the disclaimer.
- **Not in M4:** responding to findings, uploading a revision, resubmitting. That is **M5** (the M2 commands exist; UI and wiring come with M5). Until M5, a submission in CHANGES_REQUESTED shows the findings but no response controls.

## 3. Files (planned)

**New**
- `src/app/admin/review/page.tsx`
- `src/components/review-queue/*`
- `src/components/submissions/review-panel.tsx` (start, add/edit finding, request changes, complete)
- `src/components/submissions/findings-list.tsx` (role-aware)
- `src/components/submissions/review-history.tsx`
- `src/app/admin/review/actions.ts` (form wrappers around the commands)
- `src/lib/data/review-queue.ts`
- Tests

**Changed**
- `src/lib/data/submission.ts`: findings, decisions, and the current round/cycle (scoped, with team-only fields stripped for the client)
- `src/components/submissions/submission-view.tsx`
- `src/lib/workflow/commands.ts`: `updateDraftFinding`
- `dashboard-view.tsx` (team stats/queue)
- `nav-links.tsx`
- The I1–I3 copy fixes

## 4. Tests (mocked; plus a Preview walkthrough after implementation)

- Queue scoping: TEAM only; never DRAFT; oldest first.
- Start review: TEAM only; legacy refused; the race produces one winner.
- Findings: required fields; enum validation; reviewer recorded; DRAFT edits allowed, published edits refused; client can never read DRAFT findings (loader strips them).
- Request changes: requires at least one finding; publishes drafts; decision tied to the current round and version; stale or second decision refused.
- Complete: each outcome guard; FINAL decision; cycle closed; no further actions.
- Client view: sees published findings and the decision only; sees no reviewer-only fields.
- **Preview walkthrough** (needs your approval): TEST S1 goes through start → findings → request changes, and a new TEST submission → start → complete with "No issues identified". TEST data only.

## 5. Decisions needed before I start

1. **Approve M4 scope** as above. Completion with an outcome is included because "version-linked review decisions" is on your list.
2. **Draft findings: edit + dismiss** with history kept (recommended), or dismiss only?
3. **Reviewer comments / internal notes:** not included (findings and the decision summary cover feedback). Add later if needed.
4. **Findings visible to the client:** only after "Request changes" or "Complete review" (recommended), not one by one.
5. **Queue location:** a new `/admin/review` page plus a dashboard section (recommended), or only the dashboard?
6. **Fix copy issues I1–I3 in M4** (recommended; trivial).

**Out of scope:** client responses, resubmission and evidence (M5); AI suggestions; notifications; reviewer assignment; dashboards beyond the team queue (M6).
