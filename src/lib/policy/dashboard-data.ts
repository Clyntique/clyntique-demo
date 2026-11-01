/**
 * Clyntique Global Policy Dashboard Data & Domain Types.
 *
 * Illustrative prototype data modeling multi-jurisdictional compliance coverage,
 * dual-human policy admin verification, and platform advertising standards.
 */

export interface GlobalPolicyKPIs {
  totalMonitoredRules: number;
  verifiedActiveRules: number;
  awaitingVerification: number;
  draftResearchRules: number;
  monitoredPlatformsCount: number;
  monitoredJurisdictionsCount: number;
  trackedRegulatorsCount: number;
  overallCoverageScore: number; // e.g. 93.8%
}

export type CoverageStatus = "FULL" | "PARTIAL" | "MANUAL_REQUIRED";

export interface CellCoverage {
  marketCode: string;
  marketName: string;
  platformCode: string;
  platformName: string;
  industry: "HEALTHCARE" | "MEDICAL_AESTHETICS" | "GENERAL";
  status: CoverageStatus;
  verifiedRuleCount: number;
  pendingRuleCount: number;
  primaryAuthorities: string[];
  keyRequirements: string[];
  lastAudited: string;
}

export interface PendingReviewItem {
  id: string;
  ruleCode: string;
  title: string;
  authorityType: "REGULATION" | "PLATFORM_POLICY" | "INTERNAL_RISK";
  jurisdictionCode: string;
  platformCode: string;
  industry: "HEALTHCARE" | "MEDICAL_AESTHETICS" | "GENERAL";
  category: string;
  proposedBy: string;
  submittedAt: string;
  verificationStage: "AWAITING_VERIFIER" | "AWAITING_APPROVER" | "RESEARCH_DRAFT";
  openQuestions?: string[];
}

export interface TrackedAuthority {
  id: string;
  name: string;
  jurisdiction: string;
  type: "GOVERNMENT_REGULATOR" | "ADVERTISING_COUNCIL" | "PLATFORM_STANDARDS";
  officialUrl: string;
  rulesTrackedCount: number;
  recentStatusNote: string;
  lastUpdated: string;
}

export interface RegulatoryUpdateEvent {
  id: string;
  date: string;
  jurisdiction: string;
  authority: string;
  title: string;
  summary: string;
  impactLevel: "HIGH" | "MEDIUM" | "INFO";
  actionRequired: string;
}

export const GLOBAL_POLICY_KPIS: GlobalPolicyKPIs = {
  totalMonitoredRules: 48,
  verifiedActiveRules: 34,
  awaitingVerification: 8,
  draftResearchRules: 6,
  monitoredPlatformsCount: 6,
  monitoredJurisdictionsCount: 5,
  trackedRegulatorsCount: 8,
  overallCoverageScore: 94.2,
};

export const MONITORED_PLATFORMS = [
  { code: "META", name: "Meta (FB / IG)", icon: "meta", description: "Facebook & Instagram Advertising Policies" },
  { code: "GOOGLE", name: "Google Ads", icon: "google", description: "Healthcare & Medicines Advertising Standards" },
  { code: "TIKTOK", name: "TikTok Ads", icon: "tiktok", description: "TikTok Commercial Content Policy" },
  { code: "SNAPCHAT", name: "Snapchat", icon: "snapchat", description: "Health & Wellness Creative Guidelines" },
  { code: "LINKEDIN", name: "LinkedIn Ads", icon: "linkedin", description: "Professional & B2B Medical Marketing" },
  { code: "X", name: "X (Twitter)", icon: "x", description: "Prohibited & Restricted Healthcare Content" },
];

export const MONITORED_JURISDICTIONS = [
  { code: "US", name: "United States", flag: "🇺🇸", authorities: ["FTC", "FDA", "NAD"] },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", authorities: ["MOHAP", "EDE", "UAE Media Council", "DHA"] },
  { code: "EU", name: "European Union", flag: "🇪🇺", authorities: ["EMA", "EASA"] },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", authorities: ["ASA / CAP", "MHRA"] },
  { code: "GLOBAL", name: "Global Standard", flag: "🌐", authorities: ["Platform Directives"] },
];

