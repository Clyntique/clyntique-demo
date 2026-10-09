# Clyntique — Gaps, Risks and Dependencies

Scope: findings from reading the code and from non-destructive checks. No requirement was invented; nothing here is a roadmap. Severity scale: **High** (could expose data/accounts or break the core workflow), **Medium**, **Low**, **Info**. "Evidence" says how each item was established. No secrets or connection strings are quoted.

## Part A — Security and technical-quality review

| ID | Severity | Finding | Affected files | Evidence |
|---|---|---|---|---|
| S1 | **High if the Render database backs any publicly reachable deployment; otherwise Medium** | Demo accounts with documented passwords exist in the database that the app uses. The README table and `prisma/seed.ts` list the TEAM and CLIENT passwords; both accounts exist in the live Render database and the passwords work (I signed in as each during Phase 4 testing). Whether a public deployment exists was not verifiable from the repo. | `README.md`, `prisma/seed.ts`, database `User` rows | Read + live sign-in + read-only query |
| S2 | Medium | No login rate limiting, lockout or CAPTCHA. Online password guessing is unthrottled. | `src/app/auth/actions.ts` `login` | Code-read |
| S3 | Medium | No security headers configured for the app as a whole (CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, HSTS). Only `/api/media` sets its own `nosniff` + CSP. Pages could be framed. | `next.config.ts` | Code-read |
| S4 | Low | Sessions are stateless 7-day JWTs with no server-side revocation (logout only deletes the cookie). Mitigated: role and user existence are re-read from the DB on each protected request, so deleting or demoting a user takes effect immediately. | `src/lib/auth/session*.ts`, `src/lib/auth/dal.ts` | Code-read |
| S5 | Low | `proxy.ts` does not cover `/api/*`. Both API routes authenticate themselves (`getCurrentUser`), so no gap found, but protection of future API routes would depend on remembering to do so. | `src/proxy.ts`, `src/app/api/**/route.ts` | Code-read |
| S6 | Info | Authorization model checked and found consistent: every server action and route reloads the user and re-checks role; creative access always goes through `creativeScope`; child records (version, evidence, comment, approval) are looked up scoped to the authorized creative; client decisions use one guarded atomic update. No client-reachable path to another client's data or to drafts was found in the code. | `src/lib/review/access.ts`, `src/lib/review/actions.ts`, `src/lib/data/workspace.ts`, `src/lib/data/review.ts`, `src/app/api/**` | Code-read; client draft URL → not-found verified; media route 404/403 verified. **Cross-client denial was never tested** because only one CLIENT account exists. |
| S7 | Medium (unverified) | The file-upload security design depends on behaviour never exercised: that the Blob client token really enforces `maximumSizeInBytes`, `allowedContentTypes` and the exact pathname; that `finalizeVersion` correctly rejects spoofed files (magic-byte check, `head()` metadata); that `/api/media` handles Range requests. These are taken from the SDK docs/types read during Phase 4, not from a real store. | `src/app/api/creatives/upload/route.ts`, `src/lib/review/actions.ts` `finalizeVersion`, `src/lib/review/blob.ts`, `src/app/api/media/[versionId]/route.ts` | Not run (no Blob credentials) |
| S8 | Low | Serving private files through a Vercel function: Vercel documentation advises against streaming files over ~100 MB this way; the default video limit is 100 MB and configurable up to 500 MB. Each card thumbnail is a separate authenticated request. Cost/performance rather than security. | `src/app/api/media/[versionId]/route.ts`, `src/components/workspace/creative-card.tsx`, `src/lib/media.ts` | Code-read + docs |
| S9 | Low | Dependency advisories: `npm audit --omit=dev` reports 4 high-severity items in the Prisma toolchain chain (`deepmerge-ts`, `mysql2` via `prisma`/`@prisma/config`). The app uses PostgreSQL, so the MySQL code is not expected to be exercised; reachability not verified. The suggested fix (`--force`, downgrade to prisma 6) was not applied. | `package.json` | `npm audit` run |
| S10 | Low | Comment duplicate guard is time-based (same user + same text + same version within 15 s is dropped) and gives no feedback that the second submission was ignored. | `addComment` | Code-read; double click verified |
| S11 | Info | Untrusted text is rendered by React (no `dangerouslySetInnerHTML` anywhere in `src/`). External evidence links accept only `http:`/`https:`, reject embedded credentials, and open with `rel="noopener noreferrer nofollow"`. | `safeUrl` in `actions.ts`, `creative-review-view.tsx` | Code-read + `javascript:` link rejection verified |
| S12 | Info | `.env` is git-ignored (`.env*` with `!.env.example`); `.env.example` has names and placeholders only; no secrets found in `src/`, `prisma/`, `README.md`. | `.gitignore`, `.env.example` | Read |

