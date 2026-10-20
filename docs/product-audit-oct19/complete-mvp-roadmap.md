# Complete Clyntique MVP roadmap (Roadmap B)

Starting point: `demo/integration-oct22` @ `a0c90d2` plus PR #1 (`7287d60`) and reviewer chat (`5c2f72d`, local). This plan covers the full original workflow. It is **not** the October 22 plan (see `oct22-demo-readiness.md`), and finishing it gives a pilot-ready MVP, not a certified compliance platform: every outcome stays an internal human review, never legal advice or government/platform approval.

Complexity: **S** a few days, **M** about 1–2 weeks, **L** 3+ weeks, for one developer with Claude.

## Dependency map

```
P0 Foundations ─┬─> P1 Living Rulebook v1 ─┬─> P2 Scan history & Claims ─┬─> P3 Compliance Passport ─┬─> P5 Monitoring & Impact ─> P6 Re-review cycles
                │                          │                             │                           │
                │                          └────────────────────────────>┘   P4 External submission ─┘
                └─> P7 Landing-page review (needs P2)        P8 Collaboration & routing (chat, assignment, notifications) runs alongside from P0
```

Key dependency: **impact analysis is impossible until each review stores which rule versions it was checked against** (P2). Build that first, even before the passport UI.

## P0. Foundations (S–M, do first, after the demo)

- Separate databases for Production, Preview and local; never share again. Backups before every migration.
- Merge discipline: PR #1, reviewer chat, hero; CI running lint, typecheck, tests on every PR; Vercel Deployment Protection on Preview (F10).
- Remove hard-coded policy-admin emails (F4); grant via `db:grant-policy-admin`; at least two real policy admins.
- Session revocation (F8), password reset, email verification.
- Industry (and specialty) per client or project, replacing `POLICY_DEFAULT_INDUSTRY`.
- Event model (`DomainEvent` or `Notification`) that later phases publish to.

## P1. Living Policy Rulebook v1 (M)

- Learn the pilot doctors' specialties, jurisdictions, licensing bodies and platforms (open CEO decision). Without them, rule selection stays provisional.
- Verify the provisional five rules against official sources by a person; record who verified what and when; activate with maker-checker.
- Source records: `lastCheckedAt`, `checkedBy`, content hash of the official page or document.
- Rule-change workflow: propose → verify → approve → effective date; superseding a version emits a `RULE_VERSION_CHANGED` event.
- Coverage view: which market × platform × industry combinations have verified rules (drives honest AI abstention).

## P2. Scan history, claims and AI pre-check (M–L)

- `AIScanRun`: version scanned, model, prompt version, rule versions checked, result status, timestamps, who ran it. Kept forever.
- `Claim`: text, location (frame/region), source (AI or reviewer), status; linked to evidence (`ClaimEvidence`) and to rule versions.
- Scan reads attached evidence summaries; video frames analysed (sampled).
- Client pre-check: client can run the AI on their own draft (their data, not shown to Team) to improve before submitting. Same grounding and abstention rules.
- AI-suggested rewrites for the client (IMPROVE stage), always labelled as suggestions.

## P3. Compliance Passport (M)

- `Passport` per creative; `PassportEntry` snapshot per completed review cycle: version + file hash, markets, platforms, industry, claims, evidence, rule versions checked, findings, decision, reviewer, disclaimer.
- Status: `ACTIVE`, `NEEDS_RE_REVIEW`, `SUPERSEDED`, `REVOKED`, `EXPIRED`, each change with reason and actor.
- PDF export; expiring read-only share link; access log.
- Starts from the S1 read-only record page if that is built for the demo.

## P4. External submission and outcomes (S–M)

- `ExternalSubmission` (destination type platform/regulator, destination name, account, date, reference, status) and `ExternalOutcome` (approved, rejected, changes requested, date, document, recorded by, checked by Team yes/no).
- Manual entry only; clear "reported by client" vs "checked by Team" labels. No integrations, no implied submission on the client's behalf.
- A rejection can open a new review cycle (P6).

## P5. Monitoring and impact analysis (M–L)

- Scheduled source checks (Vercel Cron): fetch official pages where allowed, compare hash, open a "source changed" task for a policy admin. Human verification before any rule changes.
- On `RULE_VERSION_CHANGED`: query passports whose last entry checked the old version, or whose markets/platforms/industry match a new rule; show an impact list to the policy admin before flagging.
- Flag selected passports `NEEDS_RE_REVIEW`; notify the client and assigned reviewer (in-app, then email).

## P6. Re-check and re-review cycles (M)

- Command to open review cycle N+1 on a completed submission (reasons: rule change, external rejection, client change, expiry). Schema already supports `ReviewCycle.number` and `openedReason`.
- Re-run AI against current rules; reviewer re-decides; passport gets a new entry; old entry kept.

## P7. Landing-page and website claim review (M)

- Destination URL field on submissions (S, can come early).
- Page capture (screenshot + text) at submission time, stored as a version-like artifact.
- Claims extracted and reviewed like creative claims; findings can point at the page.

## P8. Collaboration and routing (runs in parallel)

- Integrate Chat with Reviewer (already built), then reviewer assignment for chat and review, workload view, email notifications.

## Recommended order and rough timeline

| Order | Phase | Complexity | Rough duration | Notes |
|---|---|---|---|---|
| 1 | P0 Foundations | S–M | 1 week | Unblocks everything; includes merges |
| 2 | P1 Rulebook v1 | M | 1–2 weeks | Needs the doctors' details |
| 3 | P2 Scan history & claims | M–L | 2 weeks | Client pre-check can slip to later |
| 4 | P4 External submission | S–M | 1 week | Can run in parallel with P2 |
| 5 | P3 Passport | M | 1–2 weeks | |
| 6 | P5 Monitoring & impact | M–L | 2 weeks | |
| 7 | P6 Re-review | M | 1 week | |
| 8 | P7 Landing pages | M | 1–2 weeks | URL field can ship in P0 |
| — | P8 Collaboration | S–M | ongoing | |

Total: roughly 10–14 weeks to cover the whole original workflow at pilot quality, assuming decisions arrive on time.

## Risks

- **Policy content, not code, is the long pole.** Without verified rules for the pilot's real jurisdictions, AI abstains and impact analysis has nothing to work on.
- **Legal framing.** Every screen and export must keep "internal review, not approval" wording.
- **Shared database habit.** Any new table on a shared Production/Preview database risks Production.
