# Clyntique — Stage A Correction Plan (v4)

Date: 2026-10-09.

Status:
- **M0 approved and implemented** (no schema change; see §13 and `docs/audit/m0-operator-steps.md`).
- **M1–M8 not approved.**
- All other decisions are pending product confirmation.
- No database, migration, deploy or git action has been taken.

### Confirmed product direction vs awaiting scope approval

| Confirmed (from your messages) | Awaiting MVP scope approval (recommendations only) |
|---|---|
| Flow: client submits assets → compliance analysis and evidence workflow → internal human review → documented decision → remediation and resubmission → traceable record | Everything in §16 (markets/platforms, web assets, severity and required actions, client progress view, reviewer evidence, resubmission rounds) |
| Legacy strategy is non-destructive and uses an explicit marker (D1, D2) | Outcome values (D3), findings details (D5), on-behalf creation (D6), reopening (D7), evidence files (D8) |
| Client drafts are private by default (D4) | Support-access grants (future) |
| No reviewer assignment, but every review action records the reviewer (D9) | Assignment (future) |
| Mocked tests now; integration tests before pilot (D10) | Test database provisioning |
| "Submissions" is the provisional UI term (D11) | — |
| Out of scope: AI, verdicts, government submissions, Meta/TikTok integrations, rulebooks, monitoring, billing, notifications | — |

Labels used below:
- **REQUIRES PRODUCT CONFIRMATION**: an open product question. The text shows my recommendation, not a decision.
- **REQUIRES OPERATOR APPROVAL**: an action on the shared database, credentials or infrastructure.
- **Confirmed (your feedback, 2026-10-09)**: something you have already decided.

Recommendations are not approved requirements. Section 12 is the decision table.

---

## 0. Sources and limitations

- **Read:** the five `docs/audit/` documents; `phase-2/3/4-report.md`; `README.md`; `prisma/schema.prisma`, `seed.ts`, `blob-orphans.ts`; every server action and route handler (including Blob upload and media); auth, DAL and proxy; `src/lib/data/*`; dashboards, the review page and key components; the installed `@vercel/blob` 2.8.1 type definitions. The SDK supports `access: 'private'`, an `allowedContentTypes` list per token and `maximumSizeInBytes`, which is what makes document attachments possible (§6).
- **No Clyntique research repository or product specification is available on this machine.** I searched `D:\clyntique-demo` and the D: drive. I have not seen any Slack conversations or external documents. The product direction comes **only from your two messages**.
- Broader research items (jurisdiction rules, platform policies, regulatory submissions, monitoring, Compliance Passport) are **not** requirements. They appear only as "keep the design open for this" notes.

## 1. Architectural principles (apply to every milestone)

1. **Separate concepts, separate records.** Keep these distinct:
   - **creative content**: the submission and its immutable versions
   - **claims**: statements in the content (future, not built)
   - **findings**: human reviewer issues
   - **evidence**: substantiation from the client or reviewer
   - **rules**: jurisdiction and platform rules (future, not built)
   - **decisions**: human review outcomes

   No table plays two roles. For example, a finding is never also a decision, and evidence is never also a finding.
2. **Human decisions only.** Every finding, decision and status change records the acting user. Nothing is automatically marked compliant, verified or resolved.
3. **No legal or regulatory claims in data or copy.** The word "approved" is not used for new outcomes. UI and stored records state that the review is an internal human review: not legal advice, not government approval, not platform acceptance.
4. **AI is not part of this pass.** If AI is added later, its output must live in its own table (e.g. `RiskFlag`). It must be labelled "Potential risk (automated, unverified)" and a reviewer must confirm it before it becomes a finding. AI output is never shown as a verified legal violation (§9).
5. **Audit history is append-only.** Decisions, finding transitions, responses and reopenings are new rows, never updates that overwrite history. Records tied to a review cycle are never hard-deleted.
6. **Preserve the working app.** Existing pages, project management, login, the media route and legacy records keep working. Changes are additive.
7. **Safety comes first.** Credential remediation and a database backup come before any live migration (Milestone 0, §11).

## 2. Reusable files and components

| Keep as-is | Reuse with changes |
|---|---|
| `src/lib/auth/*`, `src/proxy.ts` | `src/app/auth/actions.ts` `login`: add rate limit |
| `src/lib/media.ts` (whitelist, limits, server-built paths), `src/lib/review/blob.ts` (private store, magic bytes, unreferenced-blob cleanup), `src/app/api/media/[versionId]/route.ts`, `prisma/blob-orphans.ts` | `src/app/api/creatives/upload/route.ts` and `finalizeVersion`: add an owner and status gate. Generalise to an evidence-file purpose (§6). `blob-orphans.ts` also scans `evidence/` |
| The guarded `updateMany` pattern, version-number retry and `safeUrl` (`src/lib/review/actions.ts`) | `shareForReview` becomes client submit; `submitDecision` becomes the team decision |
| `projectScope` / `creativeScope` (`src/lib/data/workspace.ts`), `src/lib/review/access.ts` | `access.ts` becomes the single policy module, with draft-privacy rules |
| UI kit (`src/components/ui/*`, `layout/*`), `ActivityList`, `CreativeCard`, `StatRow`, `ReviewProgress`, `MediaPreview`, `VersionUploader`, review forms, `creative-form.tsx` | `STATUS_STYLES`, `REVIEW_STATE`/`projectStatus` (`workspace/copy.ts`), `StatusBanner`/`DecisionPanel` (`creative-review-view.tsx`), `FILTERS` (`creatives-view.tsx`), `DashboardView` stats, the activity `DOT` map |

