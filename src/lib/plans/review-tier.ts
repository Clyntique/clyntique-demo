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

export function stripReviewTier(context?: string | null): string {
  if (!context) return "";
  return context.replace(TIER_TAG_REGEX, "").trim();
}

export function parseReviewTier(context?: string | null): ReviewTier {
  if (!context) return "HUMAN_REVIEW"; // Default in pilot is full review
  const match = context.match(TIER_TAG_REGEX);
  if (!match) return "HUMAN_REVIEW";
  return match[1].toUpperCase() === "AI_ONLY" ? "AI_ONLY" : "HUMAN_REVIEW";
}

export function getReviewTierLabel(tier: ReviewTier): string {
  return tier === "AI_ONLY" ? "AI-Only Review" : "Human Review (Optional Add-on)";
}

export function formatContextWithReviewTier(existingContext?: string | null, tier: ReviewTier = "HUMAN_REVIEW"): string {
  const clean = stripReviewTier(existingContext);
  const tag = `[Review Tier: ${tier}]`;
  return clean ? `${clean}\n\n${tag}` : tag;
}

export function getReviewTierDetails(tier: ReviewTier, submissionStatus: string = "DRAFT"): ReviewTierDetails {
  if (tier === "AI_ONLY") {
    let statusLabel = "AI Automated Scan Selected";
    let statusDescription = "Automated compliance pre-screening against verified platform advertising policies.";
    if (submissionStatus === "DRAFT") {
      statusLabel = "AI-Only Review Selected";
      statusDescription = "Automated policy scan will execute upon submission. Human specialist review is not requested.";
    } else if (submissionStatus === "REVIEW_COMPLETE") {
      statusLabel = "AI Compliance Screening Complete";
      statusDescription = "Automated policy pre-scan completed. Human review dual-check was not selected.";
    }

    return {
      tier: "AI_ONLY",
      label: "AI-Only Review",
      badgeTone: "info",
      isPaidAddon: false,
      statusLabel,
      statusDescription,
      slaText: "Automated scan (illustrative target)",
    };
  }

  // HUMAN_REVIEW
  let statusLabel = "Human Review Requested";
  let statusDescription = "Senior Regulatory Specialist dual check requested (subject to queue availability / pilot quota).";
  if (submissionStatus === "DRAFT") {
    statusLabel = "Human Review Selected (Add-on Option)";
    statusDescription = "Dual-check requested: automated AI scan paired with Senior Regulatory Specialist review.";
  } else if (submissionStatus === "SUBMITTED") {
    statusLabel = "In Review Queue";
    statusDescription = "Queued for line-by-line inspection and evidence review by Clyntique compliance specialists.";
  } else if (submissionStatus === "IN_REVIEW") {
    statusLabel = "Being Evaluated by Regulatory Reviewer";
    statusDescription = "A compliance specialist is evaluating claims, targeting parameters, and attached evidence.";
  } else if (submissionStatus === "CHANGES_REQUESTED") {
    statusLabel = "Reviewer Feedback Shared";
    statusDescription = "The compliance reviewer identified findings that require your remediation.";
  } else if (submissionStatus === "REVIEW_COMPLETE") {
    statusLabel = "Human Regulatory Review Complete";
    statusDescription = "Formal Internal Review Record generated and signed off.";
  }

  return {
    tier: "HUMAN_REVIEW",
    label: "Human Review (Optional Add-on)",
    badgeTone: "brand",
    isPaidAddon: true,
    statusLabel,
    statusDescription,
    slaText: "Standard queue (illustrative target)",
  };
}
