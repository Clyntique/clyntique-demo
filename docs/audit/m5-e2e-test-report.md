# M5 end-to-end verification: client responses and resubmission

- **Date:** 2026-10-10, 18:28–18:46 UTC
- **Preview:** `clyntique-demo-j2k38diq2-clyntique.vercel.app`, M5 build of the feature branch
- **Data:** TEST record only, **TEST S1** ("TEST — Spring promo story", Alex). S3 was used read-only for the regression check.
- **Sign-ins:** the owner signed in for every account switch (7 sign-ins). I don't enter passwords on hosted sites, so no credential was typed, stored or logged by me, and none appears here.
- **Test files:** generated in the page by script: a valid PDF, a text file named `.pdf`, an 11 MB PDF, PNG evidence, and PNG creative versions V3/V4. Copies of the PDFs are in `D:\clyntique-demo\test-assets\m5`.
- **Not done:** no Git commands, no deploy, no Production changes, no migration or reset, no legacy record changed, no code changed during testing.

**Result: all 17 verification points passed.** Five minor UI/copy bugs and one product-decision follow-up are listed in §3–§4. No security issues found.

## 1. Results by requirement

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | TEAM requests changes on a submitted creative | PASS | Round 1 (from M4) and round 2 (V3): "Request changes" published the round-2 draft and recorded a new decision. Blocked while client responses were undecided ("Resolve or reopen the 2 findings… first") |
| 2 | Alex sees published findings | PASS | Severity, required action, details, timeline, and "Needed before you resubmit: …" under each finding |
| 3 | Alex responds to each finding | PASS | Responses on #1, #2 (twice) and later #2, #3. **Append-only:** a second response became a new entry, with no edit control. Findings moved to *Awaiting reviewer* |
| 4 | PDF/image evidence and links | PASS | PDF with link and source, linked to #1, "Supports: #1…". PDF downloads (`attachment`, `application/pdf`, `nosniff`, sandbox CSP); PNG opens inline |
| 5 | Type, signature, ownership and size restrictions | PASS | Text-as-PDF uploaded, then **rejected on the server** ("isn't a valid PDF file"); the stored blob was deleted (only 2 evidence blobs exist, both recorded). 11 MB file blocked in the browser. **The server-issued upload token itself encodes 10 MB, `application/pdf` only, one fixed path, no overwrite.** Token refused for GIF (400), a path outside `evidence/` (400), a completed submission (403), a legacy/inaccessible record (400) and for Jordan (400) |
| 6 | Withdraw eligible evidence, keeping history | PASS | PNG withdrawn: still listed as *Withdrawn*, file still viewable; DB row kept with `withdrawnAt` / `withdrawnBy = Alex`. After resubmission no Withdraw control remains; round-1 evidence stayed locked in round 2 |
| 7 | Resubmission blocked until open findings are answered | PASS | With the disabled button forced on, the **server** refused: "Address every open finding before resubmitting (3 items outstanding)". In round 2, earlier responses to the reopened #2 **did not count**; a new response was required. #3 (Revise content) also needed V4 |
| 8 | Revised version and resubmission | PASS | V3 → round 2, V4 → round 3, each with a note to the reviewer. Status *Submitted*, "Resubmitted for round n" |
| 9 | New round without overwriting the previous | PASS | DB: rounds 1/2/3 on V2/V3/V4 in cycle 1; one decision per round; the two pre-existing decisions are byte-identical to the 17:57 backup |
| 10 | Side-by-side comparison | PASS | "Compare rounds": round 1 · V2 (Changes requested) vs round 2 · V3 (Under review), then round 2 vs round 3, with both images, version notes and the client's note |
| 11 | Resolve / reopen / withdraw with notes | PASS (withdraw: see §5) | Empty note refused by the server ("Add a short note explaining this."). #1 resolved (round 2, "Resolved on V3"); #2 reopened with note, then resolved on V4; #3 resolved on V4. **A resolved finding shows no Reopen or Withdraw control** |
| 12 | Drafts and internal reviewer actions stay private | PASS | During the round-2 review, Alex's page **and raw HTML** contained none of: the draft finding, the resolution note, the reopen note, the reviewer's name. Alex still saw both findings as *Awaiting reviewer*. After "Request changes" Alex saw *Resolved* with its note and the reopen note |
| 13 | Jordan has no access | PASS | S1 and S3: "not found" on `/dashboard/creatives/…`, 404 on `/dashboard/submissions/…`, redirect from `/admin/…`. All 3 S1 version files and both evidence files: 404. Evidence-upload token: 400. Dashboard, submissions, projects and activity show nothing of Alex's |
| 14 | Earlier decisions and evidence history intact | PASS | Decision history lists all three (round 1, round 2, final round 3) with the disclaimer. Finding events show the full chain, e.g. #2: ∅→DRAFT, DRAFT→DRAFT (edited), DRAFT→OPEN, OPEN→RESPONDED, RESPONDED→OPEN (note), OPEN→RESPONDED, RESPONDED→RESOLVED (note) |
| 15 | M3/M4 still work | PASS | Queue ("Resubmitted (round 2) · V3"), start review, draft findings, request changes, completion with outcome guards (only *Issues resolved* / *Not reviewable* offered), dashboard ("2 reviews completed in the last 7 days"; stats 0/0/0), S3 still "No issues identified". 205/205 automated tests before deploy |
| 16 | Desktop and mobile | PASS (partly, see §5) | Desktop throughout. At 375 px, no horizontal overflow on the client S1 page (after resubmission) or the team submission page with Compare rounds |
| 17 | Legacy records unchanged | PASS | Read-only check vs the 9 Oct backup: 2 projects, 2 legacy creatives, 3 activities, 2 users unchanged. Vs the 17:57 backup: no pre-existing row changed except S1's own workflow fields (status, timestamps, resolution fields, cycle `closedAt`) |

