# Signed-in Production smoke test (runs on GT)

Claude cannot sign in to Production from the cloud. The cloud has no Production passwords, by design. Its network also blocks `vercel.com`, which Blob uploads go through. So this test runs in a browser on GT, and the passwords are typed only there.

## One-time setup (PowerShell on GT)

Put the folder outside the repository, so nothing can be committed by accident.

```powershell
mkdir D:\clyntique-demo\prod-smoke
# copy prod-smoke.mjs and run-smoke.ps1 from this folder into D:\clyntique-demo\prod-smoke
cd D:\clyntique-demo\prod-smoke
npm init -y
npm install playwright@1.56.1
npx playwright install chromium
```

## Part 1: read-only (changes nothing)

```powershell
cd D:\clyntique-demo\prod-smoke
powershell -ExecutionPolicy Bypass -File .\run-smoke.ps1
```

- Press Enter to accept each demo email. Type each password at the hidden prompt.
- It takes about 3 minutes.
- Results go to `smoke-<time>\report.md`, `results.json` and `screenshots\`.
- Send `report.md` back in the thread.
- Exit codes: 0 means all PASS or BLOCKED, 1 means at least one FAIL, and 3 means a critical isolation failure stopped the run.

What it checks:
- **Public access:** public pages load, demo login is off, sign-up is closed, signed-in pages and the media/upload APIs refuse visitors.
- **Team:** sign-in; the 4 existing projects; existing submissions, their versions and images (private media returns 200); the AI tab carries no approval claim and its scan history says coverage is missing; the review record shows its disclaimer and Print/PDF; the inbox, policy library, impact page, review queue and activity page load; `/dashboard` is closed to the Team.
- **Each client:** sign-in; own projects and submissions; own images load; Team pages are closed.
- **Isolation (critical, the run stops on a failure):**
  - each client gets not-found or 404 for the other client's submissions, records and media;
  - the Team gets not-found for client drafts;
  - signed-out visitors get 401 for media.
- **Phone width (390px):** the client dashboard, submissions, messages and a submission page don't scroll sideways.

What part 1 never does: open existing chat threads (that marks messages as read), start reviews, run scans or upload anything.

## Part 2: lifecycle on approved test records (needs the CEO's approval)

```powershell
powershell -ExecutionPolicy Bypass -File .\run-smoke.ps1 -Fixtures
```

It asks you to type `CREATE SMOKE TEST RECORDS`, then runs part 1 again, then creates and uses only these records. Every title and note starts with `[SMOKE TEST <time>]`.

1. **Team:** one project, "[SMOKE TEST …] Production smoke project", assigned to Client 1.
2. **Client 1:** one submission in it ("Smoke reminder — Feed post"), with the industry set to Healthcare (Submit stays disabled without one) and the first market and platform ticked. V1 and V2 are generated 240×160 PNGs, uploaded to the Production Blob store. With `-Creative <file>` (PNG, JPEG or WebP under 4 MB), V1 is that labelled file instead, so the real Blob upload and the live AI scan run on it:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run-smoke.ps1 -Fixtures -Creative D:\clyntique-demo\test-assets\smoke\smoke-test-creative.png
   ```
3. One chat message from the client and one reply from the Team, on that submission.
4. One AI scan run. With 0 verified rules it must say "Insufficient policy coverage".
5. **Review loop:** 1 finding, changes requested, client response, 1 evidence link (example.com), resubmission, finding resolved, review completed as "Issues resolved".
6. **On the review record:**
   - one external submission (ad platform), with a note saying nothing was really submitted;
   - one outcome, "Team verified";
   - one re-review cycle.

Checks along the way:
- the draft is hidden from the Team;
- the new file returns 401 to visitors and 404 to Client 2;
- Client 2 sees none of it (submission, record, media, chat, project).

These records can't be deleted from the app. They stay labelled and visible to the Team and to Client 1. No existing project, submission or message is changed.

## Notes

- **Sign-in rate limit:** each run signs Client 1 in twice. Allow at most 2 runs per 15 minutes, or the third run's sign-ins are refused for 15 minutes.
- **Passwords:** they never appear on screen, in files, in the report or in screenshots. Password fields are masked, and the script deletes the passwords from its environment at start. Pages showing existing client data are screenshotted with the content area blacked out. No cookies, traces or videos are saved.
- **Rehearsal (2026-10-20):** rehearsed against a local copy of the app (no Blob store).
  - Read-only part: 23 PASS, 0 FAIL, 7 BLOCKED. Every BLOCKED was a missing image (the local copy has no Blob store) or part 2, which wasn't run.
  - Full run with stand-in uploads: 42 PASS, 0 FAIL; the only BLOCKED checks were image uploads and media, which need the real Blob store.
  - The isolation check was confirmed to flag a page that is visible when it shouldn't be.
  - No password appeared in any output.
