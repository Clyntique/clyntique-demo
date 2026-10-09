# M3 report: client-owned submissions

Date: 2026-10-09. Scope: **M3 only**. No schema change, migration, reset or `db push`. No database writes, no Git commands, no deploy. Nothing from M4–M8.

**Not verified in a browser.** No test touched the shared database; all automated tests are mocked. Real uploads were **not** tested: there is no `BLOB_READ_WRITE_TOKEN`, so the uploader shows its "uploads aren't set up" message.

## What works (code-complete, covered by automated tests)

**CLIENT**
- Create a draft from **New submission**: dashboard, Submissions list, or a project page (`/dashboard/submissions/new`). It always lands in one of the client's own projects.
- The form has: title, creative type, **target markets** (US, Canada, UAE, from the `Market` table), **advertising platforms** (from `AdPlatform`), description and campaign context.
- Drafts can be saved incomplete and edited later. Markets and platforms are locked once submitted.
- The submission page (`/dashboard/creatives/[id]`) shows:
  - a progress stepper (Draft → Submitted → In review → Review complete) and status banner
  - preview, version history and submission history
  - the uploader (reused; only for the owner, only while DRAFT or CHANGES_REQUESTED)
  - an edit form
  - a **"Ready to submit?"** checklist: file, at least one market, at least one platform
- **Submit for review** runs the M2 command. It records `submittedAt`, opens review cycle 1 and round 1 on the newest version, and writes a `SUBMISSION_SUBMITTED` activity event linked to the creative.

**TEAM**
- Submitted creatives appear in Creatives (new **Submitted** tab), project pages and the activity feed.
- The submission page is **read-only** for the team. Review actions are M4.
- **Client drafts are invisible to the team everywhere:** lists, counts, project progress, detail URLs, `/api/media` and upload tokens. Missing and forbidden look the same.
- The team **"Add creative" flow is retired** (D6 deferred). The button is gone, the old URL explains that clients submit, and the action refuses. Project management is unchanged.

**Legacy records**
- Untouched and still on the old review page, with a small "Legacy" tag on cards.
- Every legacy-only action (share, client approve/request changes, team evidence/details, comments) refuses new-workflow submissions. The legacy approval guard now also requires `workflow = LEGACY_CLIENT_APPROVAL`, so client approval can never be applied to a new submission.

## Server-side wiring

| Path | Rule (all re-checked on the server) |
|---|---|
| `creativeScope` / `projectSelect` (`src/lib/data/workspace.ts`) | TEAM: everything except `SUBMISSION_REVIEW` drafts. CLIENT: own projects; own draft submissions yes, legacy drafts no |
| `/api/creatives/upload` | Legacy: TEAM only. Submission: `authorize(user, "UPLOAD_VERSION")`, i.e. the owner while DRAFT or CHANGES_REQUESTED |
| `finalizeVersion` | Same rule. Re-checks the status inside the transaction (refuses if submitted meanwhile). Never changes a submission's status. No activity for drafts |
| `/api/media/[versionId]` | Uses the same scope, so the TEAM gets 404 for client draft files |
| `createSubmission` / `updateSubmission` / `submitSubmission` (`src/app/dashboard/submissions/actions.ts`) | Wrap the M2 commands `createDraft`, `updateDraft`, `submitForReview` (policy, validation, guarded writes) |
| `createCreative` (team) | Refuses |

**Recorded data:**
- `Creative.workflow` (set explicitly to `SUBMISSION_REVIEW`), `createdById`, `submittedAt`
- `SubmissionMarket` and `SubmissionPlatform` rows
- `CreativeVersion` (uploader in `createdById`)
- `ReviewCycle` and `SubmissionRound` (submitter, version)
- `Activity` with `creativeId`

## Tests

| Command | Result |
|---|---|
| `npm test` | **150/150 pass** (15 files) |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass, no warnings |
| `npx prisma validate` | Valid |
| `npm run build` | Pass. New route: `/dashboard/submissions/new` |