## 3. Permission rules (current → proposed)

| Today | Proposed |
|---|---|
| Only TEAM creates creatives | CLIENT creates **submissions** only in projects where `Project.clientId = user.id` (checked on the server). TEAM keeps creative creation as an admin capability (D6) |
| Only TEAM uploads | Only the **submitting CLIENT** uploads new versions, and only while the submission is editable (§5). TEAM uploads only through the D6 admin path |
| TEAM shares; CLIENT decides | CLIENT submits and resubmits. **Only TEAM** starts reviews, records findings, verifies responses and records decisions. Every one of these actions stores the reviewer's user id (D9) |
| TEAM-only evidence | CLIENT manages their own evidence while it is editable. TEAM may add reviewer evidence, pending confirmation (D8) |
| Clients never see drafts | **Client drafts are private to the owning client by default (D4, confirmed).** TEAM sees a submission only from SUBMITTED onward. Legacy team-created drafts stay hidden from clients as today |
| Activity scoped by project | Same scope. Nothing is written for private drafts. Each event records its actor |

**Ownership limitation (documented, not solved):** a project still has exactly one CLIENT user, and there is no organisation. Clients cannot create projects or choose another client's project.

**D4: future support access without exposing drafts.** Not built now. A later, approved design could add a `DraftAccessGrant { creativeId, granteeId, grantedById (the client), reason, expiresAt, revokedAt }` table.
- The **client** grants access to a **named** TEAM user for a limited time.
- `creativeScope` admits that grantee only while the grant is active.
- Every grant, use and revocation is written to the audit log.
- An optional `SUPPORT` capability flag on TEAM users can limit who is eligible.

Visibility stays opt-in per draft, never "all TEAM".

## 4. Legacy data strategy (D1, D2: non-destructive; confirmed)

**Risk in the v2 plan:** v2 treated `submittedById IS NULL` as "legacy". That could misclassify **new** records, for example a team-created admin record, or a record whose submitter user was later removed with SetNull.

**Fix: an explicit, immutable workflow marker on every creative.**
- Add `Creative.workflow CreativeWorkflow NOT NULL`, with enum values `LEGACY_CLIENT_APPROVAL` and `SUBMISSION_REVIEW`.
- Migration order, in one migration:
  1. `ADD COLUMN workflow … NOT NULL DEFAULT 'LEGACY_CLIENT_APPROVAL'`. This labels every existing row as legacy.
  2. `ALTER COLUMN workflow SET DEFAULT 'SUBMISSION_REVIEW'`. Every new row becomes new-workflow, even if code forgets to set it.
- The Prisma schema declares `@default(SUBMISSION_REVIEW)`, and every create action also sets it explicitly. No code path writes `LEGACY_CLIENT_APPROVAL`, and the value is never updated (a test enforces this).
- Legacy status is always **read from this column**, never inferred from nullable fields. Approvals, evidence and activity are classified through their creative's `workflow`.
- `submittedById` uses `onDelete: Restrict`, so a submitter cannot silently vanish.

How legacy records behave:
- They render as today, with a **"Legacy (pre-compliance workflow)"** tag, and are **read-only** in the new workflow.
- `APPROVED` displays as **"Client-approved (legacy)"**. It is never counted as Review Complete or as any review outcome.
- Legacy `IN_REVIEW` / `CHANGES_REQUESTED` keep their values but are labelled legacy (they meant "with the client", not "internal review").
- Legacy `Approval` rows stay untouched and show as "Client decision (legacy)".
- Any conversion is a separate approved step.
- The B1 record (`IN_REVIEW`, no file): **REQUIRES PRODUCT CONFIRMATION.** I recommend leaving it as is, legacy and read-only.

Live data at audit time: 2 creatives (both team-created), 0 versions, 0 approvals and 0 evidence. This is re-verified read-only before migration (operator).

## 5. Status lifecycle and review outcomes (D3)

### 5.1 Workflow status: where the work is (`Creative.status`, new workflow only)

Two values are added to `CreativeStatus`: `SUBMITTED` and `REVIEW_COMPLETE`. `DRAFT`, `IN_REVIEW` and `CHANGES_REQUESTED` are reused. `APPROVED` stays as a legacy-only value that new code never sets.

