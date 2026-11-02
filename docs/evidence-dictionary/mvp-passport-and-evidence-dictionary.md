# Evidence Dictionary and real Compliance Passport (authenticated MVP)

Prepared November 2, 2026. This note describes what the feature branch
`feature/mvp-passport-evidence-dictionary` adds to the signed-in product, what
it reuses, the one additive migration, the authorization and visibility rules,
the tests, the deployment steps and the product choices that still need a
human decision. The `/demo` sandbox is unchanged.

## 1. What was inspected first

- **Evidence today** is per creative: an `Evidence` row (title, type,
  description, source, URL, date, optional file, claim text and location),
  with origin `CLIENT_SUBMITTED` or `REVIEWER_ADDED`, visibility `SHARED` or
  `INTERNAL`, a creative version (`versionId`), optional links to findings
  (`FindingEvidence`), withdrawal history and append-only reviewer assessments
  per review cycle (`EvidenceAssessment`, shown to the client only after the
  decision is published, design decision D5).
- **Who may add evidence** is decided by `authorize()` in
  `src/lib/workflow/policy.ts`: a client only while their creative is
  `DRAFT` or `CHANGES_REQUESTED` (`MANAGE_EVIDENCE`), a reviewer only while it
  is `IN_REVIEW` (`ADD_REVIEWER_EVIDENCE`). Commands lock the creative with a
  guarded no-op update inside the transaction so a concurrent status change
  cannot slip through.
- **What the team sees** of a client's work is decided by submission state:
  nothing in `DRAFT`, and only what was present at the last submission.
  What the client sees of reviewer work is decided by `publishedWithDecision`.
- **The Compliance Passport MVP** already exists for signed-in users as the
  read-only, printable review record at `/admin/creatives/[id]/record` and
  `/dashboard/creatives/[id]/record` (`src/components/record/review-record.tsx`),
  built from the same loader as the workspace (`getSubmissionReview`), with the
  disclaimer that an internal review is not legal, government or platform
  approval.
- **AI rule gating** (`citableRulesForSubmission`) only cites policy rule
  versions that are verified and approved. This branch does not touch it; the
  AI check still uses none of the UNVERIFIED Production rules.

## 2. Design: reuse, do not duplicate

An **evidence record** is a reusable description of a piece of evidence that
lives in a workspace's Evidence Dictionary. **Attaching** a record to a creative
creates an ordinary `Evidence` row that copies the record's text and points back
to the record (`Evidence.recordId`). Because the attachment *is* an `Evidence`
row, every existing rule applies unchanged: version binding, submission
visibility, withdrawal, finding links, cycle assessments, the Evidence tab, the
review history and the passport.