## 2. Final state of TEST S1 (read-only DB check)
- Status REVIEW_COMPLETE; cycle 1 closed. Decisions: CHANGES_REQUESTED (round 1, V2), CHANGES_REQUESTED (round 2, V3), FINAL / ISSUES_RESOLVED (round 3, V4), all by the team user.
- Findings: 3, all RESOLVED, each with `resolvedBy` and `resolvedInVersion` (V3, V4, V4); 5 client responses in total; 1 evidence link.
- Evidence: 2 rows, both CLIENT_SUBMITTED / SHARED, stored under `evidence/<S1>/…`; 1 withdrawn (kept). Storage holds exactly these 2 files.
- Versions: V1–V4, all kept.

## 3. Bugs found (minor; none block the demo)
| ID | Bug | Where | Suggested fix |
|---|---|---|---|
| B1 | An earlier file error stays on screen after picking another file (e.g. "isn't a valid PDF" plus the new "up to 10 MB") | Evidence form | Clear the form error when a new file is chosen |
| B2 | A server error on the Resubmit card (from the forced test submission) stays visible after the checklist becomes complete | Resubmit card | Reset the action state when readiness changes, or key the form on it |
| B3 | Compare rounds labels the earlier card "Submitted by" even when that round was a resubmission (round 2) | Compare rounds | Use "Resubmitted" when the round number is greater than 1 |
| B4 | Evidence is labelled with the version current when it was added ("With V2"), even though it was submitted with V3. Accurate but confusing | Evidence list | Label as "Added during round n", or drop the version badge |
| B5 | Withdrawn evidence doesn't show who withdrew it or when (both are stored) | Evidence list | Add "Withdrawn by … · date" |

## 4. Product-decision follow-up (recorded, not changed)
**Decision:** client responses and newly added evidence should stay private from TEAM until the client formally resubmits.
**Current behaviour:** they're visible to TEAM as soon as they're written, while the status is CHANGES_REQUESTED (loader `getSubmissionReview` returns all responses and evidence to TEAM).
**Follow-up:** filter TEAM's view to responses and evidence created at or before the latest round's `submittedAt`, while the status is CHANGES_REQUESTED, and keep withdrawn-before-resubmission items hidden too (or show only once submitted). Add tests.
**Test limitation:** this walkthrough never had TEAM view S1 while changes were requested. Every TEAM visit came after a resubmission, so the early exposure wasn't observed in the browser and the browser results don't depend on it. The behaviour is confirmed from the code. The privacy result in #12 covers client-facing privacy only.

## 5. Not covered, or only partly covered
- **Withdrawing a *published* finding:** the control is present ("Withdraw finding") and covered by unit tests, but not exercised in the browser, because every shared finding was resolved before a suitable moment arose.
- **Remediation forms at 375 px** (evidence form, respond form, resubmit checklist): not viewed at phone width while S1 was in CHANGES_REQUESTED; only the post-resubmission and team pages were.
- **Server-side size cap:** verified as encoded in the issued upload token (10 MB); an actual >10 MB upload bypassing the browser check wasn't attempted.
- **MP4 playback and seeking:** not tested (as before).

## 6. Security and performance notes
- **No security issues found.** Storage URLs never appeared in page HTML. Every file request was scoped (cross-client 404). Server rules held when UI controls were bypassed (forced resubmit, empty notes, direct token requests).
- Test-only upload tokens were requested directly to inspect their limits. No files were uploaded with them, and they expire after 15 minutes.
- **Performance (I6, unchanged):** about 6–12 s per action (upload + verify + save, response, resolve) because of Render database latency. Visible during the demo; consider a database region closer to Vercel's functions, or fewer round trips per action.

## 7. Remaining work
1. Product-decision follow-up (§4): hide client responses and new evidence from TEAM until resubmission.
2. Bugs B1–B5 (§3).
3. Clean up abandoned evidence uploads (extend `blob:orphans` to `evidence/`).
4. From earlier milestones: MP4 playback; not-found pages return HTTP 200 (I4); latency (I6); TEST records stay in the shared database (I7); client dashboard wording (M6).
5. Production (`clyntique-demo.vercel.app`): four-ID check, Blob token for Production, `LOGIN_RATE_LIMIT=enabled`. These need your Vercel actions.
6. **Credentials:** the three demo passwords were shared in the project chat. Rotate them as planned. They aren't in this report or the repository.

Visual redesign and AI integration were not started; they're waiting for your approval.