| From | Action (actor) | To | Guards |
|---|---|---|---|
| — | create submission (client) | DRAFT | client owns the project |
| DRAFT | submit (client) | SUBMITTED | ≥ 1 version; opens review cycle 1 |
| SUBMITTED | start review (team) | IN_REVIEW | reviewer recorded |
| IN_REVIEW | request changes (team) | CHANGES_REQUESTED | ≥ 1 published OPEN finding; decision tied to the newest version |
| CHANGES_REQUESTED | upload revision, respond to findings, add evidence (client) | CHANGES_REQUESTED | owner only |
| CHANGES_REQUESTED | resubmit (client) | SUBMITTED | every OPEN finding has a response **or** a newer version exists (exact rule REQUIRES PRODUCT CONFIRMATION) |
| IN_REVIEW | complete review (team) | REVIEW_COMPLETE | outcome rules in §5.3; decision tied to the newest version |
| REVIEW_COMPLETE | reopen / amend | see §5.4 | **not implemented without approval** |

- All transitions go through one pure function, `src/lib/workflow/transitions.ts`, followed by a guarded `updateMany` (`where status = expected`).
- A new version never inherits a decision. Decisions are rows tied to `(cycle, version)`, and status only reaches `REVIEW_COMPLETE` through a decision on the current version.
- Uploads are blocked in SUBMITTED, IN_REVIEW and REVIEW_COMPLETE, so the reviewed file cannot change under the reviewer.

### 5.2 `ReviewDecision`: what the human concluded, separate from status

`ReviewDecision { id, creativeId, cycleId, versionId, reviewerId, kind (CHANGES_REQUESTED | FINAL), outcome?, summary, scopeNote, createdAt }`. It is immutable; a correction is a new row in a new cycle.

### 5.3 Proposed final outcome values (**REQUIRES PRODUCT CONFIRMATION**)

| Outcome | Meaning | Allowed only when |
|---|---|---|
| `NO_ISSUES_IDENTIFIED` | The reviewer found no issues in the reviewed version, within the scope recorded in `scopeNote` | no published findings in the cycle, other than DISMISSED ones |
| `ISSUES_RESOLVED` | Findings were raised and the reviewer judged all of them resolved | every published finding is RESOLVED or DISMISSED |
| `COMPLETED_WITH_OPEN_ISSUES` | The review closed with findings still unresolved. The reviewer does not consider the creative ready in its reviewed form | ≥ 1 finding left OPEN/RESPONDED; these are frozen as "open at close" |
| `NOT_REVIEWABLE` | The review could not be completed (e.g. unreadable file, missing context) | reason required |

- Every outcome carries the fixed disclaimer: internal human review only, not legal advice, not government approval, not platform acceptance.
- No outcome is called "approved" or "compliant".
- `scopeNote` is free text describing what was reviewed against (e.g. markets or platforms the reviewer considered). It is **not** a rulebook link.

### 5.4 D7: reopening / amendment (proposal only; not implemented without approval)

- A new `ReviewCycle { id, creativeId, number, openedById, openedReason?, openedAt, closedAt? }` table is **added in the MVP schema**, with only cycle 1 used. Findings, decisions and responses belong to a cycle.
- **Proposed later:** "Request amendment" on a REVIEW_COMPLETE submission opens cycle *n+1* with a required reason, and status goes to `CHANGES_REQUESTED` (editable). Cycle *n*'s decision, findings and versions stay immutable and visible as history. The new cycle needs a fresh FINAL decision, and open findings may be carried forward by reference.
- Who may reopen (client, team, or both) and whether it needs reviewer consent: **REQUIRES PRODUCT CONFIRMATION.**

## 6. Evidence, including documents (D8)

### MVP (recommended; **REQUIRES PRODUCT CONFIRMATION** that file attachments are in the MVP)

- **Evidence kinds:**
  - `TEXT`: description/statement (existing fields)
  - `URL`: existing `url`, http(s) only
  - `FILE`: new
- **File types:** PDF (signature `%PDF-`), PNG, JPEG and WebP. Size cap of 20 MB, configurable with a hard ceiling.
- **Storage:** reuse the private Blob pipeline. A token is issued for purpose `evidence`, for the owning client, an editable submission and a server-built path `evidence/<creativeId>/<uploadKey>-<suffix>.<ext>`, with `allowedContentTypes` fixed and the size capped.
- **Finalize step** re-checks owner, status, path, size, type and magic bytes. It records `fileUrl`, `filePathname`, `fileName`, `mimeType`, `sizeBytes` and a **SHA-256** (integrity for future traceability). Rejected files are deleted.
- **Serving:** `GET /api/evidence/[evidenceId]/file`. It re-checks access on every request. Documents are served with `Content-Disposition: attachment`, `nosniff` and a sandbox CSP. Images may display inline.
- **Immutability:** once the evidence is part of a submitted cycle, it can't be edited or hard-deleted. The client can **withdraw** it (`withdrawnAt`, `withdrawnById`), and the record stays in history. Existing evidence rows are preserved unchanged.
- **Verification:** there is no "verified" flag. A reviewer's view of evidence is expressed only through finding resolution notes. Nothing is set automatically.
- **Reviewer-added evidence (REQUIRES PRODUCT CONFIRMATION):** I recommend allowing it, labelled "Added by reviewer" (`addedByRole = TEAM`). Reviewers can never edit or withdraw client evidence.

