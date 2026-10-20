# YC reviewer account, demo-password rotation and signed-in smoke test

Everything here runs on GT in PowerShell, in `D:\clyntique-demo\clyntique`, against the database in `.env`. **Nothing here runs without the CEO's approval for that step.** Never paste a password or connection string into chat, docs or a PR.

## 1. Create the YC client account (`npm run db:create-client`)

What the script guarantees (`prisma/create-client-account.ts`, rules in `prisma/client-account-plan.ts`, tests in `tests/client-account-plan.test.ts`):
- **Dry run by default.** It writes only with `--apply`, and only when `ACCOUNT_CONFIRM_DATABASE` equals the database in `DATABASE_URL` (`cyntique_demo` for Production).
- **Exactly one CLIENT account.** It is never TEAM and never a policy administrator, whatever the environment says. It checks this again after the write.
- **Never touches an existing user.** If the email exists (any role) it refuses, and the write is a plain create, so a race fails instead of overwriting.
- **Sign-up rules apply:** a name, a valid email that is not on a Clyntique domain, a password of 12–72 characters with letters and digits that doesn't contain the email name. Previously published demo passwords are refused.
- **Prints no secrets:** never the password, its hash or the connection string. Inputs come from environment variables only, so nothing reaches shell history.
- The new account sees nothing until the Team assigns it a project.

```powershell
git fetch origin feature/yc-client-account
git checkout feature/yc-client-account
npm ci
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue     # use .env
npm run db:target                                              # must show Database: cyntique_demo

$env:ACCOUNT_NAME  = "YC Reviewer"
$env:ACCOUNT_EMAIL = "<reviewer email you will give YC>"
$sec = Read-Host "YC reviewer password" -AsSecureString        # typed, not echoed
$env:ACCOUNT_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

npm run db:create-client                                       # DRY RUN, writes nothing
```

Expected dry-run output:

```
create-client: [dry run] create CLIENT <email> ("YC Reviewer") in database cyntique_demo; policy administrator: no
create-client: dry run only. Nothing was written. ...
```

**STOP:** send this output and wait for approval. Then:

```powershell
$env:ACCOUNT_CONFIRM_DATABASE = "cyntique_demo"
npm run db:create-client -- --apply
# expected: create-client: done: CLIENT account created (id c...). It sees nothing until the Team assigns it a project.

Remove-Item Env:ACCOUNT_PASSWORD, Env:ACCOUNT_CONFIRM_DATABASE, Env:ACCOUNT_EMAIL, Env:ACCOUNT_NAME
npm run db:inventory                                           # users by role: CLIENT +1, nothing else changed
```

**Stop conditions:** any `create-client:` error line, or exit code 1. Nothing was written in that case. "Already exists" means the email is taken: choose another email; never reuse or modify an existing account.

**Undo** (only if needed, with approval): the account has no data until a project is assigned. Remove it through a reviewed one-off statement, never by editing other rows.

## 2. Rotate the three demo-account passwords (existing `npm run db:seed`)

`prisma/seed.ts --apply --rotate` updates only `passwordHash`, and only for `team@`, `client@` and `client2@clyntique.demo`, each matched by email and unchanged role. It refuses previously published passwords. A disposable-database rehearsal is in §4.

```powershell
npm run db:target                                              # Database: cyntique_demo
npm run db:inventory                                           # note the counts
$t = Read-Host "New Team password" -AsSecureString
$c = Read-Host "New Client 1 password" -AsSecureString
$c2 = Read-Host "New Client 2 password" -AsSecureString
function Plain($s) { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
$env:SEED_TEAM_PASSWORD = Plain $t; $env:SEED_CLIENT_PASSWORD = Plain $c; $env:SEED_CLIENT2_PASSWORD = Plain $c2
npm run db:seed                                                # dry run: lists "skip ... already exists" for the 3 (expected)
# STOP: approval, then:
$env:SEED_CONFIRM_DATABASE = "cyntique_demo"
npm run db:seed -- --apply --rotate                            # expect 3 x "seed: done: rotate password for ..."
Remove-Item Env:SEED_TEAM_PASSWORD, Env:SEED_CLIENT_PASSWORD, Env:SEED_CLIENT2_PASSWORD, Env:SEED_CONFIRM_DATABASE
npm run db:inventory                                           # same counts as before
```

