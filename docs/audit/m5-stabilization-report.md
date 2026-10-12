# M5 stabilization (Stage A), 12 Oct 2026

- **Scope:** B1–B5, the privacy change "client work stays private until resubmission", abandoned-upload cleanup, and the latency investigation.
- **Not done:** no Git, deploy, Production, schema, migration or data changes.
- **Status: code complete and every automated check passes. Not yet verified in a browser.** The new code isn't on a Preview, and browser testing writes TEST data, so I'm asking first (§6).

## 1. Issues fixed

| ID | Fix | Where |
|---|---|---|
| **B1** | Choosing a different file clears earlier form errors, and the new file is validated immediately, so genuine failures still show. The form also checks title, type and "file, link or description" **before** uploading, and reuses an already-uploaded file on retry. Fixing a form error therefore never uploads the same file twice | `client-remediation.tsx` `EvidenceForm` |
| **B2** | The resubmit form sends a readiness signature (each finding's done/to-do state). A server error is shown only while the checklist is unchanged; completing an item clears it | `ResubmitPanel`, `resubmitSubmission` |
| **B3** | Comparison cards say "Submitted" for round 1 and "Resubmitted" for every later round | `compare-rounds.tsx` |
| **B4** | "With V2" replaced by **"Submitted with round n"**, derived from round submission times. The client's own unsubmitted items show **"Not yet submitted"** | `findings.ts` `submittedWithRound`, `review-history.tsx` |
| **B5** | Withdrawn evidence shows **"Withdrawn by {name} · {date}"** from the stored `withdrawnBy` / `withdrawnAt` | loader + `review-history.tsx` |
| **Privacy** | **Client work prepared since the latest submission is private to the client until they resubmit**, enforced on the server (details below) | `findings.ts`, `submission-review.ts`, `access.ts`, `commands.ts` |
| **Abandoned uploads** | `npm run blob:orphans` now covers `evidence/` as well as `creatives/`. A file is an orphan only if it's under those prefixes, **referenced by no version and no evidence row** (withdrawn evidence keeps its reference), and older than 24 h. References are re-checked before any delete. Dry run is the default: run today, it checked 8 files and found 0 orphans. **I didn't run `--delete`** | `src/lib/review/orphans.ts`, `prisma/blob-orphans.ts` |

### The privacy boundary
Rule: the team sees client work only if it was created at or before the latest round's `submittedAt` (`submittedToTeam`).

- **Responses:** hidden from the team until resubmitted.
- **Finding status:** the client's Open → Responded move is hidden from the team (`teamFindingView`), so the team keeps seeing *Open* until resubmission.
- **Evidence and links:** client evidence and evidence-to-finding links created since the last submission are hidden from the team.
- **Withdrawn evidence:** withdrawal is only possible before submission, so withdrawn client evidence was never submitted. **The team never sees it**, even after resubmission. The client and the database keep it, so the audit history is intact.
- **Direct file URLs:** `/api/media/evidence/[id]` returns **404 to the team** for unsubmitted or withdrawn client evidence, and 404 to other clients as before.
- **Activity feed:** adding or withdrawing evidence no longer writes activity. The resubmission entry summarises it instead, e.g. "Resubmitted … (V4, round 3) with 2 responses and 1 evidence item". Existing activity rows are untouched.
- **Unchanged:** everything already submitted keeps its existing visibility, and client-side visibility of reviewer moves (M5) is unchanged.

## 2. Files changed
- **New:**
  - `src/lib/review/orphans.ts`
  - `tests/m5-stabilization.test.ts`
  - `docs/audit/m5-stabilization-report.md`
- **Modified:**
  - `src/lib/workflow/findings.ts`: `submittedToTeam`, `teamFindingView`, `submittedWithRound`
  - `src/lib/data/submission-review.ts`: team boundary, `withdrawal`, `submittedWithRound`
  - `src/lib/review/access.ts`: evidence file boundary
  - `src/lib/workflow/commands.ts`: no evidence activity; resubmission summary
  - `src/app/dashboard/submissions/actions.ts`: readiness echo
  - `src/components/submissions/client-remediation.tsx`
  - `src/components/submissions/review-history.tsx`
  - `src/components/submissions/compare-rounds.tsx`
  - `prisma/blob-orphans.ts`
  - `tests/m5-remediation.test.ts`: one expectation, evidence now writes no activity

## 3. Automated checks
| Command | Result |
|---|---|
| `npm test` | **220/220 pass** (18 files; 15 new in `m5-stabilization.test.ts`) |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 problems |
| `npm run build` (placeholder DB URL) | Pass |

New tests cover:
- **Pure rules:** the boundary rule, the team finding view, round labels and orphan selection, including withdrawn-but-referenced files, files too new to count, and other prefixes.
- **Team during changes requested:** none of the draft response text, draft evidence, withdrawn draft evidence, new links or the Responded status reach the team. The client still sees all of it.
- **After resubmission:** submitted work becomes visible; withdrawn drafts never do.
- **Cross-client:** another client gets nothing.
- **Direct file URLs:** the team gets 404 for unsubmitted or withdrawn files and 200 once submitted. The owner can open their own; another client gets 404.
- **Activity:** withdrawal writes none; the resubmission summary counts only non-withdrawn work since the request.
- **B2:** the readiness value is echoed with errors.

**M3, M4 and M5 behaviour is intact:** all earlier tests pass unchanged except the one expectation above.

## 4. Latency investigation (no changes made)
- **Measured (read-only, from this machine in India):** opening a database connection with TLS takes **≈3.1 s**; each query round trip **≈340 ms** (median of 10 `SELECT 1`).
- **Likely cause:** every server action does about 10–15 *sequential* database round trips (authorization lookups, guarded transaction steps), then re-renders the page with another ~10–15. That's ~25 sequential round trips, plus a connection set-up when a function starts cold. At ~300 ms per round trip that's **6–9 s, matching the observed 6–12 s**. At the ~10–20 ms you'd expect between a US-East function and Render's Ohio database, the same work would take well under a second.
- **To confirm:** check the Preview's **function region** (Vercel → Project → Settings → Functions → Function Region, or the `x-vercel-id` response header). If it's `bom1` (Mumbai) or anything other than US-East, that's the main cause. I couldn't read it today because the browser's Vercel session had expired.
- **Recommended, safe improvements (need your approval):**
  1. **Infrastructure (largest gain):** run functions in the region nearest the database, `iad1` (Washington, D.C.) for Render Ohio, or move the database to the functions' region. This is a Vercel project setting; I haven't changed it.
  2. **Code, low risk:** run independent lookups in parallel inside commands and loaders, reuse the creative row loaded for authorization instead of re-querying, and keep connections warm. This reduces round trips but won't fix a cross-continent hop.

## 5. Remaining risks and limitations
- **Not browser-verified yet** (see §6).
- **Revised creative versions** uploaded while changes are requested are still visible to the team before resubmission: the version list, the file, and the "V3 uploaded as a revision" activity. Your decision covered responses and evidence; tell me if versions should follow the same rule. It would change M3 behaviour and the comparison view.
- Existing TEST S1 data: its withdrawn PNG is now hidden from the team (correct under the new rule). Its earlier "Evidence added" activity rows remain as written on 10 Oct.

## 6. Browser verification: approval needed
These checks write TEST data to the shared Render database:
- the fixes and the privacy boundary
- the 375 px response, evidence and resubmit forms
- the real 10 MB server limit, bypassing the browser check
- MP4 playback and seeking
- withdrawing a published finding

Two ways to run them:
- **A. On a new Preview.** You push the branch, sign in to Vercel in the browser pane, and sign in to each account when I ask.
- **B. Locally on `localhost`** with the same code, database and Blob store. I can sign in there myself with the demo accounts you gave me, because it's a local development server. Faster, but it doesn't exercise the Vercel build or the region latency. A short Preview pass could follow.

Either way I'd create one new TEST submission ("TEST M5S — …") in the TEST project, take it through two rounds, and upload a short TEST MP4 recorded in the browser. Nothing existing would be modified or deleted.
