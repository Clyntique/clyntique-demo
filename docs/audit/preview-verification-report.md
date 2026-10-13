# Vercel Preview verification — Stages A, C, D and E

Date: 12 Oct 2026 · Preview: `clyntique-demo-4wd0objph-clyntique.vercel.app` · Function region: `iad1`
Data: TEST records only (TEST M5S in project "TEST M3 — Alex (2026-10-10)"). No real client data, no Production changes, no schema changes, no deletes.

## Results

| # | Check | Account | Result |
|---|---|---|---|
| 1 | Build is the pushed one (Viewfinder favicon `/icon.svg`, new client workspace) | Alex | Pass |
| 2 | Server 10 MB evidence limit with the browser check bypassed (11 MB PUT with a valid upload token) | Alex | Pass: Blob refused with 403 ("cannot be greater than 10485760 bytes") |
| 3 | Add PDF evidence, link it to #1, respond to #2 | Alex | Pass; both shown as "Not yet submitted" |
| 4 | Upload MP4 as V2: type and signature checks, playback, seeking | Alex | Pass: plays, seeks, media route answers range requests with 206 |
| 5 | Resubmit with a note | Alex | Pass: R2 · V2, "With Clyntique"; activity "with 2 responses and 1 evidence item" |
| 6 | Team overview and review queue | Team | Pass: M5S under Needs review (R2), queue count 1 |
| 7 | Evidence file before / after resubmission | Team | Pass: 404 before, 200 (PDF) after |
| 8 | Compare V1 with V2 | Team | Pass: side by side, V2 plays |
| 9 | Findings, Evidence and History tabs after resubmission | Team | Pass: responses, evidence ("Submitted with round 2") and both rounds visible |
| 10 | Start review, resolve #1 with a note, withdraw published #2 with a reason | Team | Pass: 0 open; withdrawal reason kept in history |
| 11 | Team activity | Team | Pass |
| 12 | Another client cannot reach M5S: page, team URL, V1, V2, evidence, list | Jordan | Pass: "doesn't exist, or you don't have access"; team URL redirects; files 404; not listed; no M5S text in the HTML |

Privacy before resubmission (the team couldn't see unsubmitted responses, evidence, links, V2, private title or description edits, or the client's updated time) was verified in automated tests and on localhost in Stages A–E; on the Preview, items 7 and 9 confirm the switch happens at resubmission.

## Measured latency on the Preview (click to updated page, from India)

| Action | Time |
|---|---|
| Resubmit | ~4.9 s |
| Start review | ~4.1 s |
| Resolve finding | ~4.2 s |
| Withdraw finding | ~4.1 s |

The functions already run in `iad1`, close to the Ohio database, so these times come mainly from the number of sequential queries per action (about 25) plus page refresh. The function region was not changed.

## Found, not changed

- Wording: a withdrawn finding's status pill says "Dismissed" while the button and history say "Withdraw"/"Withdrawn".

## Still pending

| Item | Note |
|---|---|
| TEST M5S review | Left open (in review, 0 open findings). Complete it or leave it as demo data — your call. |
| TEST records | TEST M5S and earlier TEST submissions, evidence and files remain in the shared database and Blob store. |
| Migrations | `20261011090000_evidence_files` and `20261012190000_round_snapshot` are applied to the shared Render database the Preview uses. Both are additive. If Production uses the same database, it already has them. |
| Production deploy | Not done; needs your approval. |
| Latency | Optional follow-up: fewer sequential queries per action. |
| Credentials | Demo passwords shared in chat should be revoked as planned. None appear in this report. |
| Not started | AI integration and Compliance Passport, as instructed. |
