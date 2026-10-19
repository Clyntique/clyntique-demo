# Isolated Preview database and storage — exact setup steps (Oct 20)

For: the integrated branch `demo/integration-oct22-v2`. Goal: that branch's Vercel Preview uses its **own** Render database and its **own** Blob store. Production, the shared `cyntique_demo` database (host `dpg-db3sfh8m7kps73ft1vc0-a`), and every other Preview stay exactly as they are.

This revises the Oct 16 draft (`/mnt/project-files/clyntique/demo-workflow-completion/isolated-preview-setup.md`) for the new branch and the two new migrations.

How the isolation works: Vercel lets an environment variable be scoped to **Preview + one specific branch**. A branch-scoped value overrides the general Preview value for that branch only. Nothing is edited on Production or on the general Preview values. The Vercel build runs `prisma generate && next build` only: **no build ever runs a migration**. Migrations run from your terminal, against the URL you set in that terminal, and every write script refuses the shared database by name.

Never paste connection strings, tokens or passwords into the project chat. Where a step says "send me", only send the non-secret lines shown.

Stop points are marked **STOP**. Nothing before a stop point writes to any database.

---

## Step 1 — Render: create a new, separate database (dashboard, ~3 min)

1. Render dashboard → **New +** → **Postgres**.
2. Name: `clyntique-demo-preview`. Database: `clyntique_demo_preview`. User: leave the default. Region: **Ohio (US East)**, same as the existing database and next to Vercel's `iad1`. PostgreSQL version: 16 (the same major version as `cyntique_demo`).
3. Plan: **Free** is enough until Oct 22. Render allows one free Postgres per workspace and expires it after 30 days; if the Free option is greyed out, choose the smallest paid instance (Basic-256mb) and delete it after the demo.
4. Do **not** open, edit or restart the existing `cyntique_demo` database.
5. Wait for status **Available**. On the database page, under **Connections**, copy the **External Database URL** (it starts with `postgresql://` and contains `.ohio-postgres.render.com`). Vercel and GT are both outside Render, so the Internal URL will not work.

## Step 2 — Vercel: create a new, separate Blob store (dashboard, ~2 min)

1. Vercel → your team → **Storage** → **Create Database** → **Blob**. Name: `clyntique-demo-preview`. Access: **Private**.
2. When it asks to **connect the store to a project**, choose **Skip** or close the dialog. Connecting it would overwrite the project's existing `BLOB_READ_WRITE_TOKEN` for every environment.
3. Open the store → **.env.local** tab (or **Quickstart**) and copy the value of `BLOB_READ_WRITE_TOKEN` (starts with `vercel_blob_rw_`).

## Step 3 — Vercel: add branch-scoped Preview variables (dashboard, ~5 min)

Project `clyntique-demo` → **Settings** → **Environment Variables** → **Add New** (or **Create new**). For each row below:
- **Environments**: tick **Preview** only (untick Production and Development).
- Under Preview, choose **Select a custom Preview branch** (older UI: "Branch") and enter exactly `demo/integration-oct22-v2`.
- Save, and repeat for the next row.

| Key | Value |
|---|---|
| `DATABASE_URL` | External Database URL from Step 1 |
| `BLOB_READ_WRITE_TOKEN` | Token from Step 2 |
| `SESSION_SECRET` | A new random value. On GT: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `DEMO_LOGIN` | `enabled` |
| `CLIENT_SIGNUP` | `enabled` |

Inherited from the general Preview values, so not added: `GEMINI_API_KEY`, `LOGIN_RATE_LIMIT`, `RATE_LIMIT_SECRET`. Leave `POLICY_CANDIDATE_IMPORT` and `POLICY_DEFAULT_INDUSTRY` unset on this branch.

Check: the variables list should now show `DATABASE_URL` twice, once for Preview (all branches, the shared database) and once for Preview with the branch `demo/integration-oct22-v2`. Production's `DATABASE_URL` is untouched.

## Step 4 — STOP: confirm the target before any write (GT, ~2 min)

On GT, open a **new** PowerShell terminal in `D:\clyntique-demo\clyntique`, check out the integrated branch, and set the URL for that terminal only (it wins over `.env` and disappears when the terminal closes):

```powershell
git fetch origin demo/integration-oct22-v2
git checkout demo/integration-oct22-v2
npm ci
$env:DATABASE_URL = "<External Database URL from Step 1>"
npm run db:target
npx prisma migrate status
```

