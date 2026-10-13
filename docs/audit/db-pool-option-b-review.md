# Option (b) review: Vercel `attachDatabasePool`

13 Oct 2026. Research only. Nothing installed, changed or deployed.

## Is it official and supported?

Yes, both Vercel and Prisma document it.

| Source | What it says |
|---|---|
| **Vercel `@vercel/functions` API reference** | `attachDatabasePool` "ensures that idle pool clients are properly released before functions suspend" on Fluid compute. Supports PostgreSQL (`pg`) among others. |
| **Prisma 7 "Deploy to Vercel" guide** | Shows the same setup for Prisma's driver adapter: create a `pg` `Pool`, call `attachDatabasePool(pool)`, then `new PrismaPg(pool)`. |
| **Vercel knowledge-base guides** | Say the helper "closes idle connections before an instance suspends". |

## Fit with our setup

| Item | Finding |
|---|---|
| Vercel | Fluid compute is **enabled** on the project (Settings → Functions). Hobby plan, 1 vCPU / 2 GB per instance. |
| Prisma | We already use `@prisma/adapter-pg` 7.10.0, which accepts an existing `pg.Pool`. It checks `instanceof pg.Pool`; the adapter and the app resolve the same `node_modules/pg` (8.23.1), so the check passes. The adapter still attaches its idle-error handler to an external pool. |
| Render PostgreSQL | Works at the driver level (`pg`), so it doesn't depend on the database host. Same `DATABASE_URL`, same database user, same TLS settings. No change on Render. |
| Node | The package needs Node ≥ 20; we run 24. |

## How it works (published source of `@vercel/functions` 3.9.9)

- Detects a `pg` pool and listens for its `release` event.
- After each release, it asks Vercel to keep the instance alive (`waitUntil`) for `idleTimeoutMillis + 100 ms`. That gives the pool time to close its idle connections itself before the instance is paused.
- Does **not** change pool settings.
- Does nothing locally or in tests: it only acts when `VERCEL_URL` and `VERCEL_REGION` are set.

## Does it solve our issue?

Yes, that is the specific problem it targets. Today a paused instance keeps its connections open until Vercel shuts it down; we saw them last about 6 minutes, and 64 of 97 were open after one person tested two Previews. With the helper, an instance's connections close about `idleTimeoutMillis` after its last database use. With our 60 s setting, that means within about 1 minute.

It does not cap connections while instances are busy. The per-instance `max` still does that.

## Dependencies, configuration and costs

- **Dependency:** one new package, `@vercel/functions`, pinned to **3.9.9** (released 22 Sep 2026). Its only dependency is `@vercel/oidc` 3.8.9; the project already has 3.8.10 through `@vercel/blob`. Free.
- **Code:** only `src/lib/prisma.ts`. Create a `pg.Pool` with the current settings, call `attachDatabasePool(pool)`, and pass the pool to `PrismaPg`. No schema, environment variable, Render or Vercel settings change.
- **Cost:** Fluid bills "Provisioned Memory" for as long as an instance has work in flight, and the helper's wait counts as work.
  - With a 60 s idle timeout, each instance stays alive up to 60 s after its last query. That's at most about 0.033 GB-hours per instance each time activity stops (2 GB × 1 minute). Continuous use costs about 2 GB-hours per instance-hour.
  - Hobby includes **360 GB-hours** a month. Usage for the last 30 days is **0.40 GB-hours**.
  - Even 50–100 hours of active clicking a month stays within the allowance. There is no extra charge on Hobby, but Hobby limits are hard limits, so watch Usage during heavy testing.
- **Idle timeout choice:** Vercel's guide suggests about 5 s to minimise alive time. I would **not** use 5 s for the demo. Our Preview measurements showed about a 2.5 s delay whenever a click comes after the pool has closed its connections. 60 s keeps clicks within a minute fast, at the small memory cost above.

## Effect on connections, permissions and deployment

- **Database permissions:** none. Same user, same database, no schema change.
- **Connections:** same pool behaviour while active. Idle connections are released about 60 s after last use instead of lingering while paused.
- **Deployment:** a normal Preview deploy. Nothing changes in Vercel settings; local development and tests behave as now.
- **Risk:** small. If the helper ever failed to recognise the pool, it throws "Unsupported database pool type" when the server module loads. A MariaDB adapter case was reported in the Vercel community; for `pg` the detection is explicit. The build and a Preview check would show it immediately.

## Recommendation

Adopt option (b), with the pool limit kept at 5 for this first step so only one thing changes at a time:

1. Add `@vercel/functions@3.9.9`.
2. In `src/lib/prisma.ts`, build the `pg.Pool` (max 5, idle 60 s, connect timeout 10 s, keep-alive), call `attachDatabasePool(pool)`, then use `new PrismaPg(pool)`.
3. Tests, TypeScript, lint and production build.
4. Preview checks after your push:
   - page timing, the same test as before;
   - logs show no errors;
   - connections fall to 0 within about 1–2 minutes of inactivity (previously about 6);
   - the Usage page after testing.
5. If connections clear as expected, we can consider raising the limit back to 10 to recover the 0.15–0.3 s on single page loads. That would be a separate, measured step.

If you'd rather not add a dependency, the safest alternative for the demo is to keep the limit at 5 as it is, and avoid having several Preview deployments in use against the shared database at the same time. Option (c), an external pooler such as PgBouncer, is a separate Render service with its own setup and cost; it isn't needed at demo scale.

## Sources