| Concern | Reused as is | Added |
| --- | --- | --- |
| Evidence on a creative | `Evidence`, `FindingEvidence`, `EvidenceAssessment`, `addEvidence`, `withdrawEvidence`, `assessEvidence` | nullable `Evidence.recordId` |
| Reusable record | — | `EvidenceRecord` (per client, or Clyntique's when `ownerClientId` is null) |
| Reviewer check of a record | — | `EvidenceRecordCheck`, append-only; `EvidenceRecord.status` mirrors the latest check |
| Authorization | `authorize()` actions `MANAGE_EVIDENCE` and `ADD_REVIEWER_EVIDENCE`, role checks in actions | pure helpers in `src/lib/workflow/evidence-records.ts` (ownership, when the team may see a client record) |
| Passport | `review-record.tsx`, `getSubmissionReview` | record status, validity, reviewer check column, findings ↔ evidence, "evidence still needed" |
| Forms and layout | `FormError`, field styles, `PageSkeleton`, nav, Evidence tab (`client-remediation.tsx`) | `src/components/evidence/*` |

## 3. Exact MVP functionality

### Client workspace (`/dashboard`)

- **Evidence dictionary** page (`/dashboard/evidence`, new nav item): the
  client's own records with search and filters by type and status, a summary
  strip of counts, and a form to add a record (title, type, description,
  source, URL, claim it supports, valid until). Clients cannot create
  `POLICY_REFERENCE` records; a record needs at least a description, a source
  or a URL.
- **Record page** (`/dashboard/evidence/[recordId]`): details, where the record
  is used (each creative, with links to the Evidence tab and the passport),
  reviewer checks (shown as "Clyntique reviewer", no names), and an
  "Attach to a submission" form listing only the client's own creatives that
  currently allow evidence (`DRAFT`, `CHANGES_REQUESTED`).
- **Evidence tab of a creative**: a new "Attach from your Evidence Dictionary"
  form beside the existing evidence form, with optional claim location and
  finding links. The existing form gets a "Save to my Evidence Dictionary"
  checkbox, so evidence entered once becomes reusable without re-typing.
- Attached evidence reaches the team exactly as any other client evidence:
  when the client submits or resubmits.

### Team workspace (`/admin`)

- **Evidence dictionary** page (`/admin/evidence`): Clyntique records (owner
  null, created by any team member) plus client records that have reached the
  team through a submission; filter by workspace (Clyntique / clients), type,
  status, search. Team members can add Clyntique reference records (any type,
  including `POLICY_REFERENCE`).
- **Record page** (`/admin/evidence/[recordId]`): details, usages, reviewer
  checks with names, a **check form** (Accept for use in reviews / Needs more
  information / Not accepted; a note is required unless accepting), and, for
  Clyntique records only, an attach form listing creatives currently
  `IN_REVIEW` with a visibility choice (shared with the client or internal).
- **Evidence tab of a creative under review**: "Attach a Clyntique record"
  form beside the existing reviewer evidence form.
- A check updates the record's status (`UNCHECKED` → `ACCEPTED`,
  `NEEDS_MORE_INFO` or `NOT_ACCEPTED`). Checks are never edited or deleted.

### Compliance Passport (both roles, `/creatives/[id]/record`)

- Summary rows **Evidence** (active count, how many from the dictionary, how
  many checked, withdrawn count) and **Evidence still needed** (open findings
  with no evidence linked).
- Each finding in each cycle now lists the cited rule and version, the claim
  text, and the titles of the evidence linked to it, or "No evidence linked
  yet."
- The evidence table gets a **Reviewer check** column (record status pill plus
  the latest cycle assessment), a link to the record where the viewer may open
  it, validity (`Valid until …` or `Expired`), and the claim.
- A new notice states that a reviewer check is Clyntique's internal review of
  the record as described and is not a scientific, legal, regulatory or
  platform validation, nor a decision about any creative. The existing
  disclaimer that internal review is not legal, government or platform approval
  stays.

### What is deliberately not in v1

- No editing, archiving or deleting of records or checks (append-only history;
  a record whose text is wrong is replaced by a new record).
- Files stay with the submission (`Evidence.fileUrl`); a record holds text and
  a URL only. No new Blob usage.
- No AI involvement: records and checks are human entries and do not feed the
  AI check.
- No activity-log rows for record creation or checks (the rows themselves carry
  creator, reviewer and timestamps). Attachments follow the existing evidence
  behaviour, which also writes no activity row.

## 4. Schema and migration

Migration `prisma/migrations/20261102170000_evidence_dictionary/migration.sql`,
additive only, hand-written and verified on an embedded PostgreSQL (PGlite):

- enums `EvidenceRecordStatus` (`UNCHECKED`, `ACCEPTED`, `NEEDS_MORE_INFO`,
  `NOT_ACCEPTED`) and `EvidenceRecordCheckResult` (`ACCEPTED`,
  `NEEDS_MORE_INFO`, `NOT_ACCEPTED`);
- `Evidence.recordId TEXT NULL` with an index and a `RESTRICT` foreign key;
- table `EvidenceRecord` (`ownerClientId` nullable → `User`, `createdById` →
  `User`, `title`, `type` reuses `EvidenceType`, `description`, `source`, `url`,
  `claimText`, `validUntil`, `status` default `UNCHECKED`, timestamps; indexes
  on `(ownerClientId, createdAt)` and `status`);
- table `EvidenceRecordCheck` (`recordId` → `EvidenceRecord`, `reviewerId` →
  `User`, `result`, `note`, `createdAt`; index on `(recordId, createdAt)`).