export const COVERAGE_MATRIX_CELLS: CellCoverage[] = [
  // United States
  {
    marketCode: "US",
    marketName: "United States",
    platformCode: "META",
    platformName: "Meta (FB / IG)",
    industry: "HEALTHCARE",
    status: "FULL",
    verifiedRuleCount: 7,
    pendingRuleCount: 1,
    primaryAuthorities: ["Meta Advertising Standards", "FTC 16 CFR § 255"],
    keyRequirements: ["Age gating 18+ for weight loss", "No direct assertion of personal medical conditions", "Disclosed material connections"],
    lastAudited: "2026-10-28",
  },
  {
    marketCode: "US",
    marketName: "United States",
    platformCode: "META",
    platformName: "Meta (FB / IG)",
    industry: "MEDICAL_AESTHETICS",
    status: "FULL",
    verifiedRuleCount: 6,
    pendingRuleCount: 1,
    primaryAuthorities: ["Meta Advertising Standards"],
    keyRequirements: ["No side-by-side weight loss before/after images", "Cosmetic surgery restricted to 18+", "No pinched fat close-ups"],
    lastAudited: "2026-10-27",
  },
  {
    marketCode: "US",
    marketName: "United States",
    platformCode: "GOOGLE",
    platformName: "Google Ads",
    industry: "HEALTHCARE",
    status: "FULL",
    verifiedRuleCount: 5,
    pendingRuleCount: 1,
    primaryAuthorities: ["Google Ads Policy", "FDA"],
    keyRequirements: ["Prescription medication certification required", "No personalized ad retargeting on health conditions"],
    lastAudited: "2026-10-26",
  },
  {
    marketCode: "US",
    marketName: "United States",
    platformCode: "TIKTOK",
    platformName: "TikTok Ads",
    industry: "MEDICAL_AESTHETICS",
    status: "PARTIAL",
    verifiedRuleCount: 4,
    pendingRuleCount: 2,
    primaryAuthorities: ["TikTok Advertising Policy", "FTC Guides"],
    keyRequirements: ["Cosmetic surgery ads require sales rep escalation and 18+ targeting", "Mandatory risk warning caption"],
    lastAudited: "2026-10-25",
  },

  // United Arab Emirates
  {
    marketCode: "AE",
    marketName: "United Arab Emirates",
    platformCode: "META",
    platformName: "Meta (FB / IG)",
    industry: "HEALTHCARE",
    status: "FULL",
    verifiedRuleCount: 5,
    pendingRuleCount: 1,
    primaryAuthorities: ["MOHAP UAE", "UAE Media Council", "Meta Standards"],
    keyRequirements: ["Prior health authority advertising permit mandatory", "Healthcare facility license number displayed"],
    lastAudited: "2026-10-29",
  },
  {
    marketCode: "AE",
    marketName: "United Arab Emirates",
    platformCode: "META",
    platformName: "Meta (FB / IG)",
    industry: "MEDICAL_AESTHETICS",
    status: "PARTIAL",
    verifiedRuleCount: 4,
    pendingRuleCount: 2,
    primaryAuthorities: ["MOHAP Cabinet Res. 23/2020", "EDE", "UAE Media Council"],
    keyRequirements: ["No flash sale discounts on surgery", "No before-and-after photo manipulation", "Registered clinic permit"],
    lastAudited: "2026-10-29",
  },
  {
    marketCode: "AE",
    marketName: "United Arab Emirates",
    platformCode: "GOOGLE",
    platformName: "Google Ads",
    industry: "HEALTHCARE",
    status: "FULL",
    verifiedRuleCount: 4,
    pendingRuleCount: 1,
    primaryAuthorities: ["Google Ads Policy UAE", "MOHAP"],
    keyRequirements: ["Country-specific healthcare advertiser certification", "Strict prohibition on unapproved OTC remedies"],
    lastAudited: "2026-10-24",
  },
  {
    marketCode: "AE",
    marketName: "United Arab Emirates",
    platformCode: "TIKTOK",
    platformName: "TikTok Ads",
    industry: "MEDICAL_AESTHETICS",
    status: "MANUAL_REQUIRED",
    verifiedRuleCount: 2,
    pendingRuleCount: 2,
    primaryAuthorities: ["TikTok MENAP Policy", "UAE Media Council"],
    keyRequirements: ["TikTok MENAP direct authorization needed", "Local health license verification mandatory"],
    lastAudited: "2026-10-23",
  },

  // European Union
  {
    marketCode: "EU",
    marketName: "European Union",
    platformCode: "META",
    platformName: "Meta (FB / IG)",
    industry: "HEALTHCARE",
    status: "FULL",
    verifiedRuleCount: 4,
    pendingRuleCount: 0,
    primaryAuthorities: ["EU Directive 2001/83/EC", "Meta EU Standards"],
    keyRequirements: ["Direct-to-consumer advertising of Rx strictly prohibited", "CE mark disclosure for medical devices"],
    lastAudited: "2026-10-22",
  },
  {
    marketCode: "EU",
    marketName: "European Union",
    platformCode: "GOOGLE",
    platformName: "Google Ads",
    industry: "HEALTHCARE",
    status: "FULL",
    verifiedRuleCount: 4,
    pendingRuleCount: 0,
    primaryAuthorities: ["Google EU Healthcare Policy", "EMA"],
    keyRequirements: ["Pharmacy online certification", "Cross-border health advertising restrictions"],
    lastAudited: "2026-10-21",
  },

  // United Kingdom
  {
    marketCode: "GB",
    marketName: "United Kingdom",
    platformCode: "META",
    platformName: "Meta (FB / IG)",
    industry: "MEDICAL_AESTHETICS",
    status: "FULL",
    verifiedRuleCount: 5,
    pendingRuleCount: 1,
    primaryAuthorities: ["ASA / CAP Code Section 12", "Meta UK Guidelines"],
    keyRequirements: ["Botox and POM cosmetic injectables cannot be advertised to consumers", "Realistic depictions only"],
    lastAudited: "2026-10-25",
  },
  {
    marketCode: "GB",
    marketName: "United Kingdom",
    platformCode: "TIKTOK",
    platformName: "TikTok Ads",
    industry: "HEALTHCARE",
    status: "PARTIAL",
    verifiedRuleCount: 3,
    pendingRuleCount: 1,
    primaryAuthorities: ["ASA CAP Guidance", "TikTok UK Policy"],
    keyRequirements: ["Weight reduction claims must be backed by documented clinical substantiation", "18+ restriction"],
    lastAudited: "2026-10-20",
  },
];

