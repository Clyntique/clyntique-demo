# Tier 2 Healthcare Advertising Policy Review Package
**Prepared for:** Deepanshi Singh (Independent Approver) and Yash Sharma (Co-Founder / Reviewer)  
**Date:** November 1, 2026  
**Scope:** Healthcare, Medical Aesthetics, Prescription Medicine, Telemedicine, Digital Health  
**Platforms & Jurisdictions:** Meta (Facebook & Instagram), Google Ads, TikTok, US Federal Trade Commission (FTC), UAE (MOHAP/EDE)  
**Target Database:** Clyntique Production (`cyntique_demo` on Render)  
**Working Feature Branch:** `feature/healthcare-policy-expansion`

---

## 1. Executive Disclaimers & Governance Controls

> [!IMPORTANT]
> **RESEARCH DRAFTS ONLY — STRICTLY UNVERIFIED / INACTIVE**  
> All 8 policy rules and 7 official sources documented herein are research drafts created for human verification. None of these rules are approved, verified, or active. The Clyntique AI Compliance Engine will **NOT** evaluate creatives against these rules, and will continue to report *"Insufficient policy coverage — manual review required"* until the independent two-admin verification and approval workflow is completed.

> [!NOTE]
> **COMPLIANCE & LEGAL NOTICE**  
> This package represents structured regulatory intelligence and platform policy translation developed from official documentation. It does **not** constitute formal legal counsel. Prior to external client enforcement, advertiser-facing remediation guidance should be validated against platform enforcement precedents and local legal requirements.

### Dual-Admin Verification Architecture
In accordance with Clyntique's strict compliance governance model (Decision D9), policy activation requires segregation of duties between two distinct authenticated TEAM Policy Admins:
1. **Admin A (Author & Verifier):** `team@clyntique.demo`  
   - Inspects the live official documentation directly at the designated URL.  
   - Confirms official domain authenticity, section references, and effective dates.  
   - Marks the `PolicySource` as `VERIFIED` and the `PolicyRuleVersion` as `VERIFIED`.
2. **Admin B (Independent Approver):** `deepanshisingh1995@gmail.com`  
   - Confirms the verified draft satisfies legal clarity, clinical relevance, and operational balance.  
   - Authorizes activation (`status: "ACTIVE"`).  
   - *Note:* The system strictly prevents the author/verifier from approving their own rule version.

---

## 2. Side-by-Side Review: Existing Policy Revisions (Yash Review Feedback)

In accordance with direct feedback from Yash, the three initial Tier 1 draft policies currently stored in Production (`cyntique_demo`) have been thoroughly revised.

---

### A. Meta Personal Health Attributes (`RX-META-PA-01`)
*Official Source:* [Meta Transparency Center — Personal Attributes](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/)