### Future enhancements (not in MVP)

- Office documents (DOCX/XLSX/PPTX). These are ZIP containers, which brings macro and parser risk.
- Malware scanning. There is no scanner in the stack; this is a risk for any document upload, accepted for the MVP only if confirmed.
- OCR and text extraction, previews and thumbnails.
- Evidence expiry dates.
- A reusable evidence library shared across submissions.
- A per-link evidence sufficiency assessment.

## 7. Findings and remediation (D5, redesigned)

### Model

- **`Finding`** `{ id, creativeId, cycleId, versionId (version where identified), createdById (reviewer), issue (short, required), explanation (required), severity?, status, source = HUMAN, publishedAt?, resolvedById?, resolvedAt?, resolutionNote?, resolvedInVersionId?, createdAt }`.
  - `severity` is a reviewer's assessment, not a legal classification. Whether to have it at all: **REQUIRES PRODUCT CONFIRMATION.**
  - `source` stays HUMAN in this pass and exists for future extension.
- **`FindingResponse`** `{ id, findingId, authorId, message, versionId? (revision the response refers to), createdAt }`. Append-only. Both the client and the reviewer can respond, so it doubles as the remediation thread.
- **`FindingEvidence`** `{ findingId, evidenceId, linkedById, linkedAt }` (many-to-many). Either side can link evidence they are allowed to see.
- **`FindingEvent`** `{ id, findingId, fromStatus, toStatus, actorId, note?, createdAt }`. An append-only status history.
- **Future, additive:** `Claim` (text/region in a version) and `Rule` (jurisdiction or platform, versioned) tables, plus nullable `Finding.claimId` / `ruleId` columns. These are **not** built now.

### Status and transitions

| From → To | Actor | Rule |
|---|---|---|
| (new) → DRAFT | reviewer | only while the cycle is IN_REVIEW. Visible to TEAM only |
| DRAFT → OPEN (publish) | reviewer | published together with a CHANGES_REQUESTED decision, or individually during IN_REVIEW (REQUIRES PRODUCT CONFIRMATION) |
| DRAFT → DISMISSED | reviewer | reason required (retracted before publication) |
| OPEN → RESPONDED | client | adds a response (and optionally evidence or a revision). Only while the status is CHANGES_REQUESTED |
| RESPONDED → RESOLVED | reviewer | resolution note required. Only during IN_REVIEW of a later submission |
| RESPONDED → OPEN | reviewer | "response not sufficient", note required |
| OPEN/RESPONDED → DISMISSED | reviewer | reason required (e.g. not applicable) |
| any → (edit issue text) | — | not allowed after publication. Corrections go in a response |

### Visibility

- The client sees only **published** findings (OPEN, RESPONDED, RESOLVED, DISMISSED-after-publish) on their own submission, with responses, linked evidence they can access, and status history.
- DRAFT findings and internal notes are TEAM-only.
- The client dashboard shows an "Outstanding issues" count (OPEN findings).

### Closing the cycle

- See §5.3. `ISSUES_RESOLVED` needs every published finding RESOLVED or DISMISSED.
- `COMPLETED_WITH_OPEN_ISSUES` freezes the open findings.
- A cycle can't close while any finding is still DRAFT.

## 8. Asset types: image/video now, landing pages and websites later

- **MVP:** no schema change for asset kind. Image and video only, using the existing `CreativeVersion` file fields. `CreativeFormat` (placement) is kept.
- **Future, additive only:**
  - a `Creative.assetKind` enum (`IMAGE_VIDEO`, `LANDING_PAGE`, `WEBSITE`, …)
  - `CreativeVersion.kind` (`FILE` | `WEB_CAPTURE`) with `sourceUrl` and `capturedAt`
  - a `VersionFile` child table (several files per version: carousel frames, page screenshots, an HTML snapshot)

  A web version would store an immutable captured snapshot in Blob, because a live URL is not reviewable evidence.
- One prerequisite: `CreativeVersion.fileUrl` is NOT NULL today. Relaxing it to nullable is non-destructive, but it is a schema change that waits until web assets are approved.

## 9. Future Compliance Passport traceability (not built)

The chain is designed so that a passport can be generated later without restructuring:

Submission (`Creative`, `workflow`, `submittedById`, project/client) → `ReviewCycle` → reviewed `CreativeVersion` (immutable file plus metadata; SHA-256 recommended for versions too) → `Finding` + `FindingEvent` + `FindingResponse` → `Evidence` (immutable file + SHA-256, withdrawals kept) via `FindingEvidence` → `ReviewDecision` (reviewer, outcome, scope note, disclaimer, timestamp) → `Activity` events.

Requirements built in now:
- actor ids on every row (`Restrict` FKs)
- no hard deletes for cycle-bound rows
- immutable decisions
- timestamps

Out of scope: passport generation, signing and sharing.

## 10. Activity and audit history