## Part B — Confirmed technical defects

| ID | Severity | Defect | Affected | Evidence |
|---|---|---|---|---|
| B1 | Medium | **Inconsistent record in the database:** creative "Instagram Story — Product Launch" has status `IN_REVIEW` but 0 versions (created in Phase 3 before files existed). The client sees it as "ready for review" with no file and cannot decide; the Share button is unavailable because it is not a draft. A TEAM upload of V1 resolves it. | DB row; `shareForReview`, `creative-review-view.tsx` | Read-only query + page text |
| B2 | Low | Evidence dates are not validated as real calendar dates: `2026-02-31` is accepted and silently stored as 3 March. | `saveEvidence` in `src/lib/review/actions.ts` | Reproduced with `new Date("2026-02-31T00:00:00Z")` |
| B3 | Low | Not-found for a missing or forbidden creative is rendered inside the streamed page shell with **HTTP 200**, not 404. No data leaks (page body contains no creative name), but status codes cannot be used for monitoring or crawlers. | `src/app/dashboard/creatives/[creativeId]/page.tsx` (Suspense + `notFound()`), `not-found.tsx` | Fetch of a draft creative URL as the client returned 200 with the not-found text |
| B4 | Low | Dates in the review thread are formatted with the server's locale/time zone (`toLocaleString("en-US")` on the server), not the viewer's. | `formatDateTime` / `formatDate` in `creative-review-view.tsx` | Code-read |
| B5 | Low | Activity messages are frozen strings. Renaming a creative leaves old messages with the old name; `CREATIVE_UPLOADED` is used for "shared for review", and evidence/team replies use `OTHER`. Activity rows are not links. | `src/lib/review/actions.ts`, `src/components/workspace/activity-feed.tsx` | Code-read |
| B6 | Info | Dead code: `src/components/ui/divider.tsx` has no importers; `CreativeVersion.filePathname` is written but never read; `Comment.updatedAt` can never differ from `createdAt`. | files named | grep / code-read |

No defect was found by lint, type checking or the production build (see section 7 of CLYNTIQUE_IMPLEMENTATION_AUDIT.md).

## Part C — Incomplete implementations (code exists but is not finished or not verified)

| ID | Item | What is missing | Evidence |
|---|---|---|---|
| C1 | End-to-end file upload and preview | Never run against a real private Blob store: token issue, browser upload, `finalizeVersion`, `/api/media` streaming, image and video rendering, oversize/unsupported/failed upload paths, orphan script. | Not run |
| C2 | Evidence edit and delete | Implemented, not exercised in a browser. | Code-read only |
| C3 | `updateCreativeDetails` | Implemented, not exercised in a browser. | Code-read only |
| C4 | Responsive behaviour of Phase 4 pages | Only ~800–1024 px checked. | Browser |
| C5 | Accessibility | Labels, focus styles and ARIA were written with care but not audited with tooling or a keyboard-only/screen-reader pass. | Not run |
| C6 | Status `ARCHIVED` | Present in enum, badge and copy; nothing can set it. | Code-read |
| C7 | Client-side visibility of earlier feedback | After a new version, the client's previous change-request text lives on the older version's thread only; the current version's thread is empty. | Code-read + browser |

## Part D — Missing capabilities relative to what the existing code itself implies

These are limited to things the code or schema names but does not deliver. They are not requests.

