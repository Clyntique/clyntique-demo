# P0 policy research pack (drafts for human verification)

Prepared on October 27, 2026 for the P0 policy database. Scope (D9): healthcare and medical aesthetics, United States and United Arab Emirates, Meta (Facebook and Instagram), Google Ads and TikTok.

**Nothing in this pack is verified or approved.** Every rule is a draft, and every source is unverified. Until two different policy admins verify and approve a rule, the AI cannot use it and keeps reporting insufficient policy coverage.

## How this was researched, and its limits

- The research environment could not open the official pages because its network policy blocks them. Each summary was written in Clyntique's own words from search results that pointed to the official page. Where available, it was cross-checked against secondary summaries such as law firm alerts and industry guides. Secondary sources are never cited as the source of a rule.
- **No quotations and no dates are recorded.** The pack has no "last updated", publication or effective dates, because none could be confirmed on the official page. The admin who reads the page adds the dates the page itself states. Where a page states none, the field stays empty and the Library shows "Not stated by source".
- One source URL (FTC Health Products Compliance Guidance) did not come from the search results. It is marked to confirm.
- This is research for the Team, not legal advice. Before policy summaries are shown to clients (D8), counsel should review them, especially the US regulation rules and the UAE rules.

## What is in it

`policy-research-pack.json` holds 13 official sources and 12 draft rules. Each rule has its scope, structured content, citations by source key, open questions, and `researchStatus: "REQUIRES_REVIEW"`.

| Code | Platform or authority | Market | Industry | Category | What the draft says |
|---|---|---|---|---|---|
| RX-META-HW-01 | Meta | All | Healthcare | Targeting | Weight loss and cosmetic ads only for 18+ |
| RX-META-HW-02 | Meta | All | Healthcare | Before and after | No side-by-side weight loss images, pinched fat close-ups, or negative body image |
| RX-META-PA-01 | Meta | All | General | Personal health attributes | Don't assert or imply the viewer's health condition |
| RX-GOOG-HM-01 | Google Ads | All | Healthcare | Prescription medicine | Rx and online prescribing need Google certification; Rx terms restricted |
| RX-GOOG-PA-01 | Google Ads | All | General | Targeting | No advertiser-built audiences based on health |
| RX-TT-HC-01 | TikTok | All | Healthcare | Credentials and licensing | Clinics, pharmacies and OTC only where market rules are met (local approval, 18+) |
| RX-TT-WM-01 | TikTok | All | Healthcare | Efficacy claim | No exaggerated weight loss claims; 18+; healthy lifestyle framing |
| RX-TT-CS-01 | TikTok | US | Medical aesthetics | Restricted procedures | Cosmetic surgery ads allowed under conditions (sales rep, 18+, licensed, risks disclosed) |
| RX-US-FTC-EN-01 | FTC | US | General | Testimonial and endorsement | Honest endorsements, disclosed connections, typical results |
| RX-US-FTC-HP-01 | FTC | US | Healthcare | Substantiation | Health claims need competent and reliable scientific evidence |
| RX-AE-MOHAP-01 | MOHAP | UAE | Healthcare | Credentials and licensing | Health ads need MOHAP approval before publishing, including social media |
| RX-AE-MEDIA-01 | UAE Media Council | UAE | General | Credentials and licensing | Social media advertiser permit; health claims need health authority approval |

## UAE drafts flagged for review (October 28)

Both UAE regulation drafts carry a flag in their review note, so it shows in the Policy Library after import.

- **RX-AE-MOHAP-01 (health ad approval).** MOHAP's own service notice says approval of advertising, promotion and marketing of *medical products* moved to the **Emirates Drug Establishment (EDE)**, reportedly effective 29 December 2025. Before this draft is submitted, the Team should confirm three things: which body now approves which ads (medical products, healthcare services, facilities); whether MOHAP still approves service and facility ads; and whether emirate regulators (DHA in Dubai, DOH in Abu Dhabi) also apply. The citation may need to change to an EDE source.
- **RX-AE-MEDIA-01 (social media permit).** The cited National Media Council guide predates the **UAE Media Council**'s Advertiser Permit, reported as launched on 30 July 2025, and its Advertiser Permit Guide 2025. Replace the citation with the current Media Council source, and confirm who needs the permit (the clinic, its agency or each influencer) and how it relates to health authority approval.

These points come from search results (MOHAP's notice page and news reports), not from reading the regulations, and need legal confirmation.

## Open questions for the Team

1. Meta allows before-and-after images for cosmetic procedures (not weight loss) to adult audiences, according to some guides, while others disagree. Read Meta's health and wellness page and its cosmetic procedures page before drafting a rule.
2. TikTok's UAE requirements are in the regional handbook (Middle East, Turkey, Africa and Pakistan). No rule was drafted from it because the search did not show the UAE row.
3. Which health regulator licenses each pilot clinic? MOHAP, DHA (Dubai) and DOH (Abu Dhabi) each have their own advertising approval.
4. Is the UAE Media Council advertising guide still current? The cited guide is from the former National Media Council.
5. Should the FTC rule on fake reviews and testimonials (16 CFR Part 465) be added as a separate source?
6. Google's country rows for the US and the UAE, and whether prescription-only aesthetic injectables are covered.

## Verifying a draft (at least two people)

1. **Sources tab:** a policy admin opens each source link, confirms it is the publisher's own current page, fills in the publication date only if the page states one, and marks it verified.
2. **Rule (author):** the author edits the draft against the page. They correct the wording, add the date the page shows as "last updated" and the date they read it, add a short quotation (at most 300 characters) if useful, then submit it for verification.
3. **Verifier (any policy admin, the author included):** checks the draft against the source, then marks it verified or returns it for changes.
4. **Approver (a different policy admin, neither the author nor the verifier):** approves and activates it. Only then can the AI use it, and only for matching market, platform and industry.

## Importing the drafts

`prisma/policy-research-import.ts` (`npm run db:policy-research-import`) creates the pack's sources as UNVERIFIED and its rules as DRAFT / UNVERIFIED. It runs as a dry run unless `--apply` is passed with `IMPORT_CONFIRM_DATABASE=<database name>`.

- It always refuses the Production database. It refuses the Preview database unless `--preview-approved` is passed, which needs explicit approval first.
- It needs `--author <email>` of a TEAM policy admin in that database.
- It only adds sources whose URL isn't stored yet and rules whose code isn't stored yet. Existing records are never changed, and re-running it is safe.

The import was tested only on a disposable local database: 13 sources and 12 drafts were created, a re-run added nothing, and the Production and Preview database names were refused. It has not been run on Preview or Production.

## Sources consulted for orientation (secondary, not cited in rules)

Law firm summaries of the FTC Health Products Compliance Guidance (Covington, Jones Day, McDermott) and of the 2023 Endorsement Guides. The CMS expert guide on UAE medicines advertising. UAE news reports on Media Council enforcement (The National, Khaleej Times, Gulf News). Industry guides on Meta and TikTok health ads. These were used only to know what to look for on the official pages.
