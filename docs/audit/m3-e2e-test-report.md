# M3 end-to-end test report (Vercel Preview)

Date: 2026-10-10.
- **Environment:** Vercel Preview `clyntique-demo-cjo138v14-clyntique.vercel.app`, branch `feature/compliance-submissions-m0-m3`, redeployed after adding the Blob token for Preview.
- **Database:** `cyntique_demo`.
- **Storage:** Blob store `clyntique-creatives` (private).
- **Accounts:** you entered all passwords yourself; I never saw or stored them.
- **Tools:** the built-in browser, plus read-only database and Blob scripts.
- **Not done:** no Git commands, no deploy, no migration or reset; legacy data untouched.

**Result: M3 PASSES.** Every planned check passed except two items that stay pending: MP4 playback and seeking, and the server-side size cap.

## 1. Environment checks (before any write)

| Check | Result |
|---|---|
| Preview uses `cyntique_demo` (ID fingerprint) | PASS: Q4 Campaign `…ytbcp2`, Creative 1 `…qlgr93`, Instagram Story `…e6ac3x`, Facebook Static Ad `…p1m9mt` |
| Blob on the Preview | First attempt **FAIL**: "uploads aren't set up" on deployment `ei6ople8x`. After you enabled the token for Preview and redeployed (`cjo138v14`): PASS, the file picker is present |
| Store is private | PASS: every stored URL is on a `.private.` host (read-only database and Blob checks) |
| Security headers on the Preview | PASS: CSP, `X-Frame-Options: DENY`, HSTS, no `X-Powered-By` |
| Production (`clyntique-demo.vercel.app`) | Already serves the same new code (Vercel dashboard and headers) |

## 2. Test data created (all labelled TEST; legacy records untouched)

| Item | Owner | State |
|---|---|---|
| Project "TEST M3 — Alex (2026-10-10)" | → Alex | — |
| Project "TEST M3 — Jordan (2026-10-10)" | → Jordan (client2) | — |
| **S1** "TEST — Spring promo story" (Story; US, CA, UAE; Meta, TikTok) | Alex | **Submitted**, V1 + V2 (PNG) |
| **S2** "TEST — Product video (private draft, PNG stand-in)" (Video; UAE; Google) | Alex | Draft, V1 PNG (stand-in while MP4 is pending) |
| **S3** "TEST — Incomplete draft" | Alex | Draft, no file or targeting |
| **S4** "TEST — Jordan draft" (CA; LinkedIn) | Jordan | Draft |

**Totals:** 2 projects, 4 creatives, 3 versions, 1 review cycle, 1 submission round, 5 market links, 4 platform links, 3 new activity rows. Blob holds exactly 3 files, all private.

## 3. Results