export const PENDING_REVIEW_RULES: PendingReviewItem[] = [
  {
    id: "rev-1",
    ruleCode: "RX-AE-MOHAP-01",
    title: "Healthcare and Medical Product Advertisement Pre-Approval",
    authorityType: "REGULATION",
    jurisdictionCode: "AE",
    platformCode: "ALL",
    industry: "HEALTHCARE",
    category: "Credentials and licensing",
    proposedBy: "Dr. L. Al-Mansoori (Regulatory Counsel)",
    submittedAt: "2026-10-28T14:30:00Z",
    verificationStage: "AWAITING_APPROVER",
    openQuestions: [
      "Confirm advertising approval transition from MOHAP to Emirates Drug Establishment (EDE) effective late 2025/2026.",
      "Verify whether DHA (Dubai) or DOH (Abu Dhabi) permits suffice independently.",
    ],
  },
  {
    id: "rev-2",
    ruleCode: "RX-AE-MEDIA-01",
    title: "UAE Media Council Advertiser Permit Mandate",
    authorityType: "REGULATION",
    jurisdictionCode: "AE",
    platformCode: "ALL",
    industry: "GENERAL",
    category: "Credentials and licensing",
    proposedBy: "K. Vance (Policy Admin)",
    submittedAt: "2026-10-28T15:15:00Z",
    verificationStage: "AWAITING_VERIFIER",
    openQuestions: [
      "Confirm Advertiser Permit Guide 2025 requirements for agency vs brand influencer accounts.",
    ],
  },
  {
    id: "rev-3",
    ruleCode: "RX-US-FTC-HP-01",
    title: "Competent and Reliable Scientific Evidence for Health Claims",
    authorityType: "REGULATION",
    jurisdictionCode: "US",
    platformCode: "ALL",
    industry: "HEALTHCARE",
    category: "Substantiation",
    proposedBy: "S. Miller (Legal Analyst)",
    submittedAt: "2026-10-27T11:00:00Z",
    verificationStage: "AWAITING_APPROVER",
    openQuestions: [
      "Review sample FTC randomized controlled trial benchmarks for non-Rx dietary supplements.",
    ],
  },
  {
    id: "rev-4",
    ruleCode: "RX-TT-CS-01",
    title: "Cosmetic Surgery Conditions and Age Restrictions",
    authorityType: "PLATFORM_POLICY",
    jurisdictionCode: "US",
    platformCode: "TIKTOK",
    industry: "MEDICAL_AESTHETICS",
    category: "Restricted procedures",
    proposedBy: "A. Patel (Platform Lead)",
    submittedAt: "2026-10-27T09:45:00Z",
    verificationStage: "AWAITING_VERIFIER",
    openQuestions: [
      "Confirm whether TikTok requires dedicated sales representative approval in the US for non-invasive aesthetics.",
    ],
  },
  {
    id: "rev-5",
    ruleCode: "RX-META-HW-02",
    title: "Before and After Weight Loss & Invasive Imagery Restrictions",
    authorityType: "PLATFORM_POLICY",
    jurisdictionCode: "ALL",
    platformCode: "META",
    industry: "HEALTHCARE",
    category: "Before and after images",
    proposedBy: "A. Patel (Platform Lead)",
    submittedAt: "2026-10-26T16:20:00Z",
    verificationStage: "RESEARCH_DRAFT",
    openQuestions: [
      "Cross-examine difference between weight-loss side-by-sides (prohibited) vs dermatological skin rejuvenation (restricted to 18+).",
    ],
  },
];

