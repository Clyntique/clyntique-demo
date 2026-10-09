import type { FindingAction, FindingSeverity, FindingStatus, ReviewOutcome } from "@/generated/prisma/enums";

// Display labels for the submission-review workflow. Database enum values never
// appear in the UI directly; only these labels do. Advertising platform and
// market names come from their reference tables (AdPlatform.name, Market.name).

export const REVIEW_OUTCOME_LABEL: Record<ReviewOutcome, string> = {
  NO_ISSUES_IDENTIFIED: "No issues identified",
  ISSUES_RESOLVED: "Issues resolved",
  COMPLETED_WITH_OPEN_ISSUES: "Completed with open issues",
  NOT_REVIEWABLE: "Not reviewable",
};

export const REVIEW_OUTCOME_DESCRIPTION: Record<ReviewOutcome, string> = {
  NO_ISSUES_IDENTIFIED: "The reviewer found no issues in the reviewed version, within the scope described.",
  ISSUES_RESOLVED: "Issues were raised, and the reviewer judged all of them resolved.",
  COMPLETED_WITH_OPEN_ISSUES: "The review closed with issues still unresolved.",
  NOT_REVIEWABLE: "The review could not be completed with what was provided.",
};

/** Shown with every review outcome. */
export const REVIEW_DISCLAIMER =
  "Internal human review only. Not legal advice, not government approval, and not acceptance by any advertising platform.";

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  ADVISORY: "Advisory",
};

export const SEVERITY_DESCRIPTION: Record<FindingSeverity, string> = {
  HIGH: "Must be addressed before the issues can be marked resolved.",
  MEDIUM: "Should be addressed; the reviewer may accept a documented rationale.",
  LOW: "Minor; may be accepted with a response.",
  ADVISORY: "For information only; does not block the review.",
};

/** Severity is the reviewer's assessment, never a legal classification. */
export const SEVERITY_CAPTION = "Reviewer-assessed severity";

export const REQUIRED_ACTION_LABEL: Record<FindingAction, string> = {
  REVISE_CONTENT: "Revise the creative",
  PROVIDE_EVIDENCE: "Provide evidence",
  CLARIFY: "Clarify",
  ACKNOWLEDGE: "Acknowledge",
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  RESPONDED: "Awaiting reviewer",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};
