# M0 — Operator steps (not executed by Claude)

These steps touch the shared Render database or hosting. **None of them has been run.** Each one needs the operator's explicit decision. No step prints a password or connection string.

## Why

The demo accounts `team@clyntique.demo` and `client@clyntique.demo` exist in the shared Render database. Their passwords were published in earlier versions of `README.md` and `prisma/seed.ts`, and they work (audit finding S1). M0 removed the published passwords from the code and docs. **The live accounts still accept the old passwords until the steps below are done.** Treat any deployment that uses this database as exposed until then.

The old passwords also remain in earlier Git history. Rewriting history is your decision; rotating the passwords makes that history harmless.

## Steps, in order

1. **Back up the database.** In the Render dashboard, take a manual backup or snapshot of the PostgreSQL instance, and record its time. Do this before any write, including step 3.
2. **Pick new passwords.** At least 12 characters, not used anywhere else, and stored in a password manager. Example generator (prints to your own terminal only):
   ```bash
   node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
   ```
3. **Dry run (writes nothing).** In `D:\clyntique-demo\clyntique`, set the variables in the shell for this one session only. Don't put them in `.env` if you share that file.
   - `SEED_TEAM_PASSWORD`, `SEED_CLIENT_PASSWORD`
   - optionally `SEED_CLIENT2_PASSWORD` (creates the fictional second client `client2@clyntique.demo` for cross-client checks)

   ```bash
   npx tsx prisma/seed.ts --rotate
   ```
   This is expected to **fail**, because `--rotate` without `--apply` is refused. That is a harmless check that the guard works. Then:
   ```bash
   npx tsx prisma/seed.ts
   ```
   This lists the planned steps: `skip` (unchanged) or `create` for each demo email.
4. **Rotate (writes).** Set `SEED_CONFIRM_DATABASE` to the database name that appears at the end of your `DATABASE_URL`. You can see it in the Render dashboard; don't paste the URL anywhere. Then run:
   ```bash
   npx tsx prisma/seed.ts --apply --rotate
   ```
   This updates **only** the password hashes of the listed demo emails whose role matches. It creates `client2@clyntique.demo` only if `SEED_CLIENT2_PASSWORD` is set. It never touches other users, projects, creatives or history.
5. **Verify.** Sign in with each new password. Confirm the old passwords now fail with "Invalid email or password."
6. **Clear the variables** from the shell, and close it.
7. **Sessions.** Existing sign-in cookies stay valid for up to 7 days, because sessions are stateless JWTs (audit S4). To end them all at once, set a new `SESSION_SECRET` (≥ 32 characters) wherever the app runs. Everyone will have to sign in again.
8. **Hosting check.** If a Vercel (or other) deployment uses this database, confirm it now has rotated credentials and the new `SESSION_SECRET`. If the deployment is public, consider restricting access until the pilot is ready.

## Not part of M0 (needs later approval)

- A separate development database, so testing doesn't touch shared data (plan decision A4).
- Login rate limiting. This needs the `LoginAttempt` table (M1 migration, then M2).
- Live verification of the security headers in a running build. I prepared and unit-tested them. Starting the app locally connects it to the shared database, so I didn't run it.
