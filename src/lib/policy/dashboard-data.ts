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