- **New `ActivityType` values (additive):** `SUBMISSION_SUBMITTED`, `EVIDENCE_SUBMITTED`, `REVIEW_STARTED`, `FINDING_RECORDED` (on publish), `CHANGES_REQUESTED` (reused), `RESUBMITTED`, `VERSION_UPLOADED` (reused, only after the first submission), `REVIEW_COMPLETED`.
- **New column:** `Activity.creativeId` (nullable), used for links and per-submission history.
- Existing rows and their wording are untouched.
- Activity stays scoped by project. Nothing is written for private drafts or DRAFT findings.

## 11. Security, database safety and tests

- **Credentials (priority 1):**
  - Code: remove the passwords from the README, and make `seed.ts` require `SEED_*_PASSWORD` env values (≥ 12 characters, refusing to run otherwise). It may create a fictional second client for isolation tests.
  - **REQUIRES OPERATOR APPROVAL:** re-run the seed with new passwords to rotate the live accounts (a DB write). Until then, the published passwords keep working.
- **Backups (priority 1):** **REQUIRES OPERATOR APPROVAL.** Take a Render backup or snapshot before any migration. A separate dev database is recommended (**REQUIRES PRODUCT CONFIRMATION**).
- **Rate limiting:** a DB-backed `LoginAttempt` table, because in-memory limits don't hold on serverless. For example 5 failures per email+IP per 15 minutes, with a generic message. It only works after migration.
- **Headers:** `next.config.ts` `headers()`:
  - `X-Frame-Options: DENY` / `frame-ancestors 'none'`
  - `Referrer-Policy`, `nosniff`, `Permissions-Policy`
  - HSTS in production only
  - a CSP that allows Next's inline bootstrap and the Blob upload host, with a report-only option

  The upload part of the CSP can't be verified without a Blob store.
- **Upload surface:** client and evidence uploads are owner- and status-gated. Every server re-check stays. A per-user quota is a future option.
- **Database safety:** no `db push`, `migrate dev`, `migrate reset` or `--accept-data-loss` against Render. The SQL is generated **offline** from schema files and reviewed before it runs.
- **Mocked tests now (D10, confirmed):**
  - Vitest, with Prisma mocked: client submission, unauthorized upload denial, cross-client denial, internal-review permissions, valid and invalid transitions, version-specific decisions, evidence ownership, resubmission, draft privacy, finding visibility and transitions, outcome guards, legacy marker never written.
  - These never connect to Render.
- **Integration tests required before pilot (documented, not built now):**
  1. A disposable Postgres test database: apply the baseline and the migration from scratch, then run the whole workflow against real queries.
  2. Cross-client isolation with two real client accounts, covering lists, counts, detail, media, evidence files and activity.
  3. Concurrency: double submit, parallel decisions, simultaneous upload and decision.
  4. A test Blob store: token issue, oversize, wrong type, spoofed bytes, path tampering, finalize, image and video streaming with Range, evidence download authorization, orphan script.
  5. End-to-end browser tests (e.g. Playwright): submit → review → findings → changes → response and revision → resubmit → complete.
  6. Rate limit and security header checks against a running build.
  7. A migration rehearsal on a **copy** of the production snapshot, checking that row counts are preserved and every old row is marked `LEGACY_CLIENT_APPROVAL`.

## 12. Decision table