**New in M3:** `tests/m3-submissions.test.ts`, plus updates to `workspace-scope`, `api-routes`, `project-actions` and `helpers`. The fixtures now include client submissions. Coverage:
- **Draft privacy:** scope, project counts, media and upload tokens.
- **Cross-client denial:** upload, media, finalize, create.
- **File ownership:** a client can read their own draft files but not another client's.
- **Status locking:** uploads are refused once submitted, including a race during the upload.
- **No status change on upload:** a submission's status never moves when a file is added.
- **No activity for drafts.**
- **Team uploads:** still allowed for legacy creatives, refused for submissions.
- **Legacy-only actions:** each refuses new submissions.
- **Form actions:** validation, refusal for team users, other clients and signed-out users, and the targeting flag.
- **Incomplete submit:** blocked (no market).
- **Loader scope.**

M2 tests (transitions, submit requirements, rate limiting, etc.) still pass.

## Files

**New:**
- `src/app/dashboard/submissions/actions.ts`
- `src/app/dashboard/submissions/new/page.tsx`
- `src/lib/data/submission.ts`
- `src/components/submissions/submission-form.tsx`, `submit-panel.tsx`, `submission-view.tsx`
- `src/components/views/new-submission-view.tsx`
- `tests/m3-submissions.test.ts`
- `docs/audit/m3-report.md`

**Modified:**
- `src/lib/data/workspace.ts` (scope, `workflow` on summaries)
- `src/lib/data/review.ts` (`workflow`)
- `src/lib/review/access.ts`
- `src/lib/review/actions.ts`
- `src/app/api/creatives/upload/route.ts`
- `src/app/admin/projects/actions.ts`
- `src/components/review/creative-review-view.tsx` (sends submissions to the new view)
- `src/components/review/version-uploader.tsx` (optional message props)
- `src/components/views/form-views.tsx`, `project-detail-view.tsx`, `creatives-view.tsx`, `dashboard-view.tsx`
- `src/components/workspace/copy.ts`, `creative-card.tsx`
- `src/components/ui/review-progress.tsx`
- `src/components/layout/nav-links.tsx` ("Submissions" for clients)
- `tests/helpers.ts`, `tests/workspace-scope.test.ts`, `tests/api-routes.test.ts`, `tests/project-actions.test.ts`

**Deleted:** `src/components/forms/creative-form.tsx` (the team creation form, no longer used).

## Blockers

1. **Blob storage isn't configured** (`BLOB_READ_WRITE_TOKEN` is missing), so real uploads, previews and video playback are untested. Without a file, nothing can be submitted, because submit requires a version. To run the demo flow you need a **private** Vercel Blob store and its token in `.env` (and later in Vercel).
2. **Testing would write to the shared database**, which may be serving production. Creating a test submission writes rows there. Your approval is needed for that, or for a disposable test project.

## Needs browser testing (after Blob is configured and with your approval)

1. **Client:** New submission, then a draft with markets/platforms. Upload a PNG and an MP4; preview and playback work. Edit the draft. Submit is disabled until all three checks pass. Submit; the status becomes Submitted and the form, uploader and targeting lock.
2. **Second client:** gets "not found" on the first client's submission URL and its `/api/media/...` URL.
3. **Team:** doesn't see the client's draft anywhere (lists, project page, direct URL). After submission, sees it under Creatives → Submitted, read-only. "Add creative" is gone, and the old URL shows the notice.
4. **Legacy creatives** still open on the old review page, with a Legacy tag.
5. **Layout** on mobile width (stepper, chips, checklist) and the activity feed entries.

## Known follow-ups (later milestones)

- Dashboard stats and attention lists still use legacy meanings, e.g. client "Awaiting your review" counts `IN_REVIEW` (M6).
- The review queue and review actions (M4), remediation and resubmission UI (M5), and client evidence (pending D8).
