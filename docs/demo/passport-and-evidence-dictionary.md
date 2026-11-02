# Compliance Passport and Evidence Dictionary in the /demo sandbox

Prepared November 2, 2026 for the YC demo. This note separates what the product
already defines from what was invented for the public sandbox, so nobody
mistakes a demo behaviour for a confirmed requirement.

## 1. What existed before this change

### Compliance Passport (confirmed product definition)

- The CEO brief of October 19, 2026 lists the Compliance Passport as stage 9 of
  the 13-stage lifecycle. The October 19 audit (`docs/product-audit-oct19`,
  mirrored in the project files) defines it as **one record per creative:
  claims, rules and their versions, evidence, reviewer decisions, creative
  version, external submissions and outcomes, status, change history;
  downloadable and shareable.**
- The roadmap item P3 adds a status model (`ACTIVE`, `NEEDS_RE_REVIEW`,
  `SUPERSEDED`, `REVOKED`, `EXPIRED`), a snapshot per completed review cycle,
  PDF export and an expiring share link.
- The product already ships the **passport MVP for signed-in users**: the
  read-only, printable review record at `/admin/creatives/[id]/record` and
  `/dashboard/creatives/[id]/record` (`src/components/record/review-record.tsx`,
  October 19 sprint). It is derived from the same loaders as the workspace, so
  it cannot go stale, and it carries the disclaimer that an internal review is
  not legal, government or platform approval.

### Evidence Dictionary (no prior definition found)

- No specification, roadmap entry, research document or code mentions an
  "Evidence Dictionary". The repository, `docs/`, and every project file were
  searched on November 2, 2026.
- The product's evidence system is per creative: `Evidence` items (title, type,
  description, source, URL, date, optional file), origin (client or reviewer),
  visibility (shared or team-only), bound to a creative version and to findings,
  with withdrawal history. The October 19 audit lists **reuse of evidence across
  creatives, validity or expiry dates, and claims as records** as missing.

## 2. What the demo adds (demo-only, not a product requirement)

Everything below lives in the public `/demo` sandbox only: client-side state in
the browser tab, fictional data, no database, storage, AI or auth code
(`tests/yc-demo-auth-ux.test.ts` and `tests/demo-passport-evidence.test.ts`
enforce this). Production routes, accounts, the policy approval workflow and the
evidence tables are untouched.

### Compliance Passport (demo)

- **Derived, never stored.** `src/lib/demo/passport.ts` builds the passport on
  every view from the sandbox state for one creative and one version, in the
  same spirit as the product's review record.
- **Content:** creative name, version and copy; client and project; target
  platform and market; review status and outcome; findings on that version with
  their origin (AI-simulated suggestion accepted by a reviewer, or recorded by a
  reviewer); supporting evidence with the verification status of the dictionary
  record behind it; missing evidence (a finding asked for evidence and nothing
  was attached on that or a later version); policy references (cited by a
  finding, or checked by a simulated scan with no finding) and coverage
  limitations; simulated AI checks; reviewer decisions and history; a record
  code and the timestamp of the newest item it summarises.
- **Status:** `IN_PROGRESS` (review not complete), `ACTIVE` (review complete,
  current version), `SUPERSEDED` (older version). The roadmap's
  `NEEDS_RE_REVIEW`, `REVOKED` and `EXPIRED` need monitoring and rule-change
  events that the sandbox does not simulate, so they are not shown.
- **Export:** the browser's print dialog ("Print or save as PDF"), with the app
  chrome hidden. No share link, no signing, no server-side PDF.
- **Wording:** the passport never says "legally compliant", "government
  approved", "certified" or "platform approved"; a test checks the builder, the
  labels and the component for those phrases. The disclaimer is shown at the
  top and in the footer.

### Evidence Dictionary (demo)

- **Definition used:** a reusable substantiation record owned by one workspace
  (a client, or the team for internal references), with title, type (clinical
  study, certification or licence, regulatory document, claim substantiation,
  other), description, fictional source reference, the claim it supports, a
  verification status (`UNVERIFIED`, `UNDER_REVIEW`, `VERIFIED`,
  `NEEDS_MORE_INFO`), the reviewer's note, an optional validity date, and
  timestamps.
- **Interactions:** browse, search (title, claim, source, description), filter
  by type and status, open a record, see which creatives and versions use it,
  attach it to an open creative (from the record or from the creative's
  Evidence tab), add a new record, and (team only) record a verification
  decision that updates every creative citing the record and is written to
  their histories.
- **Isolation:** a client sees only its own records and usages; the team sees
  all. Attaching another client's record is refused in the reducer.
- **Link to the creative workflow:** every evidence attachment (manual
  "upload" or dictionary attach) is filed as a record, so the dictionary and the
  per-creative evidence list always agree. The passport reads the record's
  status to label evidence as checked or unverified.
- **Fictional data:** every seed record says so in its source line; none is a
  real study, licence or regulator document, and none links to a URL.

## 3. What a full product version would need (not built)

- A `Passport`/`PassportEntry` snapshot per completed review cycle, the full
  status model, server-side PDF, an expiring share link and an access log (P3).
- An evidence record entity with ownership, reuse across creatives, expiry,
  per-rule evidence requirements and claims as first-class records, with the
  same two-sided visibility rules the product enforces today.
- Monitoring and impact analysis to drive `NEEDS_RE_REVIEW`.
- Legal review of every label before customers see it.
