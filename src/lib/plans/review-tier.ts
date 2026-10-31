/**
 * Review Tier Selection & Status Management.
 *
 * Allows clients to choose between AI-Only Review (automated, rapid pre-screening)
 * and Human Review (optional paid add-on / pilot quota, senior regulatory specialist dual check).
 *
 * Safe: encodes review tier cleanly within the creative workflow context without modifying
 * database schemas or executing live billing charges.
 */

export type ReviewTier = "AI_ONLY" | "HUMAN_REVIEW";

export interface ReviewTierDetails {
  tier: ReviewTier;
  label: string;
  badgeTone: "info" | "brand";
  isPaidAddon: boolean;
  statusLabel: string;
  statusDescription: string;
  slaText: string;
}

const TIER_TAG_REGEX = /\[Review Tier:\s*(AI_ONLY|HUMAN_REVIEW)\]/i;

export function parseReviewTier(context?: string | null): ReviewTier {
  if (!context) return "HUMAN_REVIEW"; // Default in pilot is full review
  const match = context.match(TIER_TAG_REGEX);
  if (!match) return "HUMAN_REVIEW";
  return match[1].toUpperCase() === "AI_ONLY" ? "AI_ONLY" : "HUMAN_REVIEW";
}

export function getReviewTierLabel(tier: ReviewTier): string {
  return tier === "AI_ONLY" ? "AI-Only Review" : "Human Review (Add-on)";
}

export function formatContextWithReviewTier(existingContext?: string | null, tier: ReviewTier = "HUMAN_REVIEW"): string {
  const clean = (existingContext ?? "").replace(TIER_TAG_REGEX, "").trim();
  const tag = `[Review Tier: ${tier}]`;
  return clean ? `${clean}\n\n${tag}` : tag;
}

export function getReviewTierDetails(tier: ReviewTier, submissionStatus: string = "DRAFT"): ReviewTierDetails {
  if (tier === "AI_ONLY") {
    let statusLabel = "AI Pre-Screening Active";
    let statusDescription = "Automated compliance checks running against verified platform advertising policies.";
    if (submissionStatus === "DRAFT") {
      statusLabel = "AI-Only Review Selected";
      statusDescription = "Instant automated policy verification upon submission. Human review not requested.";
    } else if (submissionStatus === "REVIEW_COMPLETE") {
      statusLabel = "AI Compliance Screening Complete";
      statusDescription = "Automated policy scan finished. Defensible human audit record was not requested.";
    }

    return {
      tier: "AI_ONLY",
      label: "AI-Only Review",
      badgeTone: "info",
      isPaidAddon: false,
      statusLabel,
      statusDescription,
      slaText: "< 60 seconds turnaround",
    };
  }

  // HUMAN_REVIEW
  let statusLabel = "Human Review Requested";
  let statusDescription = "Senior Regulatory Specialist assigned to verify claims, check evidence, and issue defensible audit record.";
  if (submissionStatus === "DRAFT") {
    statusLabel = "Human Review Selected (Add-On)";
    statusDescription = "Full dual-check review: automated scan + Senior Regulatory Specialist sign-off.";
  } else if (submissionStatus === "SUBMITTED") {
    statusLabel = "Awaiting Regulatory Reviewer";
    statusDescription = "In queue for line-by-line inspection and evidence verification by Clyntique review team.";
  } else if (submissionStatus === "IN_REVIEW") {
    statusLabel = "Being Reviewed by Regulatory Specialist";
    statusDescription = "A Senior Compliance Reviewer is actively evaluating claims, targeting, and evidence.";
  } else if (submissionStatus === "CHANGES_REQUESTED") {
    statusLabel = "Reviewer Feedback Shared";
    statusDescription = "The compliance reviewer identified findings that require your remediation.";
  } else if (submissionStatus === "REVIEW_COMPLETE") {
    statusLabel = "Human Regulatory Review Complete";
    statusDescription = "Formal Internal Review Record generated and signed off.";
  }

  return {
    tier: "HUMAN_REVIEW",
    label: "Human Review (Add-on)",
    badgeTone: "brand",
    isPaidAddon: true,
    statusLabel,
    statusDescription,
    slaText: "24-hour SLA guarantee",
  };
}
