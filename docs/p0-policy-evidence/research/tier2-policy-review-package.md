# Tier 2 Healthcare Advertising Policy Review Package
**Prepared for:** Deepanshi Singh (Independent Approver) and Yash Sharma (Co-Founder / Reviewer)  
**Date:** November 1, 2026 (Applied to Production — Awaiting Founder Verification & Approval)  
**Scope:** Healthcare, Medical Aesthetics, Prescription Medicine, Telemedicine, Digital Health  
**Platforms & Jurisdictions:** Meta (Facebook & Instagram), Google Ads, TikTok, US Federal Trade Commission (FTC), UAE (MOHAP/EDE/DHA)  
**Target Database:** Clyntique Production (`cyntique_demo` on Render — 7 Sources, 9 Rules, 11 Versions, 22 Events)  
**Deployment Status:** Merged into `main` (Commit `01ee1e4`), Live on Vercel Production  

---

## 1. Executive Disclaimers & Governance Controls

> [!IMPORTANT]
> **RESEARCH DRAFTS APPLIED TO PRODUCTION — STRICTLY UNVERIFIED / INACTIVE**  
> All 8 reviewable policy rules and 7 official sources documented herein are research drafts created for human verification. None of these rules are approved, verified, or active. The Clyntique AI Compliance Engine will **NOT** evaluate creatives against these rules, and will continue to report *"Insufficient policy coverage — manual review required"* until the independent two-admin verification and approval workflow is completed by Admin A and Admin B.

> [!NOTE]
> **COMPLIANCE & LEGAL NOTICE**  
> This package represents structured regulatory intelligence and platform policy translation developed from official documentation. It does **not** constitute formal legal counsel. Prior to external client enforcement, advertiser-facing remediation guidance should be validated against platform enforcement precedents and local legal requirements.

### Dual-Admin Verification Architecture
In accordance with Clyntique's strict compliance governance model (Decision D9), policy activation requires segregation of duties between two distinct authenticated TEAM Policy Admins:
1. **Admin A (Author & Verifier):** `team@clyntique.demo`  
   - Inspects the live official documentation directly at the designated URL.  
   - Confirms official domain authenticity, section references, and effective dates.  
   - Marks the `PolicySource` as `VERIFIED` and submits the rule version for independent approval.
2. **Admin B (Independent Approver):** `deepanshisingh1995@gmail.com`  
   - Confirms the verified draft satisfies legal clarity, clinical relevance, and operational balance.  
   - Authorizes activation (`status: "ACTIVE"`).  
   - *Note:* The system strictly prevents the author/verifier from approving their own rule version.

---

## 2. Established Policy Versioning Model & Supersession Strategy

### Invariant: Zero Overwriting of Existing Drafts
Rather than silently mutating pre-existing records, the established Clyntique policy versioning architecture preserves immutable audit trails:

1. **`RX-META-PA-01` (Meta Personal Health Attributes):**
   - **v1 Draft:** Transitioned to `status: "DEPRECATED"`, retaining original citations, timestamps, and audit history.
   - **v2 Draft:** Created as `versionNumber: 2`, `status: "DRAFT"`, `verificationStatus: "UNVERIFIED"`, incorporating Yash's review feedback.
   - **Rule Pointer:** `PolicyRule.currentVersionNumber` advanced to 2.
   - **Audit Trail:** Logged `VERSION_PROPOSED` event in `PolicyRuleEvent`.

2. **`RX-GOOG-PA-01` (Google Health Personalization):**
   - **v1 Draft:** Transitioned to `status: "DEPRECATED"`, retaining original citations and history.
   - **v2 Draft:** Created as `versionNumber: 2`, `status: "DRAFT"`, `verificationStatus: "UNVERIFIED"`, clarifying audience restrictions vs contextual search.
   - **Rule Pointer:** `PolicyRule.currentVersionNumber` advanced to 2.
   - **Audit Trail:** Logged `VERSION_PROPOSED` event in `PolicyRuleEvent`.