- https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool
- https://www.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-vercel
- https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute
- https://vercel.com/kb/guide/connection-pooling-with-functions
- https://vercel.com/docs/functions/usage-and-pricing
- Source of `@vercel/functions` 3.9.9 (`db-connections`), via unpkg
- Vercel community thread on MariaDB and `attachDatabasePool`: https://community.vercel.com/t/how-to-use-attachdatabasepool-with-prismajs-and-mariadb/37391

## Implementation (13 Oct, approved)

### Changed files

| File | Change |
|---|---|
| `package.json` | Adds `"@vercel/functions": "3.9.9"`, pinned exactly. |
| `package-lock.json` | Adds only `@vercel/functions` and its own nested packages (`@vercel/oidc` 3.8.9, `jose`, `zod`, `@vercel/cli-config`). No existing entry changed. |
| `src/lib/prisma.ts` | Builds a `pg` `Pool` with the same settings as before (max 5, idle 60 s, connect timeout 10 s, keep-alive), calls `attachDatabasePool(pool)`, and passes the pool to `new PrismaPg(pool)`. |

No schema, environment variable, database permission, Render or Vercel setting changed.

### Checks

- Tests 242/242, TypeScript 0 errors, lint 0 problems, production build passes.
- **Local mode** (read-only, the app's own `prisma.ts`):
  - the helper is a no-op: 0 `waitUntil` calls, 0 warnings;
  - pages load and connections close after the 60 s idle timeout (0 open after 65 s).
- **Simulated Vercel mode** (`VERCEL_URL`/`VERCEL_REGION` set, stand-in request context, read-only):
  - the pool is recognised, with no "Unsupported database pool type";
  - one keep-awake call per released connection (142);
  - the last wait ended **60.1 s after the last query**, which is the idle timeout plus 100 ms;
  - 0 connections open after 65 s, 0 warnings.
- **Local production server, signed in as TEAM:** overview, TEST M5S and the review queue load (200); the overview still shows "no open findings"; no server errors.

### Remaining risks

- **Memory:** each Vercel instance stays awake up to about 60 s after its last query. That is well within Hobby's 360 GB-hours (0.40 used in the last 30 days); check Usage after heavy testing.
- **Possible warning:** "Pool release event triggered outside of request scope" if a query ever runs outside a request on Vercel. The helper does nothing during builds. Watch the logs on the Preview.
- **npm install scripts:** npm skipped two install scripts locally that need approval: Prisma's preinstall check and `unrs-resolver`'s postinstall. Both were already installed and the build passes; Vercel runs its own install.
- **Undo path:** one package plus `src/lib/prisma.ts`. Reverting that file and removing the package restores the previous behaviour.

### Preview checks after push

1. **Page timing**, the same test as the previous Preview (`noc5my5qr`, limit 5 without the helper): warm, after a 15 s pause, 3 and 6 loads at once.
2. **Connections:** count `pg_stat_activity` right after testing, then again after a **90 s pause**. Expect them to fall close to 0 (previously about 6 minutes).
3. **Vercel logs:** no errors, timeouts or the warning above.
4. **Usage page:** provisioned memory after testing.

## Preview verification (13 Oct): `ohqix3qp7` (with `attachDatabasePool`) vs `noc5my5qr` (without)

Both use pool limit 5 and a 60 s idle timeout. Read-only checks; TEST M5S was not modified. Each Preview was tested separately so the connection counts don't mix.

**Pages** (`ohqix3qp7`, TEAM): overview (shows "no open findings"), TEST M5S (responses, "Withdrawn") and the review queue all load (200).

**TEAM submission page timing**, from India:

| | Warm, median | After a 15 s pause, median | 3 at once | 6 at once | First load |
|---|---|---|---|---|---|
| noc5my5qr (no helper) | 0.84 s | 0.98 s | 4.8 s | 2.2 s | 7.0 s (cold) |
| **ohqix3qp7 (helper)** | **0.76 s** | **0.81 s** | **2.7 s** | **2.0 s** | 0.76 s |

Every load was complete on both. The helper did not slow anything down; the new Preview was as fast or slightly faster.

**Database connections** (`pg_stat_activity`, read-only):

| When | Open connections |
|---|---|
| Before testing | 0 |
| ohqix3qp7, right after testing | 15 idle (includes 5 from an earlier noc5my5qr sign-in check) |
| **ohqix3qp7, after a 90 s pause** | **5**, all idle 358 s, i.e. noc5my5qr's. None of ohqix3qp7's own connections remained. |
| noc5my5qr, right after testing | 10 idle |
| **noc5my5qr, after a 90 s pause** | **15 still open**, idle 87–113 s. The count grew because a later request reused the pool, probably from the open noc5my5qr tab. |

The helper does what it promises: connections close about 60 s after last use instead of staying open while instances are paused.

**Vercel logs:** 0 warnings, 0 errors, 0 fatal entries. Statuses 200, 304 and POST 200 only. No connection timeouts and no "outside of request scope" or "Unsupported database pool type" messages.

**Vercel Usage** (Sep 13 – Oct 13): provisioned memory 0.51 GB-hours (0.40 before today's tests) of 360 included. Active CPU 4m 54s, invocations 4.5K. Nothing unexpected.

**Recommendation: keep this implementation as it is** (helper, limit 5, idle 60 s).
- A higher limit isn't needed for the demo; single-page loads are already at the earlier levels.
- If more speed is wanted later, a limit of 10 could be trialled separately with the same checks.
- Older Preview deployments without the helper (noc5my5qr, kz1k7vowe, 4wd0objph) still leave connections open while someone uses them; avoid using them now.