| ID | Topic | Recommended | Alternatives | Risks | Explicit approval needed |
|---|---|---|---|---|---|
| D1 | Legacy identification | Explicit `workflow` column: existing rows backfilled LEGACY by the column default, then the default switched to SUBMISSION_REVIEW | Infer from `submittedById` (rejected: misclassifies) | Two-step default must be in one migration | Strategy confirmed. Migration SQL needs OPERATOR APPROVAL |
| D2 | Legacy records (incl. B1) | Read-only with a legacy label; no conversion | Convert, or archive | Legacy items clutter lists (mitigated by a Legacy filter) | B1 handling: PRODUCT CONFIRMATION |
| D3 | Outcome values | Status separate from `ReviewDecision.outcome`; the 4 outcomes in §5.3 plus a disclaimer | Single "complete" outcome; pass/fail | Wording read as legal approval (mitigated by copy) | **PRODUCT CONFIRMATION** of values, names and meanings |
| D4 | Draft privacy | Private to the owning client; future `DraftAccessGrant` | Visible to all TEAM; role-based support access | Support can't help with drafts until grants exist | Default confirmed. Grants are future work |
| D5 | Findings | §7 model, statuses, visibility; append-only responses and events | Comments only; findings without client response | More UI and state complexity | **PRODUCT CONFIRMATION**: severity field; publish timing; resubmit rule |
| D6 | Team creative creation | **Retain as an admin capability** ("Create on behalf of client"). The record uses the new workflow as a DRAFT visible to the team creator and the client, and **only the client can submit it**. Reasons: preserves the working feature and onboarding/support use, and keeps separation of duties (the client attests submission, the team reviews) | Deprecate now; keep the legacy team-upload flow unchanged | On-behalf drafts are an exception to client-only drafts | **PRODUCT CONFIRMATION** |
| D7 | After Review Complete | `ReviewCycle` table in the MVP; reopen/amend as a later feature that opens cycle n+1 and keeps cycle n immutable | Force a new submission; allow editing the closed cycle (rejected) | Carry-forward rules are complex | Reopening needs **PRODUCT CONFIRMATION** and separate approval |
| D8 | Evidence files | MVP: PDF/PNG/JPEG/WebP ≤ 20 MB, private Blob, SHA-256, attachment download, withdraw instead of delete | Links/text only; include Office documents | No malware scanning; storage cost | **PRODUCT CONFIRMATION**: files in MVP; reviewer-added evidence |
| D9 | Reviewer identity | No assignment; every action stores the reviewer id | Assignment queue | Two reviewers can work the same item (guarded updates prevent conflicting decisions) | Confirmed |
| D10 | Tests | Mocked Vitest now; integration list §11 before pilot | Real test DB now | Mocks can drift from real queries | Confirmed. A test DB later needs OPERATOR provisioning |
| D11 | Term | "Submissions" in the UI (provisional) | "Creatives" | — | Confirmed (provisional) |
| A1 | Asset kinds | No change now; additive plan §8 | Add `assetKind` now | Premature enum values | PRODUCT CONFIRMATION before any web assets |
| A2 | Market/platform fields on submission | Free text in campaign context only | Structured fields now | Structured fields could imply rule coverage | PRODUCT CONFIRMATION |
| A3 | Migration approach | Baseline `0_init` plus additive `1_submission_workflow`, generated offline; `migrate resolve` + `migrate deploy` | Keep `db push` (rejected by your instruction) | Baseline drift; check read-only first | OPERATOR APPROVAL |
| A4 | Separate dev DB | Yes, before Stage B browser testing | Keep the shared DB | Testing on a shared, possibly production DB | PRODUCT/OPERATOR CONFIRMATION |
| A5 | Resubmit rule | Superseded by B3: the rule depends on each finding's required action | Require both a response and a new version; require neither | Too strict blocks clients; too lax wastes reviewer time | PRODUCT CONFIRMATION |
| B1 | Markets and platforms | Reference tables + multi-select join tables; US, CA, AE seeded; selection is context only, not rule coverage (§16.1) | Free text; enums; no selection | Implies rule coverage if worded badly; reference data maintenance | **PRODUCT CONFIRMATION** (MVP? lists? subdivisions?) |
| B2 | Web assets | Separate `assetType` (`LANDING_PAGE`, `WEBSITE`), client-uploaded snapshots + URL, optional link to the ad; no crawler (§16.2) | Automated capture; treat as evidence | URL content changes after review; capture fidelity | **PRODUCT CONFIRMATION** (MVP or later) |
| B3 | Severity and required actions | Four severity levels (reviewer assessment) + a required action per finding, driving the resubmit and outcome rules (§16.3) | Severity only; free text only | Severity read as legal risk rating | **PRODUCT CONFIRMATION** (levels, actions, blocking rules) |
| B4 | Client progress and evidence requests | Derived from status, round and findings; no separate request table (§16.4) | Explicit `EvidenceRequest` model | Derived states could confuse if internal states leak | **PRODUCT CONFIRMATION** |
| B5 | Reviewer-added evidence | Allowed; `origin = REVIEWER_ADDED` with name and time; `visibility` SHARED or INTERNAL (§16.5) | Not allowed; always shared | Internal evidence hidden from the client could look unfair if decisive | **PRODUCT CONFIRMATION** |
| B6 | Versioned resubmissions | `SubmissionRound` per submit/resubmit inside a `ReviewCycle`; findings persist across rounds; decisions per round (§16.6) | Cycles only; a new submission each time | More tables; needs clear UI history | **PRODUCT CONFIRMATION** |

## 13. Implementation milestones (each needs your go-ahead; none started)

| # | Milestone | Scope | Acceptance criteria |
|---|---|---|---|
| **M0 ✅ done** | Safety, no schema | Remove passwords from README; env-only seed passwords; security headers; Vitest harness with mocked Prisma; tests pinning current permission behaviour | Met: 48/48 tests; lint, tsc, `prisma validate` and build pass; seed is dry-run by default and needs DB-name confirmation; headers present in `.next/routes-manifest.json`. Live header check in a browser was not run (it would start the app against the shared DB) |
| **M0-ops** | Operator | Render backup; rotate demo passwords via seed; decide on a dev DB | Backup exists; old passwords rejected at login (REQUIRES OPERATOR APPROVAL) |
| **M1 (M1A ✅ prepared, not applied; see `m1a-report.md`)** | Schema foundation, **prepared not applied** | Additive schema (§4–§7, §10, `LoginAttempt`); `0_init` + `1_submission_workflow` SQL generated offline | `prisma validate` passes; SQL contains only CREATE TYPE/TABLE/INDEX, ADD VALUE, ADD COLUMN, SET DEFAULT, ADD CONSTRAINT; reviewed by you. **Work stops here until the operator applies it** |
| **M2** | Workflow core | `transitions.ts`, policy module, rate limiter | Tests for every valid and invalid transition, role rule, legacy guard and rate-limit window |
| **M3** | Client submissions | Create draft, upload, text/URL evidence, submit; client nav "Submissions" | Tests: client submission, unauthorized upload denial, cross-client denial, draft privacy, evidence ownership |
| **M4** | Internal review | Queue, start review, draft/publish findings, request changes | Tests: TEAM-only actions, reviewer id recorded, version-tied decision, finding visibility |
| **M5** | Remediation and closing | Client responses, evidence links, revision, resubmit, reviewer resolve/reopen, complete with outcome | Tests: resubmission, a revision never inheriting a decision, outcome guards, append-only history |
| **M6** | Dashboards and activity | Stats, lists, filters, legacy tag, new activity events | Counts exclude legacy from new metrics; client sees only own-workspace activity (tests) |
| **M7** | Evidence files (if D8 approved) | Evidence token purpose, finalize, download route | Mocked tests now; real verification only with a test Blob store |
| **M8** | Pre-pilot verification | The §11 integration test list on a test DB and test Blob store | All pass; nothing is called production-ready before this |