export const TRACKED_REGULATORY_AUTHORITIES: TrackedAuthority[] = [
  {
    id: "auth-ftc",
    name: "Federal Trade Commission (FTC)",
    jurisdiction: "United States",
    type: "GOVERNMENT_REGULATOR",
    officialUrl: "https://www.ftc.gov/business-guidance/advertising-marketing",
    rulesTrackedCount: 12,
    recentStatusNote: "Updated Health Products Compliance Guidance & 16 CFR Part 465 (Fake Reviews)",
    lastUpdated: "2026-10-18",
  },
  {
    id: "auth-mohap",
    name: "Ministry of Health & Prevention (MOHAP)",
    jurisdiction: "United Arab Emirates",
    type: "GOVERNMENT_REGULATOR",
    officialUrl: "https://www.mohap.gov.ae/en/services/health-advertisement-licensing",
    rulesTrackedCount: 9,
    recentStatusNote: "Medical product promotion oversight coordinated with Emirates Drug Establishment (EDE)",
    lastUpdated: "2026-10-24",
  },
  {
    id: "auth-uae-media",
    name: "UAE Media Council",
    jurisdiction: "United Arab Emirates",
    type: "GOVERNMENT_REGULATOR",
    officialUrl: "https://uaemc.gov.ae/en/services/advertiser-permit",
    rulesTrackedCount: 6,
    recentStatusNote: "Advertiser Permit compliance enforced across commercial influencer and social channels",
    lastUpdated: "2026-10-15",
  },
  {
    id: "auth-meta",
    name: "Meta Advertising Standards",
    jurisdiction: "Global",
    type: "PLATFORM_STANDARDS",
    officialUrl: "https://www.facebook.com/policies_center/ads",
    rulesTrackedCount: 14,
    recentStatusNote: "Strict enforcement on personal health attributes and age-gated cosmetic procedures",
    lastUpdated: "2026-10-27",
  },
  {
    id: "auth-google",
    name: "Google Ads Healthcare Policy",
    jurisdiction: "Global",
    type: "PLATFORM_STANDARDS",
    officialUrl: "https://support.google.com/adspolicy/answer/176031",
    rulesTrackedCount: 11,
    recentStatusNote: "Prescription terms restrict bidding and ad copy without pharmaceutical certs",
    lastUpdated: "2026-10-22",
  },
  {
    id: "auth-tiktok",
    name: "TikTok Commercial Content Policy",
    jurisdiction: "Global",
    type: "PLATFORM_STANDARDS",
    officialUrl: "https://www.tiktok.com/legal/page/row/commercial-terms/en",
    rulesTrackedCount: 8,
    recentStatusNote: "Restricted cosmetic procedures policy require sales rep sign-off & warning captions",
    lastUpdated: "2026-10-20",
  },
];

export const RECENT_REGULATORY_UPDATES: RegulatoryUpdateEvent[] = [
  {
    id: "up-1",
    date: "2026-10-28",
    jurisdiction: "United Arab Emirates",
    authority: "MOHAP / EDE",
    title: "Medical Advertising Competency Mandate",
    summary:
      "Clarification issued regarding advertising approvals: promotion of pharmaceutical and aesthetic drugs now under EDE jurisdiction, facility licenses remain under MOHAP/DHA.",
    impactLevel: "HIGH",
    actionRequired: "Updating rule RX-AE-MOHAP-01 citations and verification guidelines.",
  },
  {
    id: "up-2",
    date: "2026-10-21",
    jurisdiction: "United States",
    authority: "FTC",
    title: "Consumer Review Fairness & Testimonial Scrutiny",
    summary:
      "FTC issued warning letters on social media influencers failing to disclose clear sponsorship tags above the fold in short-form video reels.",
    impactLevel: "MEDIUM",
    actionRequired: "Substantiation checklist rule RX-US-FTC-EN-01 enforced in AI video pre-scan.",
  },
  {
    id: "up-3",
    date: "2026-10-15",
    jurisdiction: "Global",
    authority: "Meta Ads Policy",
    title: "Before/After Imagery Enforcement Enhancement",
    summary:
      "Automated rejection models deployed across Instagram Stories targeting drastic weight reduction comparisons. Non-invasive skincare retains 18+ conditional exemption.",
    impactLevel: "HIGH",
    actionRequired: "Rule RX-META-HW-02 active in policy engine; human review required for ambiguous dermatology claims.",
  },
];


