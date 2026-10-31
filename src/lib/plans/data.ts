/**
 * Clyntique Review Plans & Add-ons Definition.
 *
 * Strictly illustrative sample data for prototype evaluation.
 * No payment gateways or live billing are connected.
 */

export interface ReviewPlan {
  id: "ai-only" | "ai-human";
  name: string;
  badge?: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number; // per month when billed annually
  turnaround: string;
  popular?: boolean;
  targetAudience: string;
  features: {
    text: string;
    included: boolean;
    highlight?: boolean;
    detail?: string;
  }[];
  ctaText: string;
  disclaimer: string;
}

export interface PlanAddon {
  id: string;
  name: string;
  tagline: string;
  price: number;
  unit: string;
  turnaround: string;
  description: string;
  badge?: string;
  benefits: string[];
  sampleUseCases: string[];
}

export interface PlanComparisonFeature {
  name: string;
  category: "Review Execution" | "Policy & Intelligence" | "Evidence & Audit" | "Turnaround & Support";
  aiOnly: string | boolean;
  aiHuman: string | boolean;
  addonAvailable?: boolean;
  description: string;
}

export const AI_ONLY_PLAN: ReviewPlan = {
  id: "ai-only",
  name: "AI-Only Review",
  badge: "High Velocity",
  tagline: "Instant automated compliance screening for performance creative teams",
  description:
    "Designed for high-frequency campaign iterations and rapid concept testing against platform advertising policies.",
  monthlyPrice: 199,
  annualPrice: 159,
  turnaround: "< 60 seconds",
  popular: false,
  targetAudience: "Growth marketers & performance agencies running high-volume creative variations",
  features: [
    { text: "Automated AI Policy Engine screening", included: true, highlight: true },
    { text: "Platform coverage: Meta, Google Ads & TikTok", included: true },
    { text: "Instant claim detection (efficacy, safety, pricing)", included: true },
    { text: "Substantiation & evidence requirements checklist", included: true },
    { text: "Unlimited creative draft scans", included: true },
    { text: "Preliminary compliance scan report download", included: true },
    { text: "Senior Regulatory Specialist human sign-off", included: false, detail: "Available via on-demand add-on ($49/review)" },
    { text: "Two-sided reviewer chat & customized remediation", included: false },
    { text: "Formal defense-ready Internal Review Record (PDF)", included: false },
    { text: "24-hour SLA review guarantee", included: false },
  ],
  ctaText: "Start AI-Only Plan",
  disclaimer: "Sample illustrative pricing · No billing or live payment processing connected",
};

export const AI_HUMAN_PLAN: ReviewPlan = {
  id: "ai-human",
  name: "AI + Human Review",
  badge: "Recommended · Defensible",
  tagline: "The dual-check standard: AI pre-scan paired with Senior Regulatory Specialist review",
  description:
    "The complete enterprise workflow for healthcare, medical aesthetics, and high-liability advertisers requiring verifiable defense.",
  monthlyPrice: 599,
  annualPrice: 479,
  turnaround: "Guaranteed 24-hour SLA",
  popular: true,
  targetAudience: "Regulated clinics, pharmaceutical brands, healthcare providers & agency compliance teams",
  features: [
    { text: "Everything in AI-Only Review", included: true, highlight: true },
    { text: "Senior Human Regulatory Specialist dual-review", included: true, highlight: true },
    { text: "Evidence verification & claim substantiation audit", included: true },
    { text: "Two-sided reviewer chat & direct remediation advice", included: true },
    { text: "Formal Internal Review Record with immutable timestamp", included: true },
    { text: "Print & PDF audit-ready export", included: true },
    { text: "Multi-jurisdiction review (US FTC/FDA & UAE MOHAP)", included: true },
    { text: "Up to 3 revisions included per submission round", included: true },
    { text: "Guaranteed 24-hour turnaround SLA", included: true },
    { text: "Dedicated account compliance manager", included: true },
  ],
  ctaText: "Start AI + Human Plan",
  disclaimer: "Sample illustrative pricing · No billing or live payment processing connected",
};

export const HUMAN_REVIEW_ADDON: PlanAddon = {
  id: "human-review-addon",
  name: "On-Demand Human Review Add-On",
  tagline: "Escalate any single high-stakes creative to a human regulatory specialist",
  price: 49,
  unit: "per creative review",
  turnaround: "24 hours",
  badge: "Flexible Escalation",
  description:
    "Add dedicated human review to any submission on the AI-Only plan, or purchase additional reviews for high-spend launch campaigns.",
  benefits: [
    "Full line-by-line inspection by a Senior Regulatory Specialist",
    "Evidence assessment: clinical studies, doctor credentials, and pricing disclosures",
    "Direct in-app remediation chat to unblock flagged claims quickly",
    "Formal Internal Review Record (Print/PDF) for client or legal archives",
    "No monthly commitment required: add only when stakes demand it",
  ],
  sampleUseCases: [
    "High-budget hero campaigns with bold efficacy or before/after claims",
    "Submissions targeting cross-border markets (e.g., UAE MOHAP advertising approval)",
    "Edge cases where AI policy coverage reports 'Manual review required'",
    "Final sign-off before executive or client brand director approval",
  ],
};