| Area | Test | Result |
|---|---|---|
| Accounts and permissions | TEAM, Alex and Jordan each sign in to their own area | PASS |
| | Team "Add creative" retired: no button; the old URL shows "Creatives are now submitted by the client" | PASS |
| | The client's project picker lists only their own projects | PASS |
| Draft creation | Title, type, markets and platforms saved; "Private draft" banner; stepper at Draft | PASS |
| | Validation: a 1-character title is rejected; typed values are kept; nothing is created | PASS |
| PNG upload | V1: browser → private Blob → server check → version saved under Alex; preview 1080×1920; `/api/media` returns identical bytes, `image/png`, `nosniff`, sandbox CSP, `private` cache | PASS |
| | Upload does **not** change status (still DRAFT) and writes **no** activity | PASS |
| | V2 with a change note; V1 kept and viewable (`?v=1`, "earlier version" banner) | PASS |
| Draft editing | Context edited and UAE added while in draft; "Draft saved." | PASS |
| Submission rules | Submit is disabled until file, market and platform are all present | PASS |
| | **Server rule:** with the disabled button forced on, the server still refuses ("Before submitting: Upload the creative file. Choose at least one target market. Choose at least one advertising platform.") | PASS |
| Submission and locking | Submit → status Submitted, banner with time, history "Submitted · V2 · Alex Morgan" | PASS |
| | **Locked:** no uploader, edit form or Submit button; a direct upload-token request returns **403** | PASS |
| Invalid files | `.gif`: rejected in the browser, and the server token request is refused (400) | PASS |
| | 16 MB `.png`: rejected in the browser ("Images can be up to 15 MB") | PASS (browser) |
| | Text renamed `.png`: uploaded, then the server rejected it ("isn't a valid PNG file") and **deleted it from Blob**; no version saved | PASS |
| Cross-client isolation (as Jordan) | Alex's S1 and S2 pages and Alex's project: "not found", no names leaked | PASS |
| | Alex's file URLs (S1 V2, S2 draft V1): **404** | PASS |
| | Upload token for Alex's draft: refused (400) | PASS |
| | Injecting Alex's project ID into the form: server refused, nothing created | PASS |
| TEAM visibility and draft privacy | Creatives list: S1 (Submitted) plus the legacy items; **none** of S2, S3, S4 | PASS |
| | S2, S3, S4 direct URLs: "This page doesn't exist, or you don't have access to it." | PASS |
| | S2's draft file URL: **404**; S1's file: 200 | PASS |
| | S1 opens read-only for TEAM (no forms, buttons or file input), "Submitted by Alex Morgan on …" | PASS |
| | The TEST project page lists S1 and its "Submitted … for review" activity; no drafts | PASS |
| Legacy isolation | Client sees the legacy Instagram Story with a "Legacy" tag; the team's legacy draft stays hidden from the client | PASS |
| | Every row from the 9 Oct backup is unchanged (users: only the rotated hash and `updatedAt`); legacy creatives still `LEGACY_CLIENT_APPROVAL` | PASS |
| Layout | Desktop: client form, submission page, lists; team list and submission page | PASS |
| | Mobile 375 px: client submission page, New submission form, Submissions list, team Creatives list. No horizontal overflow; nav becomes tabs | PASS |

## 4. Pending

- **MP4 playback and seeking (206):** needs a suitable test video. Untested.
- **Server-side upload size cap:** only the browser check was tested live. I deliberately didn't force a 16 MB file past it; the cap is covered by automated tests.
- **Production checks** (`clyntique-demo.vercel.app`): the four-ID fingerprint, the Blob token for Production, and `LOGIN_RATE_LIMIT=enabled`.

## 5. Issues found

| # | Severity | Issue | Where | Proposed fix |
|---|---|---|---|---|
| I1 | Low (copy) | After creating a project the banner says "Add its first creative when you're ready", which no longer applies | `SUCCESS.project` in `src/components/views/project-detail-view.tsx` | "Project created. The client can now create submissions in it." |
| I2 | Low (copy) | The client's Submissions page `<title>` is still "Creatives · Clyntique" | `src/app/dashboard/creatives/page.tsx` metadata | "Submissions · Clyntique" |
| I3 | Low (copy) | Refusing a foreign or missing project says "This submission is no longer available." | `createDraft` in `src/lib/workflow/commands.ts` | "This project isn't available." |
| I4 | Low (known, B3) | Not-found pages return HTTP 200 with the not-found content; no data exposed | Creative/project detail pages | Track for later |
| I5 | Medium (known, M6) | Dashboard stats still use legacy meanings: the client sees "Awaiting your review: 1" and "Approved"; the team sees "In client review" | `src/components/views/dashboard-view.tsx` | M6 (or a small fix in M4 for the team queue) |
| I6 | Info | Every navigation re-fetches from Render; actions take about 3–6 s on the Preview | — | Monitor; optimise later if the demo feels slow |
| I7 | Info | TEST records remain (no delete feature) and appear on dashboards and timelines | — | Optional TEST-only cleanup later, with approval |

No security or permission defects were found.