// ---------------------------------------------------------------------------
// Granular Global Policy Rules with Source Links, Version History & Audits
// ---------------------------------------------------------------------------

export interface GlobalPolicyRuleDetail {
  code: string;
  title: string;
  platformCode: string;
  platformName: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  industry: "HEALTHCARE" | "MEDICAL_AESTHETICS" | "GENERAL";
  category: string;
  authorityName: string;
  authorityType: "REGULATION" | "PLATFORM_POLICY" | "INTERNAL_RISK";
  verificationStatus: "VERIFIED_ACTIVE" | "PENDING_VERIFICATION" | "UNVERIFIED_DRAFT";
  isUsableByAI: boolean;
  isIllustrativeSample: boolean;
  summary: string;
  legalExplanation: string;
  remediationAction: string;
  sourceLinks: { title: string; url: string; citation: string }[];
  versionHistory: { versionNumber: number; status: string; date: string; author: string; notes: string }[];
  lastCheckedDate: string;
  pendingUpdatesNote?: string;
}

export const ALL_GLOBAL_POLICIES: GlobalPolicyRuleDetail[] = [
  {
    code: "RX-META-HW-01",
    title: "Weight Loss and Cosmetic Procedures Age Gating (18+)",
    platformCode: "META",
    platformName: "Meta (Facebook & Instagram)",
    jurisdictionCode: "GLOBAL",
    jurisdictionName: "Global Platform Standard",
    industry: "HEALTHCARE",
    category: "Targeting restrictions",
    authorityName: "Meta Advertising Standards",
    authorityType: "PLATFORM_POLICY",
    verificationStatus: "VERIFIED_ACTIVE",
    isUsableByAI: true,
    isIllustrativeSample: false,
    summary: "Ads promoting weight loss products, dietary supplements, and cosmetic procedures must be targeted exclusively to users aged 18 and older.",
    legalExplanation: "Meta strictly restricts content related to physical appearance and body modification to adult audiences to protect minors from unrealistic body standards.",
    remediationAction: "Update ad set targeting in Meta Ads Manager to restrict minimum age to 18+.",
    sourceLinks: [
      {
        title: "Meta Health and Wellness Policy",
        url: "https://www.facebook.com/policies_center/ads/health_and_wellness",
        citation: "Meta Business Advertising Policies § Health and Wellness",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "ACTIVE", date: "2026-10-15", author: "A. Patel (Platform Lead)", notes: "Initial verified baseline version." },
    ],
    lastCheckedDate: "2026-10-27",
  },
  {
    code: "RX-META-HW-02",
    title: "Prohibition of Drastic Before-and-After Weight Loss Imagery",
    platformCode: "META",
    platformName: "Meta (Facebook & Instagram)",
    jurisdictionCode: "GLOBAL",
    jurisdictionName: "Global Platform Standard",
    industry: "HEALTHCARE",
    category: "Before and after images",
    authorityName: "Meta Advertising Standards",
    authorityType: "PLATFORM_POLICY",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "Ads must not depict side-by-side weight loss comparisons, pinched fat close-ups, or negative body image depictions.",
    legalExplanation: "Side-by-side weight loss images generate high negative feedback and violate Meta's personal health attribute and sensational content guidelines.",
    remediationAction: "Replace split before-and-after comparison imagery with lifestyle shots focusing on healthy habits without body measurements.",
    sourceLinks: [
      {
        title: "Meta Personal Health Policies",
        url: "https://www.facebook.com/policies_center/ads/personal_health",
        citation: "Meta Ad Standards § Personal Health Attributes",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-26", author: "A. Patel (Platform Lead)", notes: "Research draft staged from policy pack. Awaiting dual-admin verification." },
    ],
    lastCheckedDate: "2026-10-26",
    pendingUpdatesNote: "Cross-examining distinction between weight loss side-by-sides (prohibited) vs non-invasive dermatological rejuvenation (18+ restricted).",
  },
  {
    code: "RX-META-PA-01",
    title: "Prohibition on Asserting or Implying Personal Health Attributes",
    platformCode: "META",
    platformName: "Meta (Facebook & Instagram)",
    jurisdictionCode: "GLOBAL",
    jurisdictionName: "Global Platform Standard",
    industry: "GENERAL",
    category: "Personal health attributes",
    authorityName: "Meta Advertising Standards",
    authorityType: "PLATFORM_POLICY",
    verificationStatus: "VERIFIED_ACTIVE",
    isUsableByAI: true,
    isIllustrativeSample: false,
    summary: "Ad copy and creative must not assert or imply that the viewer has a specific medical condition, disability, or physical flaw (e.g. 'Struggling with acne?').",
    legalExplanation: "Meta prohibits predatory targeting based on sensitive personal health attributes under FTC and GDPR privacy compliance frameworks.",
    remediationAction: "Rephrase second-person direct assertions ('Do you have diabetes?') to product-focused or experiential statements ('Innovative management options').",
    sourceLinks: [
      {
        title: "Meta Personal Attributes Policy",
        url: "https://www.facebook.com/policies_center/ads/personal_attributes",
        citation: "Meta Ad Standards § 4.3 Personal Attributes",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "ACTIVE", date: "2026-10-18", author: "K. Vance (Policy Admin)", notes: "Approved by two policy admins for active AI scanning." },
    ],
    lastCheckedDate: "2026-10-25",
  },
  {
    code: "RX-GOOG-HM-01",
    title: "Prescription Medicine & Online Prescribing Certification",
    platformCode: "GOOGLE",
    platformName: "Google Ads",
    jurisdictionCode: "GLOBAL",
    jurisdictionName: "Global Platform Standard",
    industry: "HEALTHCARE",
    category: "Prescription medicines",
    authorityName: "Google Ads Policy",
    authorityType: "PLATFORM_POLICY",
    verificationStatus: "VERIFIED_ACTIVE",
    isUsableByAI: true,
    isIllustrativeSample: false,
    summary: "Prescription medicine terms and online pharmacy promotions require Google healthcare certification and legitimacy check.",
    legalExplanation: "Google prevents illegal prescription drug trafficking and off-label promotion across search and YouTube advertising channels.",
    remediationAction: "Obtain LegitScript or Google Healthcare Advertiser certificate before bidding on prescription brand names.",
    sourceLinks: [
      {
        title: "Google Ads Healthcare and Medicines Policy",
        url: "https://support.google.com/adspolicy/answer/176031",
        citation: "Google Advertising Policies § Healthcare",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "ACTIVE", date: "2026-10-16", author: "S. Miller (Legal Analyst)", notes: "Active rule covering Google search and display campaigns." },
    ],
    lastCheckedDate: "2026-10-24",
  },
  {
    code: "RX-TT-CS-01",
    title: "Cosmetic Surgery Conditions and Age Restrictions",
    platformCode: "TIKTOK",
    platformName: "TikTok Ads",
    jurisdictionCode: "US",
    jurisdictionName: "United States",
    industry: "MEDICAL_AESTHETICS",
    category: "Restricted procedures",
    authorityName: "TikTok Commercial Content Policy",
    authorityType: "PLATFORM_POLICY",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "Cosmetic surgery advertising requires direct TikTok sales representative approval, 18+ age gating, and mandatory health warning captions.",
    legalExplanation: "TikTok restricts invasive aesthetic procedures to protect teenage users and requires verified medical credentials from licensed clinics.",
    remediationAction: "Include visible statutory disclaimer: 'Results vary. Seek consultation from a licensed medical specialist.' and restrict audience to 18+.",
    sourceLinks: [
      {
        title: "TikTok Commercial Advertising Terms",
        url: "https://www.tiktok.com/legal/page/row/commercial-terms/en",
        citation: "TikTok Ad Policy § Restricted Businesses & Cosmetic Procedures",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-27", author: "A. Patel (Platform Lead)", notes: "Research draft staged; illustrative prototype scope." },
    ],
    lastCheckedDate: "2026-10-27",
    pendingUpdatesNote: "Illustrative sample: cosmetic procedure restrictions under review.",
  },
  {
    code: "RX-US-FTC-HP-01",
    title: "Competent and Reliable Scientific Evidence for Health Claims",
    platformCode: "ALL",
    platformName: "All Platforms (Regulatory)",
    jurisdictionCode: "US",
    jurisdictionName: "United States",
    industry: "HEALTHCARE",
    category: "Substantiation",
    authorityName: "Federal Trade Commission (FTC)",
    authorityType: "REGULATION",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "Health, efficacy, and therapeutic claims in advertising must be substantiated by competent and reliable scientific evidence prior to dissemination.",
    legalExplanation: "FTC Section 5 enforcement actions penalize deceptive health marketing when claims are not supported by randomized controlled clinical trials.",
    remediationAction: "Attach clinical study DOI or FDA clearance documentation to the creative evidence tab before publishing efficacy claims.",
    sourceLinks: [
      {
        title: "FTC Health Products Compliance Guidance",
        url: "https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance",
        citation: "FTC Business Guidance (Dec 2022) § Efficacy Substantiation Standard",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-27", author: "S. Miller (Legal Analyst)", notes: "Submitted for second-admin verification; illustrative prototype scope." },
    ],
    lastCheckedDate: "2026-10-27",
    pendingUpdatesNote: "Reviewing sample FTC trial benchmarks for non-Rx dietary supplements.",
  },
  {
    code: "RX-US-FTC-EN-01",
    title: "Honest Endorsements and Material Connection Disclosures",
    platformCode: "ALL",
    platformName: "All Platforms (Regulatory)",
    jurisdictionCode: "US",
    jurisdictionName: "United States",
    industry: "GENERAL",
    category: "Testimonials and endorsements",
    authorityName: "Federal Trade Commission (FTC)",
    authorityType: "REGULATION",
    verificationStatus: "VERIFIED_ACTIVE",
    isUsableByAI: true,
    isIllustrativeSample: false,
    summary: "Testimonials must reflect honest opinions and disclose material connections (paid sponsorship, free treatment, employment) prominently.",
    legalExplanation: "FTC 16 CFR § 255 requires clear and conspicuous disclosure that cannot be hidden below the fold or in buried hashtags.",
    remediationAction: "Include visible #Ad or 'Paid Partnership' badge in the first 3 lines of video captions and on-screen overlay.",
    sourceLinks: [
      {
        title: "FTC Guides Concerning the Use of Endorsements and Testimonials",
        url: "https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking",
        citation: "16 CFR Part 255 § Endorsement Guides",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "ACTIVE", date: "2026-10-20", author: "K. Vance (Policy Admin)", notes: "Verified and active in AI scan engine." },
    ],
    lastCheckedDate: "2026-10-28",
  },
  {
    code: "RX-GB-ASA-01",
    title: "CAP Code Rule 12.1: Objective Claims for Medicines & Treatments",
    platformCode: "ALL",
    platformName: "All Platforms (UK Statutory)",
    jurisdictionCode: "GB",
    jurisdictionName: "United Kingdom",
    industry: "HEALTHCARE",
    category: "Substantiation & licensing",
    authorityName: "Advertising Standards Authority (ASA) / CAP",
    authorityType: "REGULATION",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "Objective claims must be backed by evidence, if relevant consisting of trials conducted on people. Medicinal or medical claims and claims for medical devices may be made only for a medicinal product or device that is appropriately licensed.",
    legalExplanation: "CAP Code Section 12 mandates stringent clinical substantiation for human health claims and strictly prohibits misleading medical claims.",
    remediationAction: "Ensure CE/UKCA marking and MHRA authorization are explicitly stated and referenced in compliance documentation.",
    sourceLinks: [
      {
        title: "ASA & CAP Rule 12: Medicines, medical devices, treatments and health",
        url: "https://www.asa.org.uk/type/non_broadcast/code_section/12.html",
        citation: "UK CAP Code § Rule 12.1 Objective Claims",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-21", author: "Regulatory Research", notes: "Illustrative research candidate staged. Not active or verified in production." },
    ],
    lastCheckedDate: "2026-10-28",
    pendingUpdatesNote: "Illustrative sample: UK statutory advertising codes (CAP Rule 12) under review for healthcare scope.",
  },
  {
    code: "RX-EU-MDR-01",
    title: "EU Medical Device Regulation (MDR) Ad Claims Substantiation",
    platformCode: "ALL",
    platformName: "All Platforms (EU Statutory)",
    jurisdictionCode: "EU",
    jurisdictionName: "European Union",
    industry: "HEALTHCARE",
    category: "Substantiation",
    authorityName: "European Medicines Agency (EMA) / EU MDR",
    authorityType: "REGULATION",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "In the promotion and advertising of devices, it is prohibited to use text, names, trademarks, pictures and figurative or other signs that may mislead the user or patient regarding the device's intended purpose, safety and performance.",
    legalExplanation: "Regulation (EU) 2017/745 Article 7 strictly prohibits misleading claims, creating false impressions, or failing to inform the user of likely risks.",
    remediationAction: "Verify intended purpose aligns strictly with EU MDR technical documentation and include mandatory risk contraindications.",
    sourceLinks: [
      {
        title: "Regulation (EU) 2017/745 on Medical Devices (MDR)",
        url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32017R0745",
        citation: "EU MDR 2017/745 Article 7 § Claims",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-22", author: "Regulatory Research", notes: "Illustrative research candidate staged. Not active or verified in production." },
    ],
    lastCheckedDate: "2026-10-26",
    pendingUpdatesNote: "Illustrative sample: EU MDR Article 7 medical device claims substantiation under review.",
  },
  {
    code: "RX-AE-MOHAP-01",
    title: "Healthcare and Medical Product Advertisement Pre-Approval",
    platformCode: "ALL",
    platformName: "All Platforms (UAE Regulatory)",
    jurisdictionCode: "AE",
    jurisdictionName: "United Arab Emirates",
    industry: "HEALTHCARE",
    category: "Credentials and licensing",
    authorityName: "Ministry of Health & Prevention (MOHAP) / EDE",
    authorityType: "REGULATION",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "All healthcare, clinic, and medical advertisements targeting the UAE must obtain prior authorization and display official permit numbers.",
    legalExplanation: "Federal Law No. 4 of 2015 and Cabinet Resolution No. 23 of 2020 mandate health media license issuance prior to distribution.",
    remediationAction: "Obtain advertising license from MOHAP or DHA (Dubai) and overlay the official approval code on creative end-cards.",
    sourceLinks: [
      {
        title: "MOHAP Health Advertisement Licensing Service",
        url: "https://www.mohap.gov.ae/en/services/health-advertisement-licensing",
        citation: "Cabinet Resolution No. 23 of 2020 § Media Advertisement Standards",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-28", author: "Regulatory Research", notes: "Draft staged. Illustrative prototype scope." },
    ],
    lastCheckedDate: "2026-10-28",
    pendingUpdatesNote: "Flagged: Emirates Drug Establishment (EDE) oversight mandate transition effective 2025/2026. Awaiting counsel verification.",
  },
  {
    code: "RX-AE-MEDIA-01",
    title: "UAE Media Council Commercial Advertiser Permit",
    platformCode: "ALL",
    platformName: "All Platforms (UAE Regulatory)",
    jurisdictionCode: "AE",
    jurisdictionName: "United Arab Emirates",
    industry: "GENERAL",
    category: "Credentials and licensing",
    authorityName: "UAE Media Council",
    authorityType: "REGULATION",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "Companies and influencers executing commercial advertisements in the UAE must hold an active UAE Media Council Advertiser Permit.",
    legalExplanation: "Federal Decree-Law No. 55 of 2023 on the Regulation of Media requires institutional advertiser registration.",
    remediationAction: "Verify that the publisher or promoting influencer holds a valid Media Council license number.",
    sourceLinks: [
      {
        title: "UAE Media Council Advertiser Permit Guide",
        url: "https://uaemc.gov.ae/en/services/advertiser-permit",
        citation: "UAE Media Council Regulations § Commercial Advertising",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-28", author: "Regulatory Research", notes: "Research draft staged. Illustrative prototype scope." },
    ],
    lastCheckedDate: "2026-10-28",
    pendingUpdatesNote: "Confirming advertiser permit requirements for foreign agencies promoting UAE clinics.",
  },
  {
    code: "RX-SNAP-HC-01",
    title: "Snapchat Healthcare and Dietary Supplement Targeting",
    platformCode: "SNAPCHAT",
    platformName: "Snapchat Ads",
    jurisdictionCode: "GLOBAL",
    jurisdictionName: "Global Platform Standard",
    industry: "HEALTHCARE",
    category: "Targeting restrictions",
    authorityName: "Snap Advertising Policies",
    authorityType: "PLATFORM_POLICY",
    verificationStatus: "UNVERIFIED_DRAFT",
    isUsableByAI: false,
    isIllustrativeSample: true,
    summary: "Ads promoting pharmaceuticals, medical treatments, and supplements must comply with local laws, restrict delivery to 18+, and avoid sensationalized wellness claims.",
    legalExplanation: "Snap restricts health products to adult users and disallows content that promotes body shaming, dramatic physical transformations, or unapproved supplements.",
    remediationAction: "Apply 18+ age targeting in Snap Ads Manager and avoid dramatic physiological before-and-after claims.",
    sourceLinks: [
      {
        title: "Snap Commercial & Advertising Policies",
        url: "https://www.snap.com/en-US/ad-policies",
        citation: "Snap Ad Policies § Health, Wellness, and Fitness",
      },
    ],
    versionHistory: [
      { versionNumber: 1, status: "DRAFT", date: "2026-10-28", author: "Regulatory Research", notes: "Research draft staged. Illustrative sample scope." },
    ],
    lastCheckedDate: "2026-10-28",
    pendingUpdatesNote: "Draft staged for Snap Ads v4 policies. Illustrative prototype sample only.",
  },
];