| Field | Original Draft (Tier 1) | Revised Draft (Tier 2 — Yash Review Feedback) | Rationale for Change |
|---|---|---|---|
| **Title** | Don't assert or imply the viewer's personal health condition or attributes | Advertisements must not assert or imply personal health attributes or medical conditions | Refined to match Meta's precise policy header ("Personal Attributes") and standard advertising terminology. |
| **Summary** | Meta restricts ads that assert or imply a person's medical conditions, physical or mental health. Copy must not suggest knowledge of the user's personal health details. | Advertisements must not contain content that asserts or implies personal health attributes, including physical health, mental health, medical conditions, or treatments. Meta restricts copy that assumes or questions the viewer's health status (e.g. direct second-person inquiries like 'Do you have diabetes?'). Advertisers must frame healthcare services objectively in the third person or focus on treatment capabilities and clinic specializations. | Clearly explains the "second-person" diagnostic trap for clinic advertisers and provides the objective third-person framing path. |
| **Legal Explanation** | Asserting or implying personal attributes is forbidden under Meta Ad Standards. Inquiries or assertions regarding health status violate user privacy expectations on Facebook and Instagram. | Meta's Personal Attributes policy prohibits advertising content that asserts or implies personal attributes, explicitly including physical or mental health conditions, disabilities, and medical treatments. The core enforcement mechanism focuses on perception: ads must not lead users to feel that Meta or the advertiser has private knowledge of their medical condition. Violations routinely arise from second-person interrogative framing (e.g., 'Struggling with depression?', 'Do you have chronic back pain?', 'Tired of living with acne?'). Conversely, Meta permits objective, third-person descriptions of healthcare services, medical expertise, treatment facilities, and public health initiatives (e.g., 'We offer clinical dermatology treatments', 'Specialized orthopedic care center'). | Removes vague blanket assumptions. Pinpoints exact second-person triggers (`Do you have...?`) while explicitly clarifying permitted clinic service descriptions. |
| **Remediation Action** | Rephrase ad copy to avoid direct questions about personal medical history. Use neutral descriptions of services. | Rephrase copy from direct second-person diagnostic inquiries ('Are you suffering from...') to neutral, third-person, objective service descriptions ('Specialized clinic providing treatments for...'). Ensure visuals and text focus on clinical capabilities rather than the viewer's presumed medical diagnosis. | Practical, actionable advice for pilot healthcare marketing teams. |
| **Exceptions** | None recorded. | Public service announcements, governmental health awareness campaigns, and accredited non-profit health organizations providing general educational information without promoting commercial clinical services. | Preserves the legitimate Meta public health / PSA educational exception. |

---

