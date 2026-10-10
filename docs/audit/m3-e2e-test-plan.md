# M3 end-to-end verification: read-only results and test plan

Date: 2026-10-10. Approved scope so far: **read-only checks.**

Not done: no database writes, no uploads, no Git commands, no migration, no deploy. No credentials or connection strings were printed.

## 1. Read-only results

| # | Check | Result |
|---|---|---|
| 1 | Local env | `DATABASE_URL`, `SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN` and `LOGIN_RATE_LIMIT="enabled"` present. Target: host `dpg-db3sfh8m7kps73ft1vc0-a` (Ohio), database `cyntique_demo` |
| 2 | Local database state | Unchanged since yesterday: 3 users (1 TEAM, 2 CLIENT, all demo), 2 projects, 2 creatives (both `LEGACY_CLIENT_APPROVAL`), 0 versions. Both migrations finished. Markets US/CA/AE; 7 platforms |
| 3 | `LoginAttempt` | 24 rows: yesterday's 18 test rows, plus 2 successful sign-ins (19:25 and 19:26 UTC, 9 Oct) from your local check after rate limiting was enabled locally. **No Preview sign-ins were recorded**, as expected while `LOGIN_RATE_LIMIT` is unset on Vercel. So these rows say nothing about the Preview database |
| 4 | Blob store | Token valid, store reachable, empty (checked yesterday, read-only) |

## 2. Preview checks that need you (read-only, about 3 minutes)

### A. Which database does the Preview use? (ID fingerprint)

Record IDs are random. If the Preview shows the same IDs as `cyntique_demo`, it uses that database; a successful login alone doesn't prove it. Sign in to the Preview as TEAM and hover or open these, then compare the **end of the URL**:

| Open on the Preview | URL must end with |
|---|---|
| Projects → **Q4 Campaign** | `…ytbcp2` |
| Projects → **Creative 1** | `…qlgr93` |
| Creatives → **Instagram Story — Product Launch** | `…e6ac3x` |
| Creatives → **Facebook Static Ad** | `…p1m9mt` |

All four match: the Preview uses `cyntique_demo`. Any mismatch: **stop**. The Preview points at another database.

The team dashboard loading at all also shows the Preview database has the M1A columns, because the new code reads `Creative.workflow` there.

### B. Is Blob connected to the Preview?

- **Vercel → Settings → Environment Variables:** `BLOB_READ_WRITE_TOKEN` should be listed for **Preview**, alongside `DATABASE_URL` and `SESSION_SECRET`. Check the names only; don't reveal the values.
- **On the Preview, as TEAM:** open **Instagram Story — Product Launch** (a legacy creative) and look at the upload card.
  - A file drop area means Blob is configured on the Preview.
  - "File uploads aren't set up in this environment" means the token is missing for Preview.
- Opening the page doesn't upload anything.

Whether the store is **private** shows on the first real upload (the stored URL contains `.private.`). The code rejects non-private URLs anyway.

## 3. Proposed test data (needs your approval: it writes to `cyntique_demo` and to Blob)

Everything is fictional and prefixed **TEST**. Legacy records are not touched.

| Step | Actor | Action | Writes |
|---|---|---|---|
| 1 | TEAM | Create project **"TEST M3 — Alex (2026-10-10)"** for Alex Morgan | 1 Project, 1 Activity |
| 2 | TEAM | Create project **"TEST M3 — Jordan (2026-10-10)"** for Jordan Lee (client2) | 1 Project, 1 Activity |
| 3 | Alex | Submission **S1 "TEST — Spring promo story"**: Story; markets US + CA; platforms Meta + TikTok. Upload PNG V1, edit context, upload PNG V2, submit | 1 Creative, 4 market/platform rows, 2 versions, 1 ReviewCycle, 1 SubmissionRound, 1 Activity; 2 Blob files |
| 4 | Alex | **S2 "TEST — Product video"**: Video; UAE; Google. Upload MP4. **Leave as draft** (for the draft-privacy check) | 1 Creative, 2 rows, 1 version; 1 Blob file |
| 5 | Alex | **S3 "TEST — Incomplete draft"**: no markets or platforms, no file. Confirm Submit stays disabled | 1 Creative |
| 6 | Alex | Invalid uploads on S3: `.gif` and an oversize 16 MB `.png` are rejected in the browser (no writes). A text file renamed `.png` uploads to Blob, then the server rejects it and deletes the file | Blob write + delete only |
| 7 | Jordan | **S4 "TEST — Jordan draft"**: draft. Then open S1's page URL and S1's media URL; both must be "not found" | 1 Creative |
| 8 | TEAM | S1 visible under Creatives → Submitted, read-only. S2, S3 and S4 invisible: lists, project pages, direct URLs, and S2's media URL. Old "Add creative" URL shows the notice | None |
| 9 | All | Desktop, plus mobile width (375 px): new-submission form, submission page, lists | None |

**Totals:** about 2 projects, 4 creatives, 3 versions, 1 review cycle, 1 round, 8 market/platform rows and about 3 activity rows. In Blob: 3 kept files (2 PNG, 1 MP4) plus 1 rejected file that the server deletes.

**Cleanup:** the app has no delete feature. TEST records stay, clearly labelled, and are visible on the team timeline. If the database also serves production, demo users will see them. If you want them removed later, I'll prepare a separate, approved clean-up for TEST rows only.

**Test files:**
- I'll generate the PNGs, the GIF, the oversize file and the spoofed text-as-PNG locally, in a scratch folder outside the repository.
- `ffmpeg` isn't installed, so **please provide one short MP4**, a few seconds long and under 100 MB, e.g. a phone screen recording with nothing private in it. Or approve testing without video.

**Signing in:** I won't type passwords, because anything I type appears in the session transcript. Either you sign in to each account in the built-in browser pane and I drive the steps, or you run the checklist yourself and send me the results.

## 4. After M3 passes

I'll prepare the M4 team review plan: review queue, starting a review, findings with severity and required action, requesting changes, and version-linked decisions. No M4 implementation until you approve.