- If `SEED_CLIENT2_PASSWORD` is left unset, `client2@` is skipped and keeps its old password.
- `--rotate` has no dry-run form; the plain `npm run db:seed` is the dry run.
- Existing sign-ins stay valid until they expire (7 days). To sign everyone out at once, also replace the Production `SESSION_SECRET` and redeploy (a separate approval).
- Store the new passwords in a password manager, not in `.env`, chat or docs.

## 3. Signed-in Production smoke test (about 15 minutes)

Use https://clyntique-demo.vercel.app in a private window. Label everything you create `[YC DEMO]`. Write down PASS or FAIL per line; a FAIL in A, B or H means stop and report.

**A. Logins**
1. Sign in as the Team account and land on `/admin`. Sign out.
2. Sign in as a client account and land on `/dashboard`. Sign out.
3. After step 1 of §1: sign in as the YC client, land on `/dashboard`, see no projects yet.

**B. Existing data (Team)**
4. Projects shows the 4 existing projects. Submissions shows the existing creatives. Open one: its versions are listed and its image loads.

**C. Upload and private media**
5. As Team, create the project "[YC DEMO] …" for the YC client, then sign in as the YC client.
6. New submission "[YC DEMO] Spring hygiene reminder — Feed post" (Feed post, a market, a platform). Save the draft, then **Upload file** with a real image. Expected: progress reaches 100% and the preview shows the image.
7. Copy the image's address (right-click → open in new tab): it is `/api/media/...`. In a private window **signed out**, that address gives 401. Signed in as another client, it gives 404.

**D. Submission and review**
8. YC client: add evidence (a link) and **Submit for review**.
9. Team: the submission is in the Review queue. **Start review**, then **+ Add finding** (Revise content), then **Request changes** with a summary.
10. YC client: read the finding, **Respond**, upload V2, then **Resubmit**.
11. Team: open the submission; History and Compare show V1 and V2 and round 2. **Start review**, **Resolve** the finding, **Complete review** with "Issues resolved". The disclaimer reads "Internal human review only…".

**E. Reviewer chat**
12. YC client: **Chat with reviewer** and send a message. Team: the Messages badge appears; open the conversation and reply. Client: the reply arrives within about 30 s.

**F. Review record and external outcome**
13. Team: open **Review record**. The record code, both disclaimers and Print/PDF are present.
14. Record an external submission (Advertising platform), then an outcome. Labels say "Recorded manually…", with the basis shown.
15. Open re-review: cycle 2 appears, and cycle 1 is unchanged.

**G. AI scan history**
16. Team, on the submission: AI Compliance → **Run AI Scan**. Expect "Insufficient policy coverage — manual review required", and a new line in Scan history without reloading.

**H. Client isolation**
17. As the YC client, paste another client's submission address (copied from the Team view), its `/record` address and its `/api/media/...` address. Each must show not-found or 404, with no data.
18. As an existing client, the `[YC DEMO]` project and submission must not be visible, by list or by URL.

## 4. Disposable-database verification (done 2026-10-20, local PostgreSQL 16, database `yc_account_check`)

The database had all 7 migrations, the 3 demo accounts and the `[SAMPLE]` fixtures. Results:

| Case | Result |
|---|---|
| Dry run | plan printed, 0 users added, exit 0 |
| `--apply` without confirmation | refused, exit 1 |
| `--apply` with confirmation `cyntique_demo` against `yc_account_check` | refused ("does not match"), exit 1 |
| weak password / Clyntique domain | refused, exit 1 |
| existing TEAM email | refused; TEAM password hash unchanged |
| valid `--apply` | 1 CLIENT created, `isPolicyAdmin=false`; bcrypt hash matches the supplied password |
| repeat with the same email and another password | refused; stored hash still matches the first password |
| sign-in through the app (`next start`) | lands on `/dashboard`; sees no `[SAMPLE]` data; `/admin` and `/admin/policy-library` redirect to `/dashboard` |
| scan of all script output for the passwords, the DB password, `postgresql://` and bcrypt hashes | 0 matches |
| `db:seed --apply --rotate` | only the 3 demo users' hashes changed (role and policy-admin unchanged), the YC account untouched, project/creative/version/message counts identical |

Code checks on this branch: tsc clean, ESLint 0, Vitest 33 files / 411 tests (12 new), and a production build.