M2–M7 can be coded and unit-tested on mocks before migration. Browser verification against a database waits for M1 to be applied (operator).

## 14. Commands needing operator approval (none run)

| # | Command (Prisma 7.10 flags verified before use) | Effect |
|---|---|---|
| 0 | Render dashboard backup/snapshot | Safety |
| 1 | `SEED_TEAM_PASSWORD=… SEED_CLIENT_PASSWORD=… npm run db:seed` (after M0) | **Writes**: rotates demo passwords |
| 2 | Read-only row count script (temporary) | Confirms data before migration |
| 3 | `npx prisma migrate diff --from-config-datasource --to-schema <pre-change schema> --exit-code` | Read-only check that the live DB equals the baseline |
| 4 | `npx prisma migrate resolve --applied 0_init` | **Writes** the `_prisma_migrations` table |
| 5 | `npx prisma migrate deploy` | **Applies** `1_submission_workflow` (additive) |
| — | **Never:** `prisma db push`, `migrate dev` / `migrate reset` against Render, `--accept-data-loss`, `npm audit fix --force` | — |

## 15. Out of scope (unchanged)

Live AI, automated verdicts, government submissions, Meta/TikTok integrations, rulebook ingestion, monitoring, billing, email/SMS, Compliance Passport generation, organisations or multi-user clients, support-access grants, reopening (D7), web/landing-page assets.

## 16. Additional design topics (requested 2026-10-09)

**All six topics are REQUIRES PRODUCT CONFIRMATION** for MVP scope. They are designs, not approved requirements. They all fit the additive model in §4–§10 and change nothing already built.

### 16.1 Structured market and advertising-platform selection

- **Purpose:** record where the client intends to run the creative, as review context. **Selecting a market does not mean Clyntique checks that market's rules.** UI copy: "Where you plan to run this ad".
- **Model:**
  - Reference tables `Market { code PK, name, parentCode?, active }` and `AdPlatform { code PK, name, active }`.
  - Join tables `SubmissionMarket { creativeId, marketCode }` and `SubmissionPlatform { creativeId, platformCode }`. Multi-select.
  - Tables rather than enums, so adding a market is a data change, not an enum migration.
- **Initial markets:** United States (`US`), Canada (`CA`), United Arab Emirates (`AE`).
- **Optional subdivisions** via `parentCode`: US states, Canadian provinces/territories, UAE emirates. Whether these are needed: REQUIRES PRODUCT CONFIRMATION.
- **Initial platforms (proposed):** Meta (Facebook/Instagram), TikTok, Google/YouTube, Snapchat, LinkedIn, X, Other. The list REQUIRES PRODUCT CONFIRMATION. **No platform integration** is implied.
- **Uses:**
  - Shown to reviewers.
  - A finding can optionally reference market and/or platform codes (`FindingScope { findingId, marketCode?, platformCode? }`), e.g. "issue relevant to CA".
  - `ReviewDecision.scopeNote` records which selected markets and platforms the reviewer considered.
  - Future: rule sets keyed by market and platform (not built).
- **Validation:** at least one market and one platform before submit (recommended; REQUIRES PRODUCT CONFIRMATION). Codes are checked against active reference rows on the server.

### 16.2 Websites and landing pages as separate reviewable asset types

