# M5 report: client responses and resubmission

Date: 2026-10-10. Scope: as approved (all five recommended decisions; plan in `m5-plan.md`).

Not done:
- No Git commands, no deploy, no Production configuration changes.
- No legacy data changed. The only database change is the approved additive migration (§3).

**Status: implemented, and every automated check passes. It has not been tested in a browser**, because it isn't on a Preview yet. The checklist is in §6.

## 1. What was built

### Client (when changes are requested)
| Feature | Behaviour |
|---|---|
| **Findings and required actions** | Each published finding shows severity, required action and details, plus its history: the client's responses and the reviewer's resolve / reopen / withdraw notes, with "Clyntique reviewer" shown as the author. Under each finding: "Needed before you resubmit: …" |
| **Respond to a finding** | Per-finding **Respond** form (wording depends on the required action), with optional links to the client's evidence. **Append-only:** no edit or delete, and a further response adds a new entry. The finding moves to *Responded*. **Never resolved by the client or by resubmitting.** |
| **Supporting evidence** | Evidence card with **+ Add evidence**: title, type, description, optional link and source, optional **file (PDF, PNG, JPEG, WebP, up to 10 MB)**, and "Supports finding" chips. Stored privately (Vercel Blob). Always `CLIENT_SUBMITTED` + `SHARED`, attributed to the client and tied to the current version. Files open through an access-checked route (PDF downloads, images open inline) |
| **Withdraw evidence** | Only the client who added it, only for evidence **added since the last submission**, and only while changes are requested (or while still a draft). Recorded as *Withdrawn* with who and when, never deleted. **Evidence that was part of a submitted round is final** and can't be withdrawn |
| **Revised version** | Upload card becomes "Upload a revised version", adding V(n+1) for the next round. Earlier versions are kept |
| **Resubmit** | "Resubmit for review (round n+1)" card with a per-finding checklist and an optional note to the reviewer. Enabled only when every open finding has what it needs; **enforced on the server**. Creates round n+1 linked to the newest version and writes a *Resubmitted* activity |

### Team (round 2 and later)
| Feature | Behaviour |
|---|---|
| **Queue** | Resubmissions show "Resubmitted (round n)" (already supported) |
| **Compare rounds** | On the submission page (from round 2): the previous round's version next to the resubmitted one. Each side shows the round's decision, who submitted and when, version notes and the client's note. Warns if no new version was uploaded |
| **Per-finding decisions** | On a finding the client responded to: **Resolve** (note required; records the version it was resolved on) or **Reopen** (note required, back to Open). Any published, unresolved finding can be **withdrawn** with a reason. New draft findings work as in M4 |
| **Decisions** | Request changes is **blocked until every client response has been resolved, reopened or withdrawn**. Completion uses the M4 outcome guards; "Issues resolved" is available once the findings are resolved. Each round gets its own decision; earlier ones are never changed |
| **History** | Submission history shows each round with the client's note. Decision history and finding timelines show every earlier step read-only |

### Copy
- Sign-in page (I8): "Submit advertising creatives for compliance review, and track findings and decisions in one place."
- Banners for resubmitted rounds (client and team) and for changes requested (client).

## 2. Rules (all server-side)

| Rule | Where |
|---|---|
| **Resubmission readiness (decision 2):** every **open finding, advisory included**, needs a client response written **since the latest change request**. *Revise content* also needs a version newer than the one changes were requested on; *Provide evidence* also needs evidence linked since the request. So a reopened finding needs a fresh response | `findings.ts` `resubmissionGaps`, `readiness.ts` (one loader shared by the command and the checklist) |
| **No auto-resolve:** resubmitting creates a round and nothing else. No finding status, event or decision is written | `commands.ts` `resubmit` (tested) |
| **Resolved stays closed (decision 5):** RESOLVED can't be reopened or withdrawn; a returning issue needs a new finding | `findings.ts` `FINDING_MOVES` (tested) |
| **Evidence finality (decision 4):** withdrawal is soft, own only, and only for evidence created after the latest round's submission | `findings.ts` `evidenceIsFinal`, `commands.ts` `withdrawEvidence` |
| **Evidence files (decision 3):** the upload token is for one server-built path `evidence/<submission>/<key>`, one content type and **10 MB enforced by the Blob store**. On save, the server re-checks: private-store URL, exact path, size ≤ 10 MB, stored content type, and **leading bytes** (`%PDF-`, PNG, JPEG, WebP signatures). Rejected files are deleted | `api/evidence/upload`, `commands.ts` `addEvidence` |
| **No early leaks to the client:** the reviewer's resolve / reopen / withdraw moves (and their notes) reach the client only once a later decision exists; during a review the client still sees the finding as *Responded*. Drafts stay internal as in M4 | `findings.ts` `clientFindingView`, used by `submission-review.ts` |
| **History is never overwritten:** one decision per round (unique `roundId`); no update or delete paths for decisions, rounds, responses, versions or finding events; evidence withdrawal is a timestamp | Schema + commands (tested) |
| **Ownership and state:** every command re-loads the user and checks role, ownership, status and legacy workflow through the M2 policy; responses must target a published finding of the **open** cycle | `policy.ts`, `commands.ts` |
| **Storage URLs never reach the browser:** the loader returns file name, size and type only; files go through `/api/media/evidence/[id]`, which re-checks session and scope (client: SHARED only, own submissions), uses `nosniff`, a sandbox CSP and a sanitized file name | `submission-review.ts`, route (tested) |
| **No AI content:** nothing in M5 generates suggestions. Every finding, resolution and decision is attributed to a named human reviewer | — |