### B. Google Health Personalization (`RX-GOOG-PA-01`)
*Official Source:* [Google Ads Help — Personalized Advertising / Health in personalized advertising](https://support.google.com/adspolicy/answer/16701855)

| Field | Original Draft (Tier 1) | Revised Draft (Tier 2 — Yash Review Feedback) | Rationale for Change |
|---|---|---|---|
| **Title** | No advertiser-built targeting based on health | Restrictions on personalized advertising and remarketing for health in Google Ads | Avoids inaccurate blanket statement that all health targeting is banned; clarifies scope is personalized advertising & remarketing. |
| **Summary** | Google Ads prohibits using health information to build custom audiences, remarketing lists, or target users based on health conditions. | Google Ads prohibits using sensitive health and medical condition data to target personalized advertisements to individuals. Advertisers cannot use remarketing lists, Customer Match, or advertiser-curated custom segments based on health hardships or treatments. However, contextual search ads based on keywords and Google's standard predefined demographic categories remain permitted. | Replaces blanket prohibition with precise boundary: advertiser-curated audiences (Customer Match / remarketing) are restricted; contextual search & predefined audiences are permitted. |
| **Legal Explanation** | Under Google's Personalized Advertising policy, health-related content is considered sensitive. Advertisers cannot personalize ads based on health conditions or create custom segments reflecting personal hardships. | Under Google Ads Personalized Advertising policies, 'Health in personalized advertising' prohibits advertisers from targeting ads based on sensitive personal hardships, physical or mental health conditions, or treatments. Specifically, advertisers are prohibited from deploying: (1) Remarketing lists derived from clinic website visitors or medical landing pages; (2) Customer Match lists built from patient records or health inquiries; (3) Custom segments created with health-related search terms or condition URLs. Crucially, this policy does NOT ban healthcare advertising entirely. Advertisers may serve ads contextually based on user search queries (e.g., standard Google Search keyword targeting for 'dermatologist near me') and may use Google's predefined, non-sensitive affinity and in-market audiences. | Resolves Yash's primary concern by delineating restricted advertiser-managed audiences vs permitted contextual search ads and predefined Google audiences. |
| **Exceptions** | None recorded. | Contextual search advertising based on user search queries without remarketing or audience layering; non-health specific predefined Google audience segments. | Explicitly documents the contextual search exception. |
| **Applicability Conditions** | All Google Ads campaigns in healthcare. | Google Ads campaigns targeting users globally; creative or targeting utilizes audience targeting, remarketing lists, Customer Match, or custom audience segments. | Restricts rule trigger to audience-layered campaigns, preventing false-positive rejections on clean search campaigns. |

---

### C. Google Healthcare and Medicines Split (`RX-GOOG-HM-01`)
*Official Source:* [Google Ads Help — Healthcare and Medicines](https://support.google.com/adspolicy/answer/176031)

**Issue with Original Composite Rule:**  
The original `RX-GOOG-HM-01` conflated two completely different regulatory requirements:
1. Online prescription drug service / telemedicine dispensary certification.
2. Trademarked/restricted pharmaceutical term monitoring in ad text, keywords, and landing pages.  
This caused confusion for pilot clinics who mistakenly believed general in-person physician clinics required LegitScript/pharmacy certification, and obscured the critical difference between US DTC allowances and strict UAE/international prohibitions.

**Architectural Resolution:**  
`RX-GOOG-HM-01` is safely superseded and retained in historical draft state for audit continuity. In its place, two targeted, specialized rules are established:

```
[RX-GOOG-HM-01 Composite Rule (Draft)]
               │
               ├──► [RX-GOOG-PDS-01] Google Prescription Drug Services (Certification & Licensure)
               │
               └──► [RX-GOOG-RDT-01] Google Restricted Drug Terms (Brand Names & Direct-to-Consumer Copy)
```

#### Comparison Details:

| Dimension | RX-GOOG-PDS-01 (New Split Rule 1) | RX-GOOG-RDT-01 (New Split Rule 2) |
|---|---|---|
| **Rule Title** | Online pharmacy and telemedicine prescription services require Google certification | Restrictions on prescription drug brand names, active ingredients, and direct-to-consumer promotion in Google Ads |
| **Category** | `CREDENTIALS_LICENSING` | `PRESCRIPTION_MEDICINE` |
| **Restriction Level** | `RESTRICTED` | `PROHIBITED` |
| **Who Must Comply?** | Entities that dispense, sell, prescribe, or fulfill prescription drugs via mail order, digital dispensing, or telemedicine consultations. | Any advertiser writing Google Search ad copy, bidding on keywords, or publishing landing pages for healthcare or medical aesthetics. |
| **Clinic Exemption** | **YES:** Standard physical medical practices, outpatient physician clinics, and diagnostic centers that do **not** sell pharmaceuticals online or operate telemedicine prescription fulfillment are exempt. | **NO:** Clinics must not mention prescription brand names (e.g. Botox, Ozempic, Wegovy, Retin-A) in ad copy, headlines, descriptions, or keyword bidding in regions where restricted. |
| **Regional Nuances** | US: LegitScript pharmacy/telemedicine accreditation required prior to Google certification. UAE: MOHAP or DHA/DOH licensing required. | US: Certified pharmaceutical manufacturers may run Direct-to-Consumer (DTC) ads. UAE: DTC prescription drug advertising is strictly prohibited to the public. |
| **Remediation Action** | Telemedicine and digital pharmacy services must complete LegitScript/Google certification. Traditional clinics must clarify they provide in-person clinical consultations only. | Remove all prescription pharmaceutical brand names, trade names, and active pharmaceutical ingredients from ad copy, headlines, descriptions, and dynamic keyword insertion. Replace with generic procedure terms (e.g., 'anti-wrinkle treatment', 'clinical weight management'). |

---

## 3. Comprehensive Analysis: The 8 Tier 2 Policies

Below is the complete operational and legal breakdown for all 8 policies in the Tier 2 expansion pack.

---

### Policy 1: `RX-META-PA-01` (v1 Draft)
* **Title:** Advertisements must not assert or imply personal health attributes or medical conditions
* **Platform:** Meta (Facebook, Instagram, Audience Network) | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `PERSONAL_HEALTH_ATTRIBUTES`
* **Restriction Level:** `PROHIBITED`
* **Official Source:** `https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/`
* **Operational Summary:** Prohibits direct second-person diagnostic interrogatives or assertions suggesting the advertiser has private insight into the user's health status.
* **Explicit Restrictions:**
  - Copy using second-person questions about medical conditions ("Do you suffer from severe anxiety?", "Are you struggling with psoriasis?").
  - Assertive claims implying personal health defects or diagnoses.
  - Creatives depicting stylized medical notifications or diagnostic results targeted at the viewer.
* **Concrete Exceptions:** Public service announcements, accredited governmental health agency notices, and non-profit disease awareness campaigns that do not sell clinical procedures.
* **Advertiser Remediation:** Reframe copy into the third person focusing on clinical capabilities and treatment solutions (e.g., "Specialized clinic providing dermatological care for chronic skin conditions").
* **Evidence / Substantiation Requirements:** Creative copy and imagery review demonstrating objective third-person framing and absence of direct diagnostic questions.
* **Open Verification Questions for Admin A / B:**
  1. Confirm exact URL anchor on Meta Transparency Center.
  2. Verify if Meta has recently updated its enforcement tolerances regarding first-person patient storytelling ("My journey with diabetes") versus direct second-person questions.

---

### Policy 2: `RX-GOOG-PA-01` (v1 Draft)
* **Title:** Restrictions on personalized advertising and remarketing for health in Google Ads
* **Platform:** Google Ads | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `TARGETING_RESTRICTION`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://support.google.com/adspolicy/answer/16701855`
* **Operational Summary:** Prohibits advertiser-curated audience lists (Customer Match, remarketing lists, health-related custom segments) from being targeted based on personal health hardships. Contextual search targeting and standard predefined Google audiences remain permitted.
* **Explicit Restrictions:**
  - Deploying remarketing pixels on medical condition pages or clinic consultation forms.
  - Uploading patient email/phone lists to Customer Match for health targeting.
  - Creating custom segments using medical URLs or health diagnostic search queries.
* **Concrete Exceptions:**
  - Standard contextual search advertising triggered by user search terms (e.g. "urgent care clinic near me").
  - Google predefined affinity and in-market demographic segments.
* **Advertiser Remediation:** Remove remarketing audience lists and Customer Match layers from all healthcare campaign targeting. Rely on keyword contextual relevance on the Google Search Network.
* **Evidence / Substantiation Requirements:** Campaign targeting settings audit confirming audience layering is set to "All users" or contextual search keywords only.
* **Open Verification Questions for Admin A / B:**
  1. Review Google Ads policy section on Custom Segments to confirm whether wellness/fitness keywords trigger automated health hardship classification.
  2. Verify if Display & Video 360 (DV360) applies identical restrictions to YouTube health campaign targeting.

---

### Policy 3: `RX-GOOG-PDS-01` (v1 Draft)
* **Title:** Online pharmacy and telemedicine prescription services require Google certification
* **Platform:** Google Ads | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `CREDENTIALS_LICENSING`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://support.google.com/adspolicy/answer/176031`
* **Operational Summary:** Services that prescribe, dispense, sell, or deliver prescription drugs online must obtain Google Healthcare certification (and LegitScript accreditation in the US). In-person clinics and physicians offering consultations without online drug fulfillment are exempt.
* **Explicit Restrictions:**
  - Promoting online prescription fulfillment, mail-order pharmacies, or digital medication subscriptions without Google Healthcare Certification.
  - Advertising telemedicine consultations that dispense prescription drugs without required jurisdictional accreditation (e.g. LegitScript in the US, MOHAP in the UAE).
* **Concrete Exceptions:** Traditional physical medical practices, outpatient physician clinics, and diagnostic centers providing general in-person consultations without mail-order drug dispensing.
* **Advertiser Remediation:** For digital pharmacy/telemedicine advertisers, submit proof of LegitScript accreditation and complete Google Healthcare Certification. For standard clinics, remove telemedicine prescription fulfillment claims from landing pages.
* **Evidence / Substantiation Requirements:** Verified LegitScript certificate number, national medical license, and approved Google Ads account certification ID.
* **Open Verification Questions for Admin A / B:**
  1. Verify the specific application form and turnaround time for Google Healthcare Certification in the US vs UAE.
  2. Confirm whether hybrid clinics (in-person clinic with home delivery of compounded medications) are classified under pharmacy rules.

---

### Policy 4: `RX-GOOG-RDT-01` (v1 Draft)
* **Title:** Restrictions on prescription drug brand names, active ingredients, and direct-to-consumer promotion in Google Ads
* **Platform:** Google Ads | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `PRESCRIPTION_MEDICINE`
* **Restriction Level:** `PROHIBITED`
* **Official Source:** `https://support.google.com/adspolicy/answer/176031`
* **Operational Summary:** Prohibits prescription drug brand names and active pharmaceutical ingredients in ad copy, headlines, descriptions, and dynamic search keywords. Direct-to-consumer (DTC) ads are allowed only for certified manufacturers in the US/Canada; DTC is strictly prohibited in the UAE.
* **Explicit Restrictions:**
  - Including prescription brand names (e.g., Botox, Ozempic, Wegovy, Retin-A, Latisse) in Google Search headlines, description lines, or display URLs.
  - Bidding on restricted prescription drug terms in non-DTC permitted jurisdictions (such as the UAE).
* **Concrete Exceptions:** Certified pharmaceutical manufacturers running approved direct-to-consumer brand campaigns in jurisdictions where legally sanctioned (US, New Zealand, Canada under restricted conditions).
* **Advertiser Remediation:** Replace all prescription brand names in ad copy and headlines with approved medical procedure descriptions (e.g. replace "Botox injections" with "anti-wrinkle facial treatment" or "neuromodulator consultation").
* **Evidence / Substantiation Requirements:** Creative copy and keyword audit demonstrating complete absence of restricted prescription brand terms.
* **Open Verification Questions for Admin A / B:**
  1. Confirm Google's exact country list for prescription drug term bidding allowances.
  2. Verify whether cosmetic clinics in the US may bid on prescription brand keywords if the ad text itself omits the term.

---

### Policy 5: `RX-TIKTOK-MC-01` (v1 Draft)
* **Title:** TikTok prohibition on misleading medical claims, guaranteed cures, and before-and-after health comparisons
* **Platform:** TikTok | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `EFFICACY_CLAIM`
* **Restriction Level:** `PROHIBITED`
* **Official Source:** `https://ads.tiktok.com/help/article/tiktok-advertising-policies`
* **Operational Summary:** Prohibits exaggerated, scientifically unproven medical claims, absolute treatment guarantees, unrealistic weight management depictions, and side-by-side before-and-after imagery.
* **Explicit Restrictions:**
  - Promising guaranteed medical outcomes ("100% cure for arthritis", "Permanently eliminate back pain").
  - Depicting dramatic or unrealistic before-and-after bodily comparisons (e.g. side-by-side weight loss images, exaggerated surgical transformations).
  - Promoting rapid or unhealthy weight reduction (e.g. "Lose 15 lbs in 7 days").
  - Content encouraging negative body image or self-deprecating physical scrutiny.
* **Concrete Exceptions:** None. TikTok enforces strict platform safety standards across all health and wellness creatives.
* **Advertiser Remediation:** Remove absolute outcome guarantees and split-screen before-and-after photos. Focus visual creative on procedure safety, professional clinic environments, and practitioner credentials.
* **Evidence / Substantiation Requirements:** Review of video storyboards and visual assets to confirm elimination of side-by-side comparisons, exaggerated claims, and body measurement comparisons.
* **Open Verification Questions for Admin A / B:**
  1. Check TikTok's current policy regarding before-and-after video transitions for non-invasive cosmetic treatments (e.g. HydraFacial).
  2. Verify specific video duration and disclosure rules for health disclaimers on TikTok mobile layouts.

---

### Policy 6: `RX-TIKTOK-HP-01` (v1 Draft)
* **Title:** TikTok advertising entry requirements, mandatory 18+ age gating, and prescription drug prohibition
* **Platform:** TikTok | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `PRESCRIPTION_MEDICINE`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://ads.tiktok.com/help/article/healthcare-and-pharmaceuticals-10003058`
* **Operational Summary:** Advertisements for healthcare, health supplements, over-the-counter medicines, and medical devices are strictly prohibited from targeting minors under 18. Prescription pharmaceutical advertising is completely banned. Local health authority documentation (e.g. UAE MOHAP permit) is required prior to ad account authorization.
* **Explicit Restrictions:**
  - Running any healthcare, wellness, or clinic creative without strict 18+ age gating.
  - Advertising prescription medications or controlled substances under any circumstances.
  - Running health services in regulated regional markets (including UAE) without prior TikTok account onboarding and regulatory permit submission.
* **Concrete Exceptions:** None. 18+ age restriction is an absolute platform requirement.
* **Advertiser Remediation:** Set TikTok campaign audience targeting to ages 18-55+ exclusively. Upload business license and local health authority authorization (e.g. MOHAP permit in UAE) during TikTok ad account verification.
* **Evidence / Substantiation Requirements:** Screenshot or export of TikTok Ads Manager targeting settings showing `Age: 18+`, accompanied by valid clinic trade license and MOHAP/DHA permit copy.
* **Open Verification Questions for Admin A / B:**
  1. Confirm TikTok's exact onboarding checklist for medical clinics in the Middle East & North Africa (MENA) region.
  2. Verify whether general wellness spas (non-medical) are subject to the same 18+ age gating requirement.

---

### Policy 7: `RX-US-FTC-CS-01` (v1 Draft)
* **Title:** FTC requirement for competent and reliable scientific evidence (CARSE) for healthcare and health-benefit claims
* **Platform:** None (Statutory Cross-Platform) | **Authority:** `REGULATION`
* **Jurisdiction:** `US` | **Industry:** `HEALTHCARE` | **Category:** `SUBSTANTIATION`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance`
* **Operational Summary:** Under Sections 5 and 12 of the FTC Act, all health, medical, wellness, and aesthetic benefit claims must be substantiated by competent and reliable scientific evidence (CARSE), typically requiring randomized, double-blind, placebo-controlled human clinical trials (RCTs).
* **Explicit Restrictions:**
  - Disseminating objective health, therapeutic, or clinical efficacy claims without prior randomized human clinical trials.
  - Extrapolating animal, in vitro, or preliminary laboratory findings to claim proven human clinical benefits.
  - Relying on uncontrolled consumer surveys, practitioner impressions, or subjective feedback as clinical substantiation.
* **Concrete Exceptions:** None. Substantiation must exist in the advertiser's possession *prior* to disseminating the claim.
* **Advertiser Remediation:** Ensure every clinical efficacy statement is directly supported by published, peer-reviewed human clinical trials matching the exact formulation, dosage, and delivery method used in the advertised treatment.
* **Evidence / Substantiation Requirements:** Full-text clinical study documentation, institutional review board (IRB) approvals, and statistical analyses demonstrating statistically significant human health benefits.
* **Open Verification Questions for Admin A / B:**
  1. Confirm the FTC's December 2022 Health Products Compliance Guidance standard regarding the necessity of replication studies (two independent RCTs vs one robust study).
  2. Verify FTC treatment of emerging aesthetic wellness therapies (e.g. cryotherapy, IV vitamin infusions, red light therapy).

---

### Policy 8: `RX-US-FTC-TE-01` (v1 Draft)
* **Title:** FTC requirements for healthcare testimonials, typicality disclosures, and material connections
* **Platform:** None (Statutory Cross-Platform) | **Authority:** `REGULATION`
* **Jurisdiction:** `US` | **Industry:** `HEALTHCARE` | **Category:** `TESTIMONIAL_ENDORSEMENT`
* **Restriction Level:** `DISCLOSURE_REQUIRED`
* **Official Source:** `https://www.ftc.gov/legal-library/browse/rules/endorsement-guides`
* **Operational Summary:** Under FTC Endorsement Guides (16 CFR Part 255), consumer testimonials must reflect representative results. If an endorser's outcome is not generally achievable, the ad must clearly disclose generally expected performance; boilerplate disclaimers like "results may vary" are legally ineffective. Any material connection (compensation, free treatment, employment) must be clearly disclosed.
* **Explicit Restrictions:**
  - Featuring patient testimonials depicting exceptional health or aesthetic outcomes without conspicuous disclosure of typical results.
  - Relying on disclaimers such as "Results not typical" or "Results may vary" to excuse atypical patient results (invalid under 16 CFR § 255.2).
  - Failing to clearly and prominently disclose financial relationships, gifted treatments, or clinic employment (violation of 16 CFR § 255.5).
* **Concrete Exceptions:** None. Clear and conspicuous disclosure is mandatory under federal regulation.
* **Advertiser Remediation:** When featuring dramatic patient transformations, add an unavoidable visual/auditory disclosure stating the generally expected clinical result supported by evidence. If the patient received free or discounted treatment, prominently add an unambiguous disclosure (e.g., `#PaidAd`, `Treatment provided courtesy of clinic`).
* **Evidence / Substantiation Requirements:** Written disclosure log for all patient testimonials and influencer partnerships, alongside clinical documentation proving the disclosed typical results.
* **Open Verification Questions for Admin A / B:**
  1. Confirm the 2023 revised Endorsement Guides standard for "clear and conspicuous" disclosures in vertical mobile video (TikTok / Instagram Reels).
  2. Verify requirements regarding employee reviews on clinic Google Business profiles and social media pages.

---

## 4. Database Strategy & Idempotent Import Tooling

### Architecture: `prisma/policy-tier2-import.ts`
To ensure zero operational disruption and maintain database integrity on Render (`cyntique_demo`), a specialized transactional import script has been developed:

```bash
# Dry Run (Inspects current state, plans actions, modifies zero data):
npm run db:policy-tier2-import -- --author team@clyntique.demo

# Production Write (REQUIRES EXPLICIT AUTHORIZATION):
IMPORT_CONFIRM_DATABASE=cyntique_demo npm run db:policy-tier2-import -- --author team@clyntique.demo --production-approved --apply --update-drafts
```

### Safety & Integrity Invariants:
1. **Unverified & Inactive Invariant:** Every newly imported source is marked `verificationStatus: "UNVERIFIED"`. Every new rule and version is created as `status: "DRAFT"` and `verificationStatus: "UNVERIFIED"`. Automated activation is impossible.
2. **Audit Preservation Invariant:** Pre-existing rules (`RX-META-PA-01`, `RX-GOOG-PA-01`, `RX-GOOG-HM-01`) are never deleted or truncated. When `--update-drafts` is passed, existing draft versions are updated in place with full `VERSION_EDITED` event logging in `PolicyRuleEvent`. `RX-GOOG-HM-01` receives an explicit supersession annotation.
3. **Transaction Rollback Protection:** The import executes inside a single interactive Prisma transaction (`prisma.$transaction`). An exact post-write count validator checks expected vs actual counts across `PolicySource`, `PolicyRule`, `PolicyRuleVersion`, and `PolicyRuleEvent`. Any mismatch or unexpected status instantly aborts the transaction and rolls back all changes.
4. **Rollback Rehearsal Verified:** The test suite (`tests/policy-tier2-pack.test.ts`) tests and validates the transactional count checks and rollback triggers.

---

## 5. Summary & Next Steps for Deepanshi and Yash

| Action Item | Responsible Party | Platform / Surface |
|---|---|---|
| Review Tier 2 Policy Pack & Review Package | Yash Sharma & Deepanshi Singh | GitHub Pull Request |
| Provide Production Write Authorization | Yash Sharma (Co-Founder) | Direct Approval |
| Execute Production Database Import | Antigravity / Deployment Lead | Render CLI (`cyntique_demo`) |
| Step 1 Verification: Sources & Drafts | Admin A (`team@clyntique.demo`) | Clyntique Policy Library UI |
| Step 2 Independent Approval: Activation | Admin B (`deepanshisingh1995@gmail.com`) | Clyntique Policy Library UI |
