# Action latency: findings and plan (for approval)

13 Oct 2026. Investigation only: no code, configuration, region or schema changed.

## Where the 4–5 s goes

Measured on the Preview from India, click to updated page: resubmit ~4.9 s; start review, resolve and withdraw ~4.1–4.2 s.

| Part | Estimate | Basis |
|---|---|---|
| Browser (India) ↔ Vercel iad1, one request | 0.3–2.4 s, often ~0.6–1.2 s | The sign-in page, which makes no database calls, took 320–2363 ms over 6 fetches |
| Database work: sequential round trips | ~0.3–0.5 s | 12–20 round trips at ~15–25 ms (iad1 ↔ Render Ohio) |
| New database connections (TLS + auth) | ~0.5–2 s when the pool is cold | No pool settings: idle connections close after 10 s, so most demo clicks start cold; a parallel load can open several at once |
| Function cold start / render | ~0.3–1 s | Not yet measured |

The pieces are estimates until step 0 measures them. Query count alone doesn't explain 4–5 s; connection setup and the distance from India very likely do most of it.

Round trips per action (action + page refresh): resubmit ~20, start review ~12, resolve ~15, withdraw ~13.

## Plan, ranked by impact and risk

| # | Change | Expected saving | Risk | Notes |
|---|---|---|---|---|
| 0 | **Measure**: temporary server timing logs (connection wait, each query, total) on the Preview | none (tells us which of 1–4 matter) | None | Logs on the Preview only, no data; removed afterwards |
| 1 | **Keep database connections warm**: set pool options in `src/lib/prisma.ts` (longer idle timeout, a connect timeout so a dead connection fails fast instead of hanging) | 0.5–1.5 s on most clicks | Low | Config only; no schema; same database |
| 2 | **Skip the legacy loader for new submissions**: check the workflow first, so the page refresh doesn't fetch legacy comments and approvals it throws away | 2–3 round trips (~0.1 s, plus less connection pressure) | Low | Legacy records keep the same page |
| 3 | **Load each submission once per request**: share the creative lookup between the three loaders that each fetch it | 1–2 round trips | Low | Same privacy filters, applied once |
| 4 | **Shorter write transactions**: do read-only checks before the transaction and send the writes together | resubmit ~8 → ~3 round trips; others ~4 → ~2 | Medium | Same rules and audit entries; covered by the existing tests |
| 5 | **Run independent pre-checks in parallel** (readiness with round lookup; finding + creative in one query) | 2–4 round trips | Low–medium | |
| 6 | Show the result immediately in the button area (pending state already exists; optional optimistic status) | Feels instant; real time unchanged | Low | UI only |
| — | Later, needs your decision: a connection pooler, moving the function region next to the database, or page caching (`use cache`) | Up to ~1 s more | Higher | Region left as is, per your instruction |

Expected result for 1–5 together: roughly 1.5–2.5 s off each action, i.e. ~2–3 s from India and lower for users in the US. The India ↔ US distance (~0.6–1 s) stays unless the app or a pooler moves.

## Proposed order

1. Step 0 on the Preview (needs your push of the logging change), then send you the measured breakdown.
2. Steps 1–3 (low risk) together; re-measure.
3. Steps 4–5 only if still needed; re-measure.

No schema changes in any step. Awaiting your approval before implementing anything.
