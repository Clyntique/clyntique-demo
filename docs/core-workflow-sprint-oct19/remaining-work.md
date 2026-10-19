# Remaining work after the Oct 19 sprint

Ordered by what the Oct 22 demo needs first. "Decision" marks items that need the CEO's word before anyone codes.

## Must happen before the demo (Oct 20–21)
1. **Decision: apply the lifecycle migration to the shared `cyntique_demo` database.** Without it, none of today's features works on Preview or Production (the tables do not exist). It is additive (see `database-changes.md`); still, it is the shared DB and the brief says ask first. Suggested order: reviewer chat migration, then this one, in one approved window on Oct 20.
2. **Browser pass on Preview** of: Team AI panel scan history; `/record` pages for both roles (including print preview); external submission + outcome forms as client and as team; re-review from the record; Policy Library → "Rule changes & impact" (propose + approve a v2 of a demo rule with a second admin, confirm the impacted list and "Open re-review").
3. **Demo data**: at least one submission reviewed to completion, one external submission with an outcome, one rule with a superseded version that a finding or scan cited. Must be created through the UI or a fixture that the CEO approves; no seed was written today.
4. **Disclaimer wording sign-off** (`RECORD_DISCLAIMER`, `EXTERNAL_DISCLAIMER` in `src/lib/workflow/labels.ts`).
5. **Merge order and conflict resolution** with the reviewer chat and PR #1/#2 (see `oct20-21-integration-plan.md`).

## Not built today (by priority in the brief)
- **Client AI pre-check (P6).** Decision needed: what a client may see of an automated check before a human reviewer has looked. Options: (a) only "a check ran, N approved rules, status" (already what the record shows); (b) also the detected claims; (c) full suggestions with a heavy "not a review" banner. The service and persistence are ready; it needs a client-side action with its own authorization (`RUN_PRECHECK`) and a visibility policy. Half a day once decided.
- **Team overview of external outcomes** (list of submissions awaiting an outcome / rejected). Loader-only work plus a small page; half a day.
- **Monitoring (stage 10)**: scheduled checks (evidence expiry, rule `effectiveTo`, external outcome older than N days) and in-app flags. Needs a job runner (Vercel cron) and a decision on what to flag. 1–2 days.
- **Landing page / website review** (URL creatives): not started; a creative format decision first.
- **Carry-forward helper for re-review**: a reviewer can re-record a finding from cycle N into cycle N+1 with one click (explicitly, never silently). Half a day.
- **PDF export server-side / shareable record link**: browser print is the MVP. A signed, expiring share link would need its own access path outside `creativeScope`.
- **Rule event backfill**: events exist from this branch onward; earlier rule creations have no event row. Optional one-off script.
- **Source metadata**: "last verified" exists (`PolicySource.lastAuditedAt`); a UI to re-verify a source and the resulting event (`SOURCE_VERIFIED`) is not written.

## Known limitations of what was built
- External records require a closed review cycle; a client cannot report "I submitted this to Meta" for a submission Clyntique never reviewed. Intentional.
- `recordExternalSubmission` accepts only a version that appeared in a submitted round. If a client sends an unreviewed revision externally, they must note it in the text field.
- Re-review always starts on the latest version. If the client should upload a new version first, the reviewer should request changes in the new cycle rather than reopening twice.
- The impact page lists every superseded version's submissions, not only those since the last visit; with many rule changes it will need filters.
- Client names on the record for TEAM use the stored `User.name`; a client sees reviewers as "Clyntique reviewer" as elsewhere.
- Scan history keeps the validated suggestions as JSON; it is not queryable per finding. Fine for history, not for analytics.

## Edits that touch files the reviewer chat also edits (merge hotspots)
- `src/components/submissions/submission-view.tsx`: +1 import (`getScanHistory`), the `Promise.all` that loads targeting/review now also loads scan history for TEAM, two props on `AICompliancePanel` (`history`, `recordHref`), and a "Review record" link chip in the header. The chat adds a Messages tab in the tabs list; the hunks do not overlap but are in the same file.
- `tests/migrations.test.ts`: both add a folder to the ordered list (chat `20261019180000_reviewer_chat`, sprint `20261019190000_lifecycle_records`). Resolution: keep both, chat first.
- `prisma/schema.prisma`: both add models and relation fields on `User`. Resolution: keep both; regenerate the client.
- `tests/helpers.ts`: sprint adds five mock models; the chat may add `conversation`/`message`. Keep both.

## Open CEO decisions carried over from the Oct 19 audit
The seven questions in the audit thread are still open; the ones that affect today's code are: whether the Oct 22 demo shows external outcomes as "reported" data entered by the client (today's build) or only by the team; whether a client may run an AI pre-check; and whether the rule library is activated with verified sources before the demo (the impact page is empty until one rule is superseded).
