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
  turnaround: "Automated scan (illustrative estimate)",
  popular: false,
  targetAudience: "Growth marketers & performance agencies running high-volume creative variations",
  features: [
    { text: "Automated AI Policy Engine screening", included: true, highlight: true },
    { text: "Platform coverage: Meta, Google Ads & TikTok", included: true },
    { text: "Instant claim detection (efficacy, safety, pricing)", included: true },
    { text: "Substantiation & evidence requirements checklist", included: true },
    { text: "Unlimited creative draft scans", included: true },
    { text: "Preliminary compliance scan report download", included: true },
    { text: "Senior Regulatory Specialist human sign-off", included: false, detail: "Available via optional add-on" },
    { text: "Two-sided reviewer chat & customized remediation", included: false },
    { text: "Formal defense-ready Internal Review Record (PDF)", included: false },
    { text: "Turnaround target (illustrative, non-guaranteed)", included: true, detail: "Subject to system availability" },
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
  turnaround: "Standard review queue (illustrative target)",
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
    { text: "Standard review queue target (illustrative, non-guaranteed)", included: true },
    { text: "Dedicated account compliance manager", included: true },
  ],
  ctaText: "Start AI + Human Plan",
  disclaimer: "Sample illustrative pricing · No billing or live payment processing connected",
};

export const HUMAN_REVIEW_ADDON: PlanAddon = {
  id: "human-review-addon",
  name: "Optional Human Review Add-On (Concept Prototype)",
  tagline: "Escalate any single high-stakes creative to a human regulatory specialist",
  price: 49,
  unit: "per creative review",
  turnaround: "Review queue target (illustrative)",
  badge: "Flexible Escalation",
  description:
    "Concept prototype for optional client-requested human review dual-check. Turnaround targets and pricing are illustrative sample estimates only; no purchases, assignments, or SLA commitments are guaranteed.",
  benefits: [
    "Line-by-line evaluation by a Senior Regulatory Specialist (subject to queue availability)",
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
    aiOnly: "Instant automated scan",
    aiHuman: "Included pre-scan",
    description: "Deep multimodal analysis against verified advertising policies.",
  },
  {
    name: "Senior Human Regulatory Reviewer",
    category: "Review Execution",
    aiOnly: false,
    aiHuman: "Included (standard queue)",
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
    name: "Turnaround Target (Illustrative)",
    category: "Turnaround & Support",
    aiOnly: "Automated scan (illustrative)",
    aiHuman: "Standard queue (illustrative)",
    description: "Estimated target for demonstration. Clyntique does not guarantee specific SLAs or binding commitments.",
  },
  {
    name: "Revision Rounds Included",
    category: "Turnaround & Support",
    aiOnly: "Unlimited scans",
    aiHuman: "Up to 3 human rounds per submission",
    description: "Resubmission cycles supported under the standard plan quota.",
  },
  {
    name: "Optional Human Review Add-On",
    category: "Turnaround & Support",
    aiOnly: "Illustrative option",
    aiHuman: "Included in quota",
    addonAvailable: true,
    description: "Option to request single-review human dual-check escalations.",
  },
];

export const PRICING_FAQS = [
  {
    question: "What is the difference between AI-Only and AI + Human Review?",
    answer:
      "AI-Only Review runs your creative through Clyntique's AI Policy Engine, flagging potential policy issues, missing disclosures, and required substantiation. AI + Human Review adds a Senior Regulatory Specialist who evaluates the creative in context, verifies attached scientific evidence, collaborates via direct reviewer chat, and issues a formal Internal Review Record with findings and remediation feedback.",
  },
  {
    question: "When should I use the Optional Human Review Add-On?",
    answer:
      "If you are on the AI-Only plan and encounter a complex claim, a high-budget hero campaign, or an ad flagged with 'Insufficient policy coverage — manual review required', you can request human review for that specific creative without changing your monthly subscription tier.",
  },
  {
    question: "Does Clyntique guarantee official government clearance?",
    answer:
      "No. Clyntique provides rigorous internal compliance verification and defensible documentation. It does not provide legal advice or replace statutory approvals required by government bodies (such as the UAE Ministry of Health or US FDA).",
  },
  {
    question: "Are turnaround times and review assignments guaranteed?",
    answer:
      "No. All turnaround targets and queue figures shown across the prototype are non-binding sample estimates for product demonstration only. Clyntique does not offer guaranteed turnaround SLAs, immediate reviewer assignments, or commercial warranties at this pilot stage.",
  },
  {
    question: "Is this live billing?",
    answer:
      "No. All pricing figures on this page are sample illustrative rates for our YC demo and pilot partner preview. No credit cards, payments, or purchases are processed.",
  },
];