## 3. Database change (approved, applied)

Migration `20261011090000_evidence_files`: four **nullable** columns on `Evidence` (`fileUrl`, `fileName`, `mimeType`, `fileSize`). No defaults, no backfill, no data rewritten.

| Step | Result |
|---|---|
| Fresh read-only backup | `D:\clyntique-demo\db-backups\clyntique-2026-10-10T17-57-24-046Z` (all tables) |
| Before: `migrate status` + live-database-to-schema diff | Only this migration pending; the diff showed exactly the 4 `ADD COLUMN`s |
| `prisma migrate deploy` | Applied |
| After: diff + status | Empty diff; "Database schema is up to date" |
| Every row of every table vs the fresh backup | **All unchanged** (21 tables) |
| Legacy check vs the 9 Oct backup | **PASS**: 2 projects, 2 legacy creatives, 3 activities, 2 users unchanged |
| Deployed M4 code | Unaffected (Prisma selects explicit columns) |

A static test now pins this migration to exactly those four statements.

## 4. Automated checks

| Command | Result |
|---|---|
| `npm test` | **205/205 pass** (17 files; **32 new** in `tests/m5-remediation.test.ts`, plus 2 updated readiness tests and 1 migration test) |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 problems |
| `npx prisma validate` | Valid |
| `npm run build` (placeholder DB URL) | Pass: 23 pages + `/api/evidence/upload`, `/api/media/evidence/[evidenceId]` |

New tests cover:
- **Evidence:** owner-only and state-gated; legacy refused; link and content validation; finding links limited to the open cycle; file path, size (10 MB), type and byte checks, with rejected files deleted.
- **Withdrawal:** soft only; final once submitted; own only; never TEAM or reviewer evidence.
- **Responses:** append-only; earlier cycles refused.
- **Readiness:** counts only work since the latest request; advisory included; *Revise content* after a reopen needs a newer version.
- **Resubmit:** never resolves findings or writes decisions.
- **Round 2:** request changes blocked while responses await a decision; a resolved finding can't be reopened or withdrawn; the round-2 decision is a new record.
- **Client view:** reviewer moves hidden until a decision; no storage URLs in loader output.
- **Upload-token route:** owner only, single type, 10 MB, server-built path.
- **Evidence file route:** session and scope, PDF download / image inline, type mismatch refused.
- **Form actions:** signed-out refusal; browser input coerced.

**M3 and M4 behaviour is preserved.** All earlier tests pass. Two M2 readiness tests changed on purpose: advisory findings now need a response (decision 2), and the "version identified on" field became "version requested on".

## 5. Files

**New**
- `prisma/migrations/20261011090000_evidence_files/migration.sql`
- `src/lib/evidence-files.ts`
- `src/lib/workflow/readiness.ts`
- `src/app/api/evidence/upload/route.ts`
- `src/app/api/media/evidence/[evidenceId]/route.ts`
- `src/components/submissions/client-remediation.tsx`
- `src/components/submissions/compare-rounds.tsx`
- `tests/m5-remediation.test.ts`
- `docs/audit/m5-plan.md`
- `docs/audit/m5-report.md`

