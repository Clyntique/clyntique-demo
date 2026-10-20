# Missing core features

Based on `demo/integration-oct22` @ `a0c90d2` (= `main`) and PR #1 @ `7287d60`. Everything below was checked against `prisma/schema.prisma` and `src/`. "Exists" means in code on the integration branch.

## A. Compliance Passport

| Element | Exists? | Evidence / gap |
|---|---|---|
| Creative-specific compliance record | **No** | No model, page or export. Fragments only (below) |
| Claims | **No** | AI "detected claims" are shown to Team and discarded; no `Claim` model |
| Rules | Partial | `Finding.ruleVersionId` links a finding to the exact rule version, only for accepted AI suggestions. Rules checked with no finding are not recorded anywhere |
| Evidence | Yes | `Evidence`, `FindingEvidence`, with origin, visibility, version, withdrawal |
| Reviewer decisions | Yes | `ReviewDecision` (unique per round, reviewer, outcome, summary, scope note) |
| Creative version reference | Yes | `CreativeVersion`, `SubmissionRound.versionId` and submitted snapshot |
| Policy version reference | Partial | Only via findings (above) |
| Regulatory/platform submission and outcome history | **No** | No model |
| Passport status | **No** | No status (e.g. Active, Needs re-review, Superseded, Revoked) |
| Change history | Partial | `FindingEvent`, `Activity`, rounds. No passport-level history |
| Downloadable or shareable | **No** | No PDF, no share link |

**Why it is missing:** during the 12–13 October sprint the working rule was "no AI/Compliance Passport, no fake metrics or buttons". The 19 October brief makes it core.

**Minimum to build it properly:** stored AI scan runs with the rules checked (B/E below), a `Passport` (or `ComplianceRecord`) entity created when a review completes, immutable snapshot of what was decided, external submissions (C), status changes driven by monitoring (D), PDF export and an expiring share link.

**Safe demo version:** read-only record page from existing data (S1 in `oct22-demo-readiness.md`), labelled as an internal review record.

## B. Living Policy Rulebook

| Element | Exists? | Evidence / gap |
|---|---|---|
| Verified, Team-approved rules | Mechanism yes, content **no** | Maker-checker in `src/lib/policy/auth.ts`; Production has 0 rules and 0 sources (15 Oct) |
| Official source links | Yes (fields) | `PolicySource.officialUrl`, `PolicyRuleVersionSource.directUrl`, `sectionReference`, `excerpt` |
| Applicability: country | Yes | `jurisdictionCode`, `subJurisdiction`, matched to submission markets |
| Applicability: platform | Yes | `platformCode` |
| Applicability: industry | Field yes, per client **no** | `PolicyRule.industry`; the submission's industry comes from one environment variable |
| Effective dates | Yes | `effectiveFrom`, `effectiveTo`, enforced in `applicability.ts` |
| Rule version history | Yes | `PolicyRuleVersion` immutable, with change summary, maker, approver |
| Detecting policy changes | **No** | No source monitoring, no "last checked" job, no diff |
| Human verification before activation | Yes, with gaps | Two-person approval; but the import-maker fix is only on `7287d60`; admin rights still partly by hard-coded email; only one known policy admin account |

**Content status:** the CEO brief (Rev 5, 15 Oct) has a provisional five-rule library. Nothing activated. The doctors' specialties, jurisdictions and platforms are still unknown, which decides which rules apply. The 18 research candidates in `src/lib/policy/candidates.ts` have known source errors and must not be imported as is.

## C. Regulatory / Platform Submission

| Element | Exists? |
|---|---|
| Record a submission to a regulator or platform | **No** |
| Submission date, reference number, status | **No** |
| External approval / rejection / changes requested | **No** |
| Supporting documents | **No** (evidence model could be reused) |
| Manual outcome recording | **No** |

**Recommended MVP approach:** manual recording only. A `ExternalSubmission` row per creative version and destination (platform or regulator, account, date, reference, status), and `ExternalOutcome` rows (result, date, document upload, who recorded it, whether a Team member checked the document). Label every entry with its source ("Reported by client" / "Checked by Clyntique Team"). No API integrations, and no wording that suggests Clyntique submits on anyone's behalf.

## D. Continuous Monitoring

| Element | Exists? |
|---|---|
| Tracking approved policy updates | Partial: approving a new rule version is recorded; nothing reacts to it |
| Identifying affected existing creatives | **No**, and not possible yet: the rules a creative was checked against are not stored |
| Flagging passports for re-review | **No** (no passports) |
| Notifying clients and reviewers | **No** (in-app counts only, no event model, no email) |
| Recording a new review cycle | **No**: `REVIEW_COMPLETE` is terminal; only cycle 1 is ever created (`src/lib/workflow/commands.ts:254`), although the schema allows more |

**Dependencies:** stored scan runs and rules checked → passport → rule-change event → impact query → flag → notify → new review cycle.

## E. AI-Assisted Compliance

| Element | Exists? | Evidence |
|---|---|---|
| Policy-grounded checks | Yes | Only active, verified, in-effect, source-verified, applicable rules reach the model (`src/lib/ai/applicability.ts`) |
| Claims extraction | Shown, not stored | `detectedClaims` in the scan result |
| Supporting evidence considered | **No** | The scan doesn't read the evidence attached |
| Jurisdiction and platform | Yes | From submission markets/platforms |
| Clear source citations | Yes | Rebuilt from the database, model citations ignored |
| Abstention when coverage is missing | Yes | Model not called; fixed message. Verified in local E2E |
| Human remains decision-maker | Yes | Suggestions become Team-only draft findings; only a reviewer publishes |
| Real model call verified | **No** | No Gemini key in any test environment so far |
| Video | **No** | Images only |
| Stored scan history | **No** | In-memory cache only |
| Client pre-check (AI before submission) | **No** | Team-only, after submission |

## F. Landing pages and website claims

**Not in scope today.** Only uploaded image or video files can be submitted (`src/lib/media.ts`). There is no destination URL field, no page capture, and no claim extraction from web pages. Healthcare ad platforms commonly review the landing page together with the ad, so this matters for the doctors pilot. Recommended: add a destination URL to the submission first (cheap), page snapshot and claim review later.

## G. Other gaps that affect the lifecycle

- Reviewer assignment and routing (chat has a nullable `assignedReviewerId`; review has none).
- Password reset, email verification, session revocation (F8).
- Retry-safe creates (duplicate drafts/evidence on a lost response).
- Not-found pages return HTTP 200.
- Industry per client/project.