`db:target` prints host, port and database name only, never the password. **Send me those two outputs.** I will confirm:
- the host is **not** `dpg-db3sfh8m7kps73ft1vc0-a` and the database is `clyntique_demo_preview` (not `cyntique_demo`);
- `migrate status` shows **7 migrations found, 7 not yet applied** on an empty database (`0_init`, `submission_workflow`, `evidence_files`, `round_snapshot`, `compliance_policy_library`, `20261019180000_reviewer_chat`, `20261019190000_lifecycle_records`).

Only after my confirmation go to Step 5. If anything in the output names `cyntique_demo` or the old host, close the terminal and stop.

Alternative if you prefer that I run Steps 5a–5c from here: add the External Database URL as a secret named `PREVIEW_DATABASE_URL` in this Claude Code environment's settings (never in chat). I would still run `db:target` and send you its output for approval before `migrate deploy`.

## Step 5 — Migrations, demo accounts, sample data (same terminal)

```powershell
# 5a. Schema: all 7 migrations, in order (chat before lifecycle). Additive only; nothing to migrate from.
npx prisma migrate deploy
npx prisma migrate status        # expect: "Database schema is up to date!"

# 5b. Demo accounts with NEW passwords (not the ones used on the shared database).
#     Generate each with the node command from Step 3; keep them in your password manager.
$env:SEED_TEAM_PASSWORD    = "<new>"
$env:SEED_CLIENT_PASSWORD  = "<new>"
$env:SEED_CLIENT2_PASSWORD = "<new>"
$env:SEED_CONFIRM_DATABASE = "clyntique_demo_preview"
npx tsx prisma/seed.ts            # dry run: must list 3 accounts to create and write nothing
npx tsx prisma/seed.ts --apply

# 5c. [SAMPLE] projects, submissions and reviewer-chat conversations, with image uploads to the NEW store
$env:BLOB_READ_WRITE_TOKEN = "<token from Step 2>"
npm run db:demo-fixtures           # dry run
npm run db:demo-fixtures -- --apply
```

Safety built into these scripts: `seed.ts`, `demo-fixtures.ts` and `chat-check.ts` refuse the database name `cyntique_demo` and `NODE_ENV=production`, write nothing without `--apply`, and require `SEED_CONFIRM_DATABASE` to equal the target database name.

Policy rules: none are created, so every AI scan on this Preview says **"Insufficient policy coverage — manual review required"** and is recorded as such in the scan history. That is the honest state until rules are activated with verified sources by two administrators. `--synthetic-policy` would add one clearly labelled synthetic rule; leave it off unless you decide otherwise.

Close the terminal afterwards so the variables are gone.

## Step 6 — Redeploy the Preview and prove which database it uses

1. Vercel → **Deployments** → latest deployment of `demo/integration-oct22-v2` → **⋯** → **Redeploy** (environment variables apply only to new builds). Leave "Use existing Build Cache" ticked.
2. Open the Preview URL (`https://clyntique-demo-git-demo-integration-oct22-v2-clyntique.vercel.app`). The sign-in page should show the demo buttons and a "Create a client account" link.
3. Proof of isolation: Client 1 must see **"[SAMPLE] Northside Family Practice"** and Client 2 **"[SAMPLE] Lakeview Pediatrics"**. Those projects exist only in `clyntique_demo_preview`. If you see the TEST submissions from the shared database instead, the branch-scoped `DATABASE_URL` is not applied: stop and tell me.
4. Proof the new migrations are live: open any completed submission as Team → **Review record** chip → the record page shows content. Before the migration it shows "not available on this environment yet". Team → Policy Library → **Rule changes & impact** loads (empty is fine).

Then the browser pass of the full lifecycle and the reviewer chat checks (`SEED_CONFIRM_DATABASE=clyntique_demo_preview npm run db:chat-check`, run by the chat thread) can start.

## Turning it off after the demo

Delete the branch-scoped `DEMO_LOGIN` and `CLIENT_SIGNUP` variables and redeploy (demo sessions end at once). Delete the Render database and the Blob store when no longer needed. Nothing on Production changes at any point in this document.

## Notes
- If Vercel **Deployment Protection** is on, testers must be signed in to Vercel or use a shareable link to open the Preview.
- Vercel builds every pushed branch against the general Preview `DATABASE_URL` (the shared database). That is why the integrated code degrades gracefully when the new tables are missing; it is not a reason to migrate the shared database.
- Dashboard labels change; if a menu item is named differently, the intent of each step is what matters: a new database, a new store, five variables scoped to one branch, and a confirmed target before the first write.
