# Policy change monitoring: architecture (design only, October 31, 2026)

**Status: proposal.** Nothing here is built or scheduled, and nothing touches Production. It builds on what already exists:
- `PolicySource`, with `verificationStatus` and `lastAuditedAt`;
- versioned `PolicyRuleVersion`, with two-person verify / approve;
- `PolicyRuleEvent`;
- the impact page `/admin/policy-library/impact`.

## Principle

A detected change never changes a rule. It only opens a review task. Rules change only through the existing human workflow: one admin edits and verifies the new version, and a **different** admin approves it. Approved versions stay in history, and past AI scans keep pointing at the version they used.

## Flow

```
Official source (PolicySource.officialUrl)
  └─▶ 1. Fetch      on demand from an admin button first; scheduling is a later decision
        └─▶ 2. Snapshot  normalized text + SHA-256, stored per source (new table)
              └─▶ 3. Compare   hash differs from the last snapshot → diff of changed sections
                    └─▶ 4. Flag      PolicySource → REQUIRES_REVIEW; event SOURCE_CHANGE_DETECTED
                          └─▶ 5. Impact   rules citing the source + creatives scanned against them
                                └─▶ 6. Human review  admin A drafts/edits the new rule version and verifies it
                                      └─▶ 7. Approval  a different admin B approves; old version retired, kept in history
                                            └─▶ 8. Re-review  affected submissions listed (existing re-review cycle)
```

## Components

| # | Component | Notes |
|---|---|---|
| 1 | **Fetcher** | Plain HTTP for static pages and PDFs. A headless browser only for JavaScript-rendered pages (Meta, TikTok). It fetches only the source's registered official URL, on official domains (`OFFICIAL_DOMAINS`). Each attempt records the result: HTTP status, final URL after redirects, unreachable, or bot-blocked. |
| 2 | **Normalizer** | Drops navigation and cookie banners, collapses whitespace, and keeps headings with the text under them. For Google pages it opens collapsed sections and reads each country row separately. |
| 3 | **Snapshot store** | New table `PolicySourceSnapshot`: `sourceId`, `fetchedAt`, `httpStatus`, `finalUrl`, `contentHash`, `normalizedText` (or a private Blob key for large text), `stateDate` (a date the page itself states, if any). It is append-only. |
| 4 | **Change detector** | Compares the hash to the last good snapshot. If it changed, it produces a section-level diff. These count as changes: a redirect to a different page, a 404, and a newly stated date. Unreachable or bot-blocked results are recorded as **fetch failures**, not changes. |
| 5 | **Flagging** | Sets the source's `verificationStatus` to `REQUIRES_REVIEW` and appends a `PolicyRuleEvent` of a new kind `SOURCE_CHANGE_DETECTED`, linking the snapshot and the diff. It never edits rule text. |
| 6 | **Impact** | Reuses `policy-impact.ts`: which approved rules cite the source, and which creatives were scanned against those versions. |
| 7 | **Review queue** | A Policy Library tab, "Sources with changes", showing the old and new text side by side. The admin either confirms "no rule change needed" (re-verifies the source, closes the event) or opens a new rule version. The existing two-person workflow then applies. |
| 8 | **History** | Snapshots and events are never deleted. Every rule version keeps its sources, its verifier and its approver, as today. |

## Guardrails

- AI scans use only `APPROVED` versions whose sources are `VERIFIED`. A source flagged `REQUIRES_REVIEW` keeps its current approved rules in force, but the Policy Library shows a warning until an admin resolves it.
- **No automated approval at any step.** The model may *summarize* a diff for the admin, labelled "machine summary", but never edits or approves a rule.
- Regional reach: TikTok can't be reached from India. The fetcher runs from a server region where all sources resolve (for example Vercel `iad1`). A source that fails 3 times in a row is shown as "unreachable", and is never treated as unchanged.
- Polite fetching: at most one request per source per run, an honest user agent, and no attempt to bypass bot blocks. A blocked source falls back to a manual check.

## Delivery steps (each needs approval)

1. Schema migration: the `PolicySourceSnapshot` table and the event kind `SOURCE_CHANGE_DETECTED` (additive).
2. On-demand "Check source now" button for admins, plus the review tab. Test against local and Preview data.
3. Optional later: a scheduled run (Vercel Cron, daily). **Not part of this proposal.**

## Known source issues to seed the first run (from the Oct 30 check)

- **Meta cosmetic-procedures URL:** redirects to Health and Wellness.
- **u.ae NMC ad guide:** 404.
- **MOHAP PDF:** unreachable (connection reset).
- **FTC health-products guidance:** 403/404 from GT.
- **TikTok pages:** unreachable from India.
- **Google healthcare page:** its country rows depend on the viewer's location.