**Modified**
- `prisma/schema.prisma`: 4 Evidence columns
- `src/lib/workflow/commands.ts`: `addEvidence`, `withdrawEvidence`, readiness via `loadReadiness`, open-cycle check on responses, header comment
- `src/lib/workflow/findings.ts`: readiness since the latest request, advisory included, `evidenceIsFinal`, `clientFindingView`, request-changes guard
- `src/lib/data/submission-review.ts`: rounds, finding timeline, evidence files and links, withdrawable flag, client readiness, client-side visibility of reviewer moves
- `src/lib/data/submission.ts`: round note
- `src/lib/review/blob.ts`: PDF signature; cleanup checks evidence references
- `src/lib/review/access.ts`: `findAccessibleEvidenceFile`
- `src/app/dashboard/submissions/actions.ts`: respond, add / withdraw evidence, resubmit
- `src/app/admin/review/actions.ts`: resolve, reopen
- `src/components/submissions/submission-view.tsx`, `findings-list.tsx`, `review-history.tsx`, `review-panel.tsx`
- `src/app/auth/login/page.tsx`: I8
- Tests: `tests/workflow-findings.test.ts`, `tests/m4-review.test.ts`, `tests/migrations.test.ts`

## 6. Browser-testing checklist (Preview, TEST data only)

Prerequisite: push the branch so Vercel builds a new Preview (your Git step). The Preview already uses the migrated database. Use **TEST S1** (changes requested, 2 findings) and the TEST files in `D:\clyntique-demo\test-assets\m5` (`TEST-price-history.pdf`, `TEST-not-really.pdf`, `TEST-oversize-11mb.pdf`), plus a PNG from `test-assets\m3`.

**As Alex (client1)**
1. Open S1. Check the banner, the "Resubmit for review (round 2)" checklist (disabled) and "Needed before you resubmit" on each finding.
2. Finding #1 (High · Provide evidence): add evidence with a **PDF** and "Supports #1". Check it's listed, the file downloads, and it can be withdrawn.
3. Withdraw a second, throwaway evidence item. It should stay listed as *Withdrawn*.
4. Upload a renamed text file as `.pdf`: it should be rejected ("isn't a valid PDF"). Try an 11 MB file: it should be rejected.
5. Respond to #1 and #2. Each moves to *Responded*. A second response adds a new entry; there's no edit control.
6. Upload V3 (revised version).
7. The checklist turns complete. Resubmit with a note. Check: status *Submitted*, "Resubmitted for round 2"; the evidence can no longer be withdrawn.

**As TEAM**
8. The queue shows "Resubmitted (round 2)". On the submission page, **Compare rounds** shows V2 (Changes requested) next to V3 (Under review) with both notes.
9. Start the review. Request changes should say "Resolve or reopen the 2 findings… first".
10. Resolve #1 with a note. Reopen #2 with a note. Optionally add a new draft finding.
11. **As Alex, during the review:** #1 and #2 still show *Responded*, with no resolution or reopen notes visible.
12. TEAM requests changes (round 2). As Alex: #1 shows *Resolved* with its note; #2 is *Open* with the reopen note and needs a **new** response. The round-1 decision is still listed unchanged.
13. Second loop: Alex responds to #2 and resubmits (round 3). TEAM resolves #2 and completes the review with **Issues resolved**. All three rounds' decisions are listed.
14. Resolved findings show no Reopen control.

**Isolation and history**
15. **As Jordan (client2):** S1 page, both evidence file URLs (`/api/media/evidence/<id>`) and media URLs return not found / 404.
16. **Mobile (375 px):** the client S1 page (findings, evidence form, resubmit card) and the team compare view don't scroll sideways.
17. Read-only DB check afterwards: earlier decisions unchanged; one decision per round; evidence withdrawn, not deleted; legacy unchanged.

## 7. Remaining work and blockers

1. **Browser walkthrough (§6)** needs the branch pushed to a new Preview (your Git step) and your sign-ins.
2. **Abandoned evidence uploads** (file uploaded, form not saved) aren't cleaned up. `blob:orphans` covers `creatives/` only; adding `evidence/` is a small follow-up.
3. **Team sees client responses and evidence as they're added** while changes are requested (before resubmission). This is intended for transparency; say if you'd rather hide them until resubmission.
4. **Pending from M3/M4:** MP4 playback and seeking; the real server-side creative size cap (the Blob token enforces it, but it's unit-tested only); not-found pages returning HTTP 200 (I4); Render latency (I6); TEST records (I7).
5. **Production** (`clyntique-demo.vercel.app`): four-ID check, Blob token for Production, `LOGIN_RATE_LIMIT=enabled`. These need your Vercel actions. The migration is already in the shared database, which Production also uses if it points to the same database (additive, so harmless).
6. **Client dashboard wording** is still legacy (M6).