| ID | Observation | Where the intent shows |
|---|---|---|
| D1 | No migration history: schema was changed with `prisma db push` in Phases 3 and 4 directly against the one remote database; `prisma/migrations/` does not exist although `prisma.config.ts` sets `migrations.path`. | `prisma.config.ts`, `README.md` (`db:push`) |
| D2 | No way to create user accounts outside the dev seed, which refuses `NODE_ENV=production`. A fresh deployment has no sign-in path. | `prisma/seed.ts` |
| D3 | `EvidenceType` values (RESEARCH, STATISTIC, COMPETITOR, CUSTOMER_INSIGHT, SOURCE) describe substantiation, but nothing links evidence to a specific claim, comment or decision, and no claim/finding model exists. | `prisma/schema.prisma` |
| D4 | `CreativeStatus.ARCHIVED` and cascade-delete relations exist, but there is no archive or delete for projects or creatives, and deleting a creative would not remove its Blob files. | schema, `src/lib/review/blob.ts` (`deleteUnreferencedBlob` only handles rejected uploads) |
| D5 | Activity feed is described in the UI as "Uploads, feedback, and approvals", but entries are not links and there is no per-creative feed. | `activity-view.tsx` |
| D6 | No automated tests; `package.json` has no test script. | `package.json` |
| D7 | No deployment configuration in the repo (no `vercel.json`, CI, Dockerfile, `engines`). `next.config.ts` enables the experimental `cacheComponents` and `partialPrefetching`. | repo root listing |
| D8 | `.git` config contains an `origin` remote and the working tree's history (read from `.git/logs/HEAD` as plain text; no Git command was run) shows two commits, "Initial Clyntique demo" and "feat: real projects and creative management". The commit IDs quoted in earlier phase reports (`56c35ef`, `5f74ff9`, `6742154`, `ec29614`, `8c38425`) do not match that history. Phase 3 itself notes the history was replaced. Whether Phase 4 changes are committed cannot be determined without Git. | `.git/logs/HEAD`, `phase-3-report.md` |

## Part E — Environment and deployment dependencies

| Dependency | Needed for | Status |
|---|---|---|
| `DATABASE_URL` (PostgreSQL) | everything | Present locally (value not read into this document). Phase 3 notes `db push` needed `sslmode=require` as a one-command workaround. |
| `SESSION_SECRET` (≥ 32 chars) | sign-in; `decodeSession` throws if missing/short | Present locally (not inspected). |
| `BLOB_READ_WRITE_TOKEN` (+ `BLOB_STORE_ID`/OIDC on Vercel) | uploads and file delivery | **Not present in this environment**; code shows an explanatory message instead of the uploader. |
| `CREATIVE_MAX_IMAGE_MB`, `CREATIVE_MAX_VIDEO_MB` | optional limits | Defaults 15/100 MB. |
| A **private** Blob store | file privacy | Not verifiable; access mode cannot be changed after creation. |
| Vercel project / Render service | hosting | Not verifiable from the repo. |
| Network | dev pages are slow (Render round trips ≈ 350–450 ms/query per Phase 3) | Observed again in Phase 4 (6–15 s page loads locally). |

## Part F — Product decisions requiring external clarification

I make no recommendation on these; the code simply embodies one choice for each today.

1. Whether a client should be able to submit anything beyond comments and decisions (uploads, evidence, responses to findings).
2. Whether "claims/findings" are part of the product and how they relate to evidence, comments and decisions.
3. Whether a client's decision can be revised or withdrawn, and whether the team can mark requested changes as addressed.
4. Whether `Project` should belong to an organisation with several client users, and whether TEAM users need scoping or roles.
5. How accounts are created and invited in a deployed environment.
6. Evidence scope: per creative (today) or per version.
7. Whether notifications (email/in-app) or real-time updates are in scope.
8. Draft semantics: today a shared creative can never return to draft, and `ARCHIVED` is unreachable.
9. Retention: what should happen to files and history when creatives/projects are removed.
10. Environment strategy: today one remote database is used for development and (if deployed) production.