3. **`RX-GOOG-HM-01` (Superseded Composite Rule):**
   - **Audit Preservation & Supersession Lock:** The original composite rule is **not deleted**. Its v1 version is marked `status: "DEPRECATED"`.
   - **Immutability & Safety:** In accordance with `src/lib/policy/auth.ts` and `src/lib/policy/db.ts`, a `DEPRECATED` version cannot be verified (`canVerifyPolicyVersion` fails) and cannot be approved (`canApprovePolicyVersion` fails). It cannot accidentally be activated alongside its replacement rules.
   - **Replacement Split:** Replaced by specialized rules `RX-GOOG-PDS-01` (Prescription Drug Services) and `RX-GOOG-RDT-01` (Restricted Drug Terms).
   - **Audit Trail:** Logged `RULE_RETIRED` event in `PolicyRuleEvent`.

---

## 3. Exact Database Record Counts

Below is the precise mathematical breakdown of database records before and after applying the Tier 2 expansion pack:

| Entity | Pre-Existing Count (`cyntique_demo`) | New Created / Evolved | Final Planned Total | Breakdown Details |
|---|---|---|---|---|
| **`PolicySource`** | 3 | +4 new sources | **7** | 3 pre-existing (`meta-personal-attributes`, `google-health-personalized`, `google-healthcare-medicines`) + 4 new (`tiktok-advertising-policies`, `tiktok-healthcare-pharmaceuticals`, `us-ftc-health-products-guidance`, `us-ftc-endorsement-guides`). |
| **`PolicyRule`** | 3 | +6 new canonical rules | **9** | 3 pre-existing (`RX-META-PA-01`, `RX-GOOG-PA-01`, `RX-GOOG-HM-01`) + 6 new (`RX-GOOG-PDS-01`, `RX-GOOG-RDT-01`, `RX-TIKTOK-MC-01`, `RX-TIKTOK-HP-01`, `RX-US-FTC-CS-01`, `RX-US-FTC-TE-01`). |
| **`PolicyRuleVersion`** | 3 | +8 new version rows | **11** | **8 Active Draft Review Targets:** 6 new v1 drafts + 2 proposed v2 drafts (`RX-META-PA-01` v2, `RX-GOOG-PA-01` v2).<br>**3 Deprecated Historical Versions:** v1 of `RX-META-PA-01`, v1 of `RX-GOOG-PA-01`, and v1 of `RX-GOOG-HM-01`. |
| **`PolicyRuleEvent`** | 9 | +13 new audit events | **22** | +4 `SOURCE_CREATED` + 6 `RULE_CREATED` + 2 `VERSION_PROPOSED` (v2 for META-PA and GOOG-PA) + 1 `RULE_RETIRED` (supersession of GOOG-HM). |

---

## 4. Side-by-Side Review: Existing Policy Revisions (Yash Review Feedback)

---

### A. Meta Personal Health Attributes (`RX-META-PA-01`)
*Official Source:* [Meta Transparency Center — Personal Attributes](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/)

| Field | v1 Historical Draft (Preserved as DEPRECATED) | v2 Proposed Draft (DRAFT / UNVERIFIED) | Rationale for Version Evolution |
|---|---|---|---|
| **Title** | Don't assert or imply the viewer's personal health condition or attributes | Advertisements must not assert or imply personal health attributes or medical conditions | Standardizes heading to Meta Ad Standards policy terminology. |
| **Summary** | Meta restricts ads that assert or imply a person's medical conditions, physical or mental health. Copy must not suggest knowledge of the user's personal health details. | Advertisements must not contain content that asserts or implies personal health attributes, including physical health, mental health, medical conditions, or treatments. Meta restricts copy that assumes or questions the viewer's health status (e.g. direct second-person inquiries like 'Do you have diabetes?'). Advertisers must frame healthcare services objectively in the third person or focus on treatment capabilities and clinic specializations. | Pinpoints the second-person diagnostic interrogative trap for clinic advertisers and provides the compliant third-person operational path. |
| **Legal Explanation** | Asserting or implying personal attributes is forbidden under Meta Ad Standards. Inquiries or assertions regarding health status violate user privacy expectations on Facebook and Instagram. | Meta's Personal Attributes policy prohibits advertising content that asserts or implies personal attributes, explicitly including physical or mental health conditions, disabilities, and medical treatments. The core enforcement mechanism focuses on perception: ads must not lead users to feel that Meta or the advertiser has private knowledge of their medical condition. Violations routinely arise from second-person interrogative framing (e.g., 'Struggling with depression?', 'Do you have chronic back pain?', 'Tired of living with acne?'). Conversely, Meta permits objective, third-person descriptions of healthcare services, medical expertise, treatment facilities, and public health initiatives (e.g., 'We offer clinical dermatology treatments', 'Specialized orthopedic care center'). | Removes vague blanket assumptions. Pinpoints exact second-person triggers (`Do you have...?`) while explicitly clarifying permitted clinic service descriptions. |
| **Exceptions** | None recorded. | Public service announcements, governmental health awareness campaigns, and accredited non-profit health organizations providing general educational information without promoting commercial clinical services. | Preserves the legitimate Meta public health / PSA educational exception. |

