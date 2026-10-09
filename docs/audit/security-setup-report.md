# Security and account setup report: `cyntique_demo`

Date: 2026-10-09. Approved scope: rotate the demo passwords, create client2, enable login rate limiting locally.

Not done: no reset or migration, no Vercel changes, no deploy, no Git commands, no M3. No password was printed or saved in any report, source file or Git.

| # | Check | Result |
|---|---|---|
| 1 | Target | PASS. `cyntique_demo` on `dpg-db3sfh8m7kps73ft1vc0-a.ohio-postgres.render.com`, from `.env` |
| 2 | `.env.seed.local` ignored by Git | PASS. Matched by the `.gitignore` rule `.env*` (only `.env.example` is re-included). The file has the 6 expected keys; values were not read. Checked from `.gitignore` text, since Git commands aren't allowed |
| 3 | Seed dry run | PASS. Skip TEAM and CLIENT without `--rotate`; create client2. All new passwords passed the length check and the published-password block |
| 4 | Rotation and client2 | PASS. Passwords rotated for `team@` and `client@clyntique.demo`; `client2@clyntique.demo` (CLIENT, "Jordan Lee") created |
| 5 | New passwords work, old ones fail | PASS. `verify-demo-logins.ts` (same bcrypt check as the login page): all 3 new passwords accepted, both old published passwords rejected |
| 6 | Rate limiting | PASS. `check-rate-limit.ts` ran the real limiter against the database for a non-existent identity: attempts 1–5 allowed, attempt 6 blocked. It left 18 `LoginAttempt` rows (6 attempts × 3 hashed keys, no emails or IPs), which drop out of the 15-minute window |
| 7 | Data unchanged | PASS. Projects (2), creatives (2, still `LEGACY_CLIENT_APPROVAL`), activity (3), versions, evidence, comments and approvals (0) are identical to the backup field by field. The 2 original users are unchanged except their password hash and `updatedAt`; 1 user was added |
| 8 | `LOGIN_RATE_LIMIT="enabled"` | DONE. Appended to the local `.env`; existing values untouched |

## Still to do

1. **Manual browser check (you):**
   - `npm run dev`, then sign in as the team, client and client2 accounts.
   - Six wrong passwords in a row should show "Too many sign-in attempts…".
   - Client2 should see no projects.
2. **Delete the temporary password file** once your password manager holds the new passwords:
   ```powershell
   Remove-Item .env.seed.local
   ```
3. **Existing sessions:** cookies issued before the rotation stay valid for up to 7 days unless `SESSION_SECRET` is changed. That is optional, and it would sign everyone out.
4. **Vercel (later, needs your approval):** after the next deploy, set `LOGIN_RATE_LIMIT=enabled` there. Optionally set a new `SESSION_SECRET`.

New read-only helper scripts: `prisma/verify-demo-logins.ts` and `prisma/check-rate-limit.ts`. `check-rate-limit.ts` writes only hashed `LoginAttempt` rows for a fake identity.
