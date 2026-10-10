# M5 plan: client responses and resubmission

Date: 2026-10-10. Status: **proposal, waiting for approval**. Nothing has been implemented or migrated.

## 1. What already exists (reviewed)

| Area | Present today | Gap for M5 |
|---|---|---|
| Client sees published findings | Yes (M4). Server-side filter in `submission-review.ts`; drafts never leave the server | Add per-finding response UI and response history |
| `respondToFinding` (M2 command) | Owner-only; CHANGES_REQUESTED only; published findings only; OPEN/RESPONDED → RESPONDED with a `FindingEvent`; links SHARED, non-withdrawn evidence | No form or action calls it yet |
| `resubmit` (M2 command) | CHANGES_REQUESTED → SUBMITTED; new `SubmissionRound` (n+1) in the same cycle on the newest version; guarded `updateMany`; unique `(cycleId, number)`; readiness rule (§4 Q2) | No button or action calls it yet |
| New version upload | Allowed in CHANGES_REQUESTED (M3 upload route + `finalizeVersion`); versions are immutable | Clearer "upload revised version" step |
| Markets / platforms | Already locked after first submission (`updateDraft`) | None. Earlier rounds keep their context |
| Evidence model | `Evidence` has origin, visibility (SHARED/INTERNAL), `versionId`, soft withdrawal; **link/text only, with no file fields** | **No command for client evidence in the new workflow; no file upload** |
| TEAM round 2 | `startReview` works again from SUBMITTED; `reviewFinding` RESOLVE/REOPEN (note required, resolution stamped with the round's version); new findings; request changes or complete. One decision per round (unique `roundId`), so earlier decisions can't be overwritten | No resolve/reopen UI; no comparison view |

So most of the server rules exist. M5 is mostly **wiring, UI, an evidence command and upload, and a comparison view**, plus one additive migration (§3).

## 2. Proposed approach

### Client (CHANGES_REQUESTED)
1. **"What needs to change" panel**: each published finding with severity, required action and details, plus a checklist of what's still needed before resubmitting (response / newer version / evidence), from the existing `resubmissionGaps` rule.
2. **Respond to a finding**: explanation (required), optionally linking existing or new evidence. Responses are **append-only**: no edit or delete; a further response adds a new entry. The finding moves to "Responded". **It is never resolved by the client or by resubmitting.**
3. **Add supporting evidence**: title, type, description, optional source/link, optional **file** (§3). Always `origin = CLIENT_SUBMITTED`, `visibility = SHARED`, tied to the current version. The client can **withdraw** their own evidence while changes are requested. It's kept and shown as "Withdrawn" and never deleted.
4. **Upload revised version** (existing flow), shown as V(n+1) with a version note.
5. **Resubmit for review**: optional note to the reviewer; enabled only when the readiness checklist is met (enforced on the server). Creates round n+1 linked to the newest version and writes "Resubmitted" activity.

### Team (round 2+)
6. **Queue** shows resubmissions as "Round 2" with a *Resubmitted* tag.
7. **Compare rounds** on the submission page: the previous round's version and the new version side by side (image previews / video players), with version notes, plus, per finding, what the client said and which evidence they linked since the last decision.
8. **Per-finding decisions in review**: **Resolve** (note required; records the version it was resolved in) or **Reopen** (note required, back to Open). New draft findings work as in M4.
9. **Request changes again** or **Complete review** (existing M4 forms and guards; "Issues resolved" becomes available once findings are resolved).
10. **History**: round-by-round timeline: submission → decision → responses and evidence → resubmission → decision. Earlier decisions, findings, responses and evidence are read-only.

### Security and integrity (server-side, all actions)
- Role, ownership, status and legacy checks run through the existing policy for every command. Clients act only on their own submissions and on published findings.
- Clients can't edit or delete responses, versions, decisions, findings or earlier rounds. Evidence is withdrawn, never deleted. TEAM can't change a decided round.
- Evidence file access goes through a scoped media route: client gets own SHARED only; TEAM gets everything except client drafts. Same magic-byte, path and size checks as creative uploads.
- Nothing in M5 generates AI content. Every finding, resolution and decision is attributed to a named human reviewer. If AI suggestions are added later (not approved), they get a separate, clearly labelled model and never become findings without a reviewer's action.
- Copy: sign-in tagline changes from "…track approvals…" to submission and review wording (fixes I8).

### Tests
New tests for: respond (owner/state/draft-finding refusal, append-only), evidence create/withdraw and file finalize (type, size, path, ownership), media route scoping, resubmit (gaps, new round on newest version, no auto-resolve, race), round-2 resolve/reopen, request-changes-again, completion after resolution, comparison loader scoping, and no leaks to other clients. Existing M3/M4 tests must keep passing. Then `tsc`, lint, build.

## 3. Database change (needs your approval before running)

**Migration `20261011_evidence_files`: additive only.** Four **nullable** columns on `Evidence`:

| Column | Type | Purpose |
|---|---|---|
| `fileUrl` | text, null | Private Blob URL (never sent to the browser; served via the media route) |
| `fileName` | text, null | Original file name, for display |
| `mimeType` | text, null | Verified type |
| `fileSize` | integer, null | Bytes |

SQL: `ALTER TABLE "Evidence" ADD COLUMN ...` ×4. No defaults, no backfill, no constraint changes, no data rewritten; existing rows (0 today) unaffected. Plan:
1. Write the migration offline and validate it locally.
2. With your approval, take a fresh read-only export backup and run `prisma migrate status`.
3. Run `prisma migrate deploy` against the shared Render DB.
4. Verify the 4 columns exist, run the legacy-unchanged check and report.

**Rollback (only on your instruction):** drop the four columns. Nothing else depends on them.

No other schema changes are needed. Responses, rounds, decisions, finding events and evidence links already exist.

**Alternative with no migration:** evidence as text plus a reference link only (no file upload). Faster, but "upload supporting evidence" would mean links only.

## 4. Questions: REQUIRES PRODUCT CONFIRMATION

| # | Question | Recommendation |
|---|---|---|
| Q1 | Evidence files: approve the additive migration above, or links only? | **Approve migration** (files) |
| Q2 | Resubmission gate (current M2 rule): every open non-advisory finding needs a response; *Revise content* also needs a newer version; *Provide evidence* also needs linked evidence. Keep it strict, or allow resubmitting with a warning? | **Keep strict** (clear for the demo; enforced on the server) |
| Q3 | Evidence file types and size | **PDF, PNG, JPEG, WebP; up to 10 MB** |
| Q4 | Can the client withdraw their own evidence while changes are requested (kept as "Withdrawn" in history)? | **Yes**, and only their own, only in CHANGES_REQUESTED |
| Q5 | Should resolved findings stay closed in later rounds, with the reviewer able to raise a *new* finding if the issue returns? | **Yes** (no reopening after resolution, so history stays clean) |

## 5. Deliverables after implementation
Implementation; test results; security and permission checks; a browser-testing checklist for the Preview (TEST data only: S1 round 2 end to end, isolation as Jordan); the migration report; remaining blockers; `docs/audit/m5-report.md`. No Git, no deploy, no Production config changes.