Nothing is dropped, renamed, updated, deleted or inserted. All five foreign
keys are `ON DELETE RESTRICT`, so history cannot disappear by cascade. Existing
`Evidence` rows keep working with `recordId = null`. The restore script's table
order (`prisma/db-restore.ts`) includes the two new tables; the export script
discovers tables from the database and needs no change.

## 5. Authorization and isolation rules

| Actor | May | May not |
| --- | --- | --- |
| Client | create records in their own workspace (owner forced to their own id, whatever the form sends); list, open and attach only their own records; attach only to their own creatives, only in `DRAFT`/`CHANGES_REQUESTED` | see or attach another client's record or a Clyntique record; create `POLICY_REFERENCE`; check a record; attach a record twice to the same creative while an attachment is active |
| Team | create Clyntique records; see Clyntique records and client records that reached the team (an active attachment on a creative in `SUBMISSION_REVIEW` whose status is not `DRAFT` and whose attachment predates the last submission); check such records; attach Clyntique records to creatives `IN_REVIEW` with an open round | see a client record the client never submitted; attach a client's record on the client's behalf; check a record it cannot see |

Loaders apply the same scope (`recordScope`) as the commands, so a guessed id
returns "no longer available". Client views mask reviewer names as
"Clyntique reviewer" (design decision D4).

## 6. Tests

`tests/evidence-dictionary.test.ts` (21 tests, Prisma mocked like the rest of
the suite) covers: record creation and owner forcing; attaching across
workspaces (refused), in each creative status, duplicates, finding links,
the team path (visibility required, round open, `IN_REVIEW` lock); checks
(team only, note required, unseen client record refused, status update in one
transaction); the pure visibility rules; loader scope and masking; and
passport accuracy through `getSubmissionReview` (record status, validity,
link only where the viewer may open the record). `tests/migrations.test.ts`
checks the migration is additive and that the restore order still restores
every table and every parent first.

Full suite on the branch: 48 files, 580 tests passing. `tsc --noEmit`, ESLint
and `next build` clean.

## 7. Deployment requirements

1. **Order matters: migrate first, then merge.** The evidence loader on this
   branch selects the new `recordId` column, so if the code reached Production
   before the migration, every creative page, Evidence tab and passport would
   fail until the migration ran. The migration is additive, and the code on
   `main` today ignores the new column and tables, so applying it before the
   merge is safe and leaves no window of breakage.
2. **Migration**: run `npx prisma migrate deploy` once from an LF checkout of
   this branch on GT with the Production `DATABASE_URL`, under the CEO's
   separate approval. Recommended sequence: fresh backup → `prisma migrate
   status` (shows one pending migration) → deploy → status again (none
   pending) → read-only check that the two tables exist and are empty.
3. **Merge** needs the CEO's approval (merge to `main` deploys Production).
   After Vercel reports success: smoke `/admin/evidence`, `/dashboard/evidence`,
   one creative's Evidence tab and one passport for each role.
4. **No new environment variables, services, Blob config or cron.** Free tier
   unchanged.
5. **Rollback**: the migration can be reversed by dropping the two tables, the
   column and the two enums (in that order) only while no records exist; the
   code on `main` before this PR ignores the new column, so reverting the code
   alone is also safe.
6. **Data**: no Production rows are created or changed by this PR.

## 8. Product choices to confirm

1. **Reviewer checks are visible to the client immediately** (as "Clyntique
   reviewer"), unlike cycle assessments, which wait for the decision. A check
   is about the record, not the creative, so the client learns early that a
   record needs more information. Alternative: hold checks until a decision.
2. **A client record reaches the team only through a submission.** The team
   cannot browse a client's dictionary; it sees a record once the client used
   it in a submitted creative.
3. **No edit or archive of records in v1.** A wrong record is replaced by a new
   one; old attachments keep the text they were submitted with.
4. **The check vocabulary** ("Checked by Clyntique reviewer", "Needs more
   information", "Not accepted for review") avoids "verified", "validated",
   "certified" and "approved" on purpose. Wording can change without schema
   changes.