- `Creative.assetType` enum: `AD_IMAGE`, `AD_VIDEO` (today's behaviour), and later `LANDING_PAGE`, `WEBSITE`. Each web asset is **its own submission**, reviewed in its own right with its own findings and decisions.
- **Linking:** an optional `SubmissionLink { fromCreativeId, toCreativeId, kind = DESTINATION }` connects an ad to its landing page, so reviewers see both. Each keeps its own outcome.
- **What is reviewed:** a live URL can change after review, so a web version is an **immutable capture**:
  - The client provides the URL **and uploads** full-page screenshots and/or a PDF print of the page. The MVP uses only the existing private Blob pipeline, with no crawler.
  - `CreativeVersion` gains `sourceUrl?`, `capturedAt?`, `captureMethod (CLIENT_UPLOAD | AUTOMATED)`.
  - A `VersionFile` child table holds multiple files per version (page sections, mobile and desktop views). This also helps carousels later.
- **Prerequisite:** `CreativeVersion.fileUrl` is NOT NULL today. Web versions keep files in `VersionFile`, so the column can stay as is, or be relaxed later (non-destructive, but a schema change).
- **Future, not built:** automated capture/crawling, multi-page site maps, change monitoring.

### 16.3 Finding severity and specific required client actions

- **Severity** (reviewer's assessment; labelled "Reviewer-assessed severity"; never a legal rating):

  | Value | Meaning (proposed) |
  |---|---|
  | `HIGH` | Must be addressed before the review can close as Issues resolved |
  | `MEDIUM` | Should be addressed; reviewer may accept a documented rationale |
  | `LOW` | Minor; may be accepted as-is with a response |
  | `ADVISORY` | Information only; does not block closing |

- **Required action** (`Finding.requiredAction`, plus a required `actionDetails` text that says exactly what to do):

  | Value | Satisfied by (proposed) |
  |---|---|
  | `REVISE_CONTENT` | a newer version **and** a response pointing to it |
  | `PROVIDE_EVIDENCE` | ≥ 1 linked evidence item **and** a response |
  | `CLARIFY` | a written response |
  | `ACKNOWLEDGE` | client acknowledgement (ADVISORY only) |

- **Rules:**
  - Resubmission needs every OPEN, non-ADVISORY finding to meet its required action. The server checks this; the UI shows what is missing.
  - The **reviewer** still decides RESOLVED. Meeting the required action never auto-resolves a finding.
  - `ISSUES_RESOLVED` needs every non-ADVISORY finding RESOLVED or DISMISSED.

### 16.4 Client-visible review progress and evidence-request status

- **Progress stepper** for each submission: Draft → Submitted → In review → Changes requested → Resubmitted (round *n*) → Review complete. It is derived from `status` plus the current `SubmissionRound`. The client sees timestamps for each step, and no time estimates.
- **Internal states stay hidden:** the client sees "In review" while the reviewer drafts findings. DRAFT findings and internal evidence never appear.
- **Issue summary:** counts of Open, Awaiting reviewer (RESPONDED), Resolved and Dismissed. A list of outstanding issues, each with its required action and what is still missing.
- **Evidence requests:** a finding with `requiredAction = PROVIDE_EVIDENCE` *is* the request. No separate table is needed. Status is derived from the finding:

  | Derived status | Condition |
  |---|---|
  | Requested | finding OPEN, no evidence linked |
  | Provided | evidence linked + response, finding RESPONDED |
  | Accepted | finding RESOLVED |
  | More needed | reviewer moved it back to OPEN, with a note |

  Alternative: an explicit `EvidenceRequest` model, if requests ever need to exist without a finding. REQUIRES PRODUCT CONFIRMATION.
- **Client dashboard:** "Needs your action" lists submissions with outstanding requests.

### 16.5 Reviewer-added evidence with clear attribution

- Allowed (recommended). Every evidence row carries `addedById` (required for new rows), `origin` (`CLIENT_SUBMITTED` | `REVIEWER_ADDED` | `LEGACY`) and `addedAt`.
- The UI shows "Added by reviewer *name*, *date*" or "Submitted by *client name*, *date*". Legacy rows are labelled "Added before the compliance workflow".
- `visibility`: `SHARED` (default; the client sees it) or `INTERNAL` (team-only research notes). **Recommendation:** if a decision relies on INTERNAL evidence, the reviewer is warned to share it or summarise it in the finding. Whether INTERNAL is allowed at all: REQUIRES PRODUCT CONFIRMATION.
- Ownership: reviewers can't edit or withdraw client evidence, and clients can't edit or withdraw reviewer evidence. Nobody can mark evidence "verified". The reviewer's judgement lives in finding resolution notes.

### 16.6 Versioned resubmissions that preserve findings and decisions

- **`SubmissionRound`** `{ id, cycleId, number, versionId (the version submitted), submittedById, submittedAt, note? }`. One row per submit or resubmit. It is immutable.
- **Hierarchy:** Submission → `ReviewCycle` (reopen creates a new one, §5.4) → `SubmissionRound` (each resubmit) → `ReviewDecision` (CHANGES_REQUESTED for that round, or FINAL).
- **Findings persist across rounds.** A finding raised in round 1 on V1 stays the same record. Responses and status events record which round and version they refer to, and `resolvedInVersionId` shows where it was fixed. Nothing from an earlier round is edited or deleted.
- **Decisions never carry forward.** Each round's decision is tied to that round's version. The final outcome applies only to the version in the final round.
- **UI:** version history shows, per version, the round, the decision and the findings raised or resolved. An earlier round can be opened read-only.
- **Passport traceability (§9):** the chain becomes cycle → rounds → versions → findings → evidence → decisions.

**M0 is complete. M1–M8 have not started. I'll wait for your explicit approval of specific milestones and decisions.**