---

### B. Google Health Personalization (`RX-GOOG-PA-01`)
*Official Source:* [Google Ads Help — Personalized Advertising / Health in personalized advertising](https://support.google.com/adspolicy/answer/16701855)

| Field | v1 Historical Draft (Preserved as DEPRECATED) | v2 Proposed Draft (DRAFT / UNVERIFIED) | Rationale for Version Evolution |
|---|---|---|---|
| **Title** | No advertiser-built targeting based on health | Restrictions on personalized advertising and remarketing for health in Google Ads | Avoids inaccurate blanket statement that all health targeting is banned; clarifies scope is personalized advertising & remarketing. |
| **Summary** | Google Ads prohibits using health information to build custom audiences, remarketing lists, or target users based on health conditions. | Google Ads prohibits using sensitive health and medical condition data to target personalized advertisements to individuals. Advertisers cannot use remarketing lists, Customer Match, or advertiser-curated custom segments based on health hardships or treatments. However, contextual search ads based on keywords and Google's standard predefined demographic categories remain permitted. | Replaces blanket prohibition with precise boundary: advertiser-curated audiences (Customer Match / remarketing) are restricted; contextual search & predefined audiences are permitted. |
| **Legal Explanation** | Under Google's Personalized Advertising policy, health-related content is considered sensitive. Advertisers cannot personalize ads based on health conditions or create custom segments reflecting personal hardships. | Under Google Ads Personalized Advertising policies, 'Health in personalized advertising' prohibits advertisers from targeting ads based on sensitive personal hardships, physical or mental health conditions, or treatments. Specifically, advertisers are prohibited from deploying: (1) Remarketing lists derived from clinic website visitors or medical landing pages; (2) Customer Match lists built from patient records or health inquiries; (3) Custom segments created with health-related search terms or condition URLs. Crucially, this policy does NOT ban healthcare advertising entirely. Advertisers may serve ads contextually based on user search queries (e.g., standard Google Search keyword targeting for 'dermatologist near me') and may use Google's predefined, non-sensitive affinity and in-market audiences. | Resolves Yash's primary concern by delineating restricted advertiser-managed audiences vs permitted contextual search ads and predefined Google audiences. |
| **Exceptions** | None recorded. | Contextual search advertising based on user search queries without remarketing or audience layering; non-health specific predefined Google audience segments. | Explicitly documents the contextual search exception. |

---

### C. Google Healthcare and Medicines Split (`RX-GOOG-HM-01` Superseded)
*Official Source:* [Google Ads Help — Healthcare and Medicines](https://support.google.com/adspolicy/answer/176031)

**Supersession Architecture:**  
`RX-GOOG-HM-01` conflated online pharmacy certification with prescription term copy restrictions. It is now marked `DEPRECATED` and replaced by two specialized rules:
1. `RX-GOOG-PDS-01` (Prescription Drug Services & Telemedicine Prescribing)
2. `RX-GOOG-RDT-01` (Restricted Drug Terms & Direct-to-Consumer Copy)

| Dimension | RX-GOOG-PDS-01 (Services & Certification) | RX-GOOG-RDT-01 (Restricted Drug Terms) |
|---|---|---|
| **Rule Title** | Google certification requirements for prescription drug services and telemedicine prescribing | Restrictions on prescription drug brand names, active ingredients, and direct-to-consumer terms in Google Ads |
| **Category** | `CREDENTIALS_LICENSING` | `PRESCRIPTION_MEDICINE` |
| **Restriction Level** | `RESTRICTED` | `PROHIBITED` |
| **Scope of Application** | Regulates entities involved in the commercial supply chain or remote prescribing of prescription drugs (online pharmacies, digital dispensaries, telemedicine prescription platforms). | Regulates linguistic mentions of prescription drug brand names, active pharmaceutical ingredients (APIs), and terms in ad text, headlines, descriptions, keywords, and landing pages. |
| **Ordinary Clinic Boundary** | **No Broad Exemption:** Ordinary physical healthcare practices providing strictly in-person medical care without online prescription fulfillment are not subject to online pharmacy certification; however, any clinic offering remote consultations with prescription services must obtain applicable telemedicine accreditation (e.g. LegitScript in the US). | **No Broad Exemption:** Ordinary healthcare clinics and aesthetic practices cannot use prescription drug brand names (e.g. Botox, Ozempic, Wegovy) in ad copy, headlines, or keywords, even if staffed by licensed physicians. Must use generic procedural descriptions. |
| **Jurisdictional Nuances** | US: LegitScript pharmacy/telemedicine accreditation required prior to Google certification. UAE: MOHAP or DHA/DOH licensing required. | US: Certified pharmaceutical manufacturers may run Direct-to-Consumer (DTC) ads. Canada: Name and price only without claims. UAE: DTC prescription drug advertising is strictly prohibited to the public. |

---

## 5. Comprehensive Policy Deep Dive (The 8 Review Targets)

---

### Policy 1: `RX-META-PA-01` (v2 Proposed Draft)
* **Title:** Advertisements must not assert or imply personal health attributes or medical conditions
* **Platform:** Meta (Facebook, Instagram) | **Authority:** `PLATFORM_POLICY`
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
* **Evidence Requirements:** Creative copy and imagery review demonstrating objective third-person framing and absence of direct diagnostic questions.
* **Open Verification Questions for Admin A / B:**
  1. Confirm exact URL anchor on Meta Transparency Center.
  2. Verify whether first-person patient testimonials ("How I managed my eczema") trigger automated personal attribute flags on Instagram video reels.

---

### Policy 2: `RX-GOOG-PA-01` (v2 Proposed Draft)
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
* **Concrete Exceptions:** Contextual search advertising based on user search queries without remarketing; Google predefined affinity and in-market demographic segments.
* **Advertiser Remediation:** Remove remarketing audience lists and Customer Match layers from all healthcare campaign targeting. Rely on keyword contextual relevance on the Google Search Network.
* **Evidence Requirements:** Campaign targeting settings audit confirming audience layering is set to "All users" or contextual search keywords only.
* **Open Verification Questions for Admin A / B:**
  1. Review Google Ads policy section on Custom Segments to confirm whether wellness/fitness keywords trigger automated health hardship classification.
  2. Verify if Display & Video 360 (DV360) applies identical restrictions to YouTube health campaign targeting.

---

### Policy 3: `RX-GOOG-PDS-01` (v1 Draft)
* **Title:** Google certification requirements for prescription drug services and telemedicine prescribing
* **Platform:** Google Ads | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `CREDENTIALS_LICENSING`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://support.google.com/adspolicy/answer/176031`
* **Operational Summary:** Services that prescribe, dispense, sell, or facilitate the online fulfillment of prescription drugs must obtain Google Healthcare certification and meet location-specific accreditation standards (such as LegitScript in the US). In-person clinics offering strictly in-person care are not certified as pharmacies, but clinics providing remote consultations with prescription services must obtain telemedicine certification.
* **Explicit Restrictions:**
  - Promoting online prescription fulfillment, mail-order pharmacies, or digital medication subscriptions without Google Healthcare Certification.
  - Advertising telemedicine consultations that dispense prescription drugs without required jurisdictional accreditation (e.g. LegitScript in the US, MOHAP in the UAE).
* **Concrete Exceptions:** Traditional physical medical practices, outpatient clinics, and diagnostic centers providing strictly in-person examinations without remote drug fulfillment, mail-order prescribing, or digital pharmacy services.
* **Advertiser Remediation:** If offering online prescription fulfillment or telemedicine prescribing, complete Google Healthcare and Medicines certification (and LegitScript accreditation for the US) before running campaigns. If operating an in-person clinical practice, ensure ad copy and landing pages clearly reflect physical consultation services rather than remote prescription dispensing.
* **Evidence Requirements:** Verified LegitScript certificate number or state telemedicine license, accompanied by approved Google Ads account certification ID.
* **Open Verification Questions for Admin A / B:**
  1. Confirm LegitScript requirements for US telemedicine clinics prescribing remotely.
  2. Verify UAE health authority documentation requirements for digital health and telemedicine prescribing.

---

### Policy 4: `RX-GOOG-RDT-01` (v1 Draft)
* **Title:** Restrictions on prescription drug brand names, active ingredients, and direct-to-consumer terms in Google Ads
* **Platform:** Google Ads | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `PRESCRIPTION_MEDICINE`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://support.google.com/adspolicy/answer/176031`
* **Operational Summary:** Prohibits prescription drug brand names and active ingredients in ad copy, headlines, keywords, and landing pages. Direct-to-Consumer (DTC) advertising is limited to certified manufacturers in the US, Canada (price/name only), and New Zealand; strictly prohibited in the UAE. Ordinary healthcare clinics cannot use prescription brand names in consumer ad copy.
* **Explicit Restrictions:**
  - Including prescription brand names (e.g., Botox, Ozempic, Wegovy, Retin-A) in Google Search headlines, description copy, or display URLs without manufacturer authorization.
  - Bidding on prescription drug terms as search keywords in countries prohibiting direct-to-consumer prescription drug marketing (including the UAE).
* **Concrete Exceptions:** Certified pharmaceutical manufacturers holding valid Google prescription drug advertising certification in jurisdictions where DTC advertising is legally permitted (such as the US).
* **Advertiser Remediation:** Remove prescription drug brand names and active pharmaceutical ingredients from ad copy, headlines, and keyword lists. Replace with generic procedural, specialty, or condition descriptions (e.g. "anti-wrinkle facial treatment" instead of branded neurotoxins; "clinical weight-management program" instead of branded GLP-1s).
* **Evidence Requirements:** Creative copy and keyword audit demonstrating complete absence of restricted prescription brand terms.
* **Open Verification Questions for Admin A / B:**
  1. Review US policy for clinic landing-page mentions vs ad copy headlines/text.
  2. Confirm UAE statutory prohibition on DTC prescription terms.
  3. Verify Canada price/name exception boundaries.

---

### Policy 5: `RX-TIKTOK-MC-01` (v1 Draft)
* **Title:** TikTok restrictions on misleading medical claims, absolute cure guarantees, and before/after comparisons
* **Platform:** TikTok | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `EFFICACY_CLAIM`
* **Restriction Level:** `PROHIBITED`
* **Official Source:** `https://ads.tiktok.com/help/article/tiktok-advertising-policies`
* **Operational Summary:** Prohibits exaggerated, false, or misleading medical claims, absolute outcome guarantees (e.g. "100% cure"), and distorted or unrepresentative before-and-after imagery. Mandatory 18+ age restrictions specifically apply to weight management, dieting, and fasting creatives.
* **Explicit Restrictions:**
  - Promising guaranteed medical outcomes or instant cures for incurable diseases.
  - Depicting dramatic or unrealistic before-and-after bodily comparisons conveying unachievable transformations.
  - Promoting rapid or unhealthy weight reduction (e.g. "Lose 15 lbs in 7 days").
  - Content encouraging negative body image or self-deprecating physical scrutiny.
* **Concrete Exceptions:** None. TikTok enforces strict platform safety standards across all health and wellness creatives.
* **Advertiser Remediation:** Remove absolute promises, guaranteed timelines, and exaggerated efficacy assertions from copy and video scripts. Eliminate dramatic or manipulated before-and-after visual comparisons. For weight management campaigns, configure 18+ audience targeting.
* **Evidence Requirements:** Video storyboard and creative asset audit confirming elimination of side-by-side comparisons, exaggerated claims, and body measurement comparisons.
* **Open Verification Questions for Admin A / B:**
  1. Check TikTok help article 10002871 regarding before-and-after video transitions for non-surgical aesthetic clinics.
  2. Confirm market-specific weight management age-gating rules.

---

### Policy 6: `RX-TIKTOK-HP-01` (v1 Draft)
* **Title:** TikTok healthcare and pharmaceuticals industry entry and market-specific qualification requirements
* **Platform:** TikTok | **Authority:** `PLATFORM_POLICY`
* **Jurisdiction:** `GLOBAL` | **Industry:** `HEALTHCARE` | **Category:** `PRESCRIPTION_MEDICINE`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://ads.tiktok.com/help/article/healthcare-and-pharmaceuticals-10003058`
* **Operational Summary:** Regulates healthcare, OTC medicines, medical devices, and clinic advertising through category-specific Industry Entry rules that vary by country. Prescription medicines are generally prohibited from standard self-serve advertising. Age-gating (18+) is mandated for specific restricted categories like weight management or cosmetic surgery. Regulated markets like the UAE require appropriate health authority licensing and advertising documentation prior to account authorization.
* **Explicit Restrictions:**
  - Promotion of prescription-only medicines on standard self-serve ad accounts without authorized platform approval.
  - Serving restricted health categories (such as weight management or cosmetic surgery) to audiences under 18 years old.
  - Running healthcare advertising in regulated markets without submitting required local health authority documentation.
* **Concrete Exceptions:** Varies by country; standard healthcare clinics may be permitted on self-serve accounts in certain jurisdictions upon documentation submission, while others require managed accounts.
* **Advertiser Remediation:** Check TikTok's country-specific industry entry table for the targeted market before campaign setup. Prepare valid clinic facility licenses and practitioner credentials. Where promoting weight management or cosmetic procedures, apply 18+ age targeting.
* **Evidence Requirements:** Valid healthcare facility operating license, physician credential, and local advertising permits (e.g. MOHAP/DHA in UAE) where required.
* **Open Verification Questions for Admin A / B:**
  1. Check exact country entry matrix for US vs UAE in Help Article 10003058.
  2. Confirm whether OTC self-serve vs managed account rules differ by country.
  3. Verify specific age-gating requirements by subcategory.
  4. Confirm UAE documentation accepted by TikTok (MOHAP vs DHA/DOH).

---

### Policy 7: `RX-US-FTC-CS-01` (v1 Draft)
* **Title:** FTC competent and reliable scientific evidence standard for healthcare and wellness claims
* **Platform:** None (Statutory Cross-Platform) | **Authority:** `REGULATION`
* **Jurisdiction:** `US` | **Industry:** `HEALTHCARE` | **Category:** `SUBSTANTIATION`
* **Restriction Level:** `RESTRICTED`
* **Official Source:** `https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance`
* **Operational Summary:** Under Sections 5 and 12 of the FTC Act and the FTC Health Products Compliance Guidance (December 2022), all objective health, wellness, and medical efficacy claims must be substantiated by competent and reliable scientific evidence (CARSE) prior to dissemination. The standard is flexible and determined by the *Pfizer* factors (including claim type, product nature, and consensus of qualified experts in the field). While disease treatment, cure, or serious prevention claims generally require well-controlled clinical testing, the FTC does not mandate randomized, double-blind, placebo-controlled RCTs for all health claims across the board.
* **Explicit Restrictions:**
  - Health, therapeutic, or medical efficacy claims made without prior possession of competent and reliable scientific evidence.
  - Express or implied claims of clinical proof or established health benefits that exceed the scientific consensus of supporting studies.
  - Extrapolating preliminary in vitro or animal findings to claim proven human health benefits when human clinical data is required by experts.
  - Relying on subjective consumer testimonials or anecdotal clinician reports to substantiate objective health claims.
* **Concrete Exceptions:** None. Substantiation must exist in the advertiser's possession *prior* to disseminating the claim.
* **Advertiser Remediation:** Audit health and wellness claims against available scientific documentation. Ensure claims are calibrated to the actual strength and scope of supporting evidence accepted by experts in the relevant field. If evidence is preliminary or limited, qualify the claim clearly or remove assertions of clinical proof.
* **Evidence Requirements:** Competent and reliable scientific evidence evaluated by qualified experts, with study design, methodology, sample size, and duration appropriate for the specific claim and product.
* **Open Verification Questions for Admin A / B:**
  1. Verify Pfizer factors application to clinic and wellness services.
  2. Verify when human clinical trials vs other recognized scientific methodologies satisfy CARSE.
  3. Confirm standards for qualifying preliminary health research.

---

### Policy 8: `RX-US-FTC-TE-01` (v1 Draft)
* **Title:** FTC requirements for healthcare testimonials, typicality disclosures, and material connections
* **Platform:** None (Statutory Cross-Platform) | **Authority:** `REGULATION`
* **Jurisdiction:** `US` | **Industry:** `HEALTHCARE` | **Category:** `TESTIMONIAL_ENDORSEMENT`
* **Restriction Level:** `DISCLOSURE_REQUIRED`
* **Official Source:** `https://www.ftc.gov/legal-library/browse/rules/endorsement-guides`
* **Operational Summary:** Under FTC Endorsement Guides (16 CFR Part 255), consumer testimonials must reflect representative results. If an endorser's outcome is not generally achievable, the ad must clearly disclose generally expected performance; boilerplate disclaimers like "results may vary" are legally ineffective (§ 255.2). Material connections (payment, free treatment, employment) must be clearly disclosed (§ 255.5).
* **Explicit Restrictions:**
  - Featuring patient testimonials depicting exceptional health or aesthetic outcomes without conspicuous disclosure of typical results.
  - Relying on disclaimers such as "Results not typical" or "Results may vary" to excuse atypical patient results (invalid under 16 CFR § 255.2).
  - Failing to clearly and prominently disclose financial relationships, gifted treatments, or clinic employment (violation of 16 CFR § 255.5).
* **Concrete Exceptions:** None. Clear and conspicuous disclosure is mandatory under federal regulation.
* **Advertiser Remediation:** When featuring dramatic patient transformations, add an unavoidable visual/auditory disclosure stating the generally expected clinical result supported by evidence. If the patient received free or discounted treatment, prominently add an unambiguous disclosure (e.g., `#PaidAd`, `Treatment provided courtesy of clinic`).
* **Evidence Requirements:** Written disclosure log for all patient testimonials and influencer partnerships, alongside clinical documentation proving the disclosed typical results.
* **Open Verification Questions for Admin A / B:**
  1. Confirm the 2023 revised Endorsement Guides standard for "clear and conspicuous" disclosures in vertical mobile video (TikTok / Instagram Reels).
  2. Verify requirements regarding employee reviews on clinic Google Business profiles and social media pages.

---

## 6. Implementation Safety & Rollback Verification

1. **Transactional Invariants:**
   - The entire import executes in a single interactive transaction (`prisma.$transaction`).
   - Pre-flight snapshot of database row counts is captured.
   - Post-write invariant check asserts:
     - `PolicySource`: +4 new rows
     - `PolicyRule`: +6 new rows
     - `PolicyRuleVersion`: +8 new rows (6 new v1 drafts + 2 proposed v2 drafts)
     - `PolicyRuleEvent`: +13 new events
   - If any count deviates, the transaction instantly rolls back.
2. **Rehearsal & Test Rollback:**
   - The test suite (`tests/policy-tier2-pack.test.ts`) validates that the post-write count validator detects mismatches and triggers rollbacks (`TIER2_IMPORT_TEST_ROLLBACK=1`).
3. **Draft Status Invariant:**
   - Script confirms that 0 imported or updated versions are in `status: "ACTIVE"` or `verificationStatus: "VERIFIED"`.
   - Script confirms that pre-existing source timestamps are completely untouched.