export const COMPARISON_FEATURES: PlanComparisonFeature[] = [
  // Review Execution
  {
    name: "Automated AI Policy Engine Scan",
    category: "Review Execution",
    aiOnly: "Instant (< 60s)",
    aiHuman: "Included (< 60s pre-scan)",
    description: "Deep multimodal analysis against verified advertising policies.",
  },
  {
    name: "Senior Human Regulatory Reviewer",
    category: "Review Execution",
    aiOnly: false,
    aiHuman: "Included (24h SLA)",
    addonAvailable: true,
    description: "Line-by-line verification by experienced compliance professionals.",
  },
  {
    name: "Claim Identification & Categories",
    category: "Review Execution",
    aiOnly: true,
    aiHuman: true,
    description: "Categorizes efficacy, safety, ingredient, pricing, and disclosure claims.",
  },
  {
    name: "Human Verification Sign-Off",
    category: "Review Execution",
    aiOnly: false,
    aiHuman: true,
    addonAvailable: true,
    description: "Official internal approval, changes requested, or clarification decision.",
  },

  // Policy & Intelligence
  {
    name: "Platform Advertising Standards",
    category: "Policy & Intelligence",
    aiOnly: "Meta, Google, TikTok",
    aiHuman: "Meta, Google, TikTok, Snapchat, X",
    description: "Monitors platform policies for restricted healthcare and aesthetics content.",
  },
  {
    name: "Government Regulatory Coverage",
    category: "Policy & Intelligence",
    aiOnly: "Preliminary checks",
    aiHuman: "US (FTC/FDA) & UAE (MOHAP/Media Council)",
    description: "Statutory rules for truth in advertising, credentials, and testimonials.",
  },
  {
    name: "Dual-Admin Verified Policy Rules",
    category: "Policy & Intelligence",
    aiOnly: true,
    aiHuman: true,
    description: "AI scans run strictly against rules verified by two human policy admins.",
  },

  // Evidence & Audit
  {
    name: "Evidence Attachment & Grounding",
    category: "Evidence & Audit",
    aiOnly: "Self-service checklist",
    aiHuman: "Verified by Reviewer",
    addonAvailable: true,
    description: "Upload clinical trials, studies, doctor licenses, and pricing terms.",
  },
  {
    name: "Two-Sided Reviewer Chat",
    category: "Evidence & Audit",
    aiOnly: false,
    aiHuman: true,
    addonAvailable: true,
    description: "Direct messaging thread attached to the creative between client and team.",
  },
  {
    name: "Formal Internal Review Record (PDF)",
    category: "Evidence & Audit",
    aiOnly: "Preliminary report only",
    aiHuman: "Full Defensible Record",
    addonAvailable: true,
    description: "Exportable audit artifact with claim-by-claim disposition and evidence keys.",
  },

  // Turnaround & Support
  {
    name: "Standard Turnaround Time",
    category: "Turnaround & Support",
    aiOnly: "< 60 seconds",
    aiHuman: "24 hours (Guaranteed SLA)",
    description: "Expected time from submission to complete review response.",
  },
  {
    name: "Revision Rounds Included",
    category: "Turnaround & Support",
    aiOnly: "Unlimited scans",
    aiHuman: "Up to 3 human rounds per submission",
    description: "Resubmission cycles supported under the standard plan quota.",
  },
  {
    name: "On-Demand Human Review Add-On",
    category: "Turnaround & Support",
    aiOnly: "$49 / review",
    aiHuman: "Included in quota",
    addonAvailable: true,
    description: "Option to buy additional single-review human escalations.",
  },
];

export const PRICING_FAQS = [
  {
    question: "What is the difference between AI-Only and AI + Human Review?",
    answer:
      "AI-Only Review runs your creative through Clyntique's AI Policy Engine in under a minute, flagging potential policy issues, missing disclosures, and required substantiation. AI + Human Review adds a Senior Regulatory Specialist who evaluates the creative in context, verifies attached scientific evidence, collaborates via direct reviewer chat, and issues a formal, defensible Internal Review Record with a 24-hour turnaround SLA.",
  },
  {
    question: "When should I use the On-Demand Human Review Add-On?",
    answer:
      "If you are on the AI-Only plan and encounter a complex claim, a high-budget hero campaign, or an ad flagged with 'Insufficient policy coverage — manual review required', you can escalate that specific creative to a human reviewer for an illustrative $49 without changing your monthly subscription.",
  },
  {
    question: "Does Clyntique guarantee official government clearance?",
    answer:
      "No. Clyntique provides rigorous internal compliance verification and defensible documentation. It does not provide legal advice or replace statutory approvals required by government bodies (such as the UAE Ministry of Health or US FDA).",
  },
  {
    question: "How does the 24-hour Human Review SLA work?",
    answer:
      "Once a creative is submitted with all required targeting and file assets, our human compliance team delivers an initial disposition (Approved, Changes Requested, or Clarification Needed) within 24 business hours.",
  },
  {
    question: "Is this live billing?",
    answer:
      "No. All pricing figures on this page are sample illustrative rates for our YC demo and pilot partner preview. No credit cards or payment processors are attached.",
  },
];
