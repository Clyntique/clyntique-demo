import type {
  ExternalDestinationType,
  ExternalOutcomeKind,
  ExternalRecordBasis,
  FindingAction,
  FindingSeverity,
  FindingStatus,
  ReviewCycleReason,
  ReviewOutcome,
} from "@/generated/prisma/enums";

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
  DISMISSED: "Withdrawn",
};

// ---------------------------------------------------------------------------
// Lifecycle records (Oct 19 sprint)

export const REVIEW_CYCLE_REASON_LABEL: Record<ReviewCycleReason, string> = {
  POLICY_CHANGE: "Policy rule changed",
  EXTERNAL_OUTCOME: "Platform or regulator outcome",
  CLIENT_UPDATE: "Client updated the creative",
  EVIDENCE_EXPIRED: "Evidence expired",
  TEAM_REQUEST: "Reviewer request",
};

export const EXTERNAL_DESTINATION_LABEL: Record<ExternalDestinationType, string> = {
  AD_PLATFORM: "Advertising platform",
  REGULATOR: "Regulator",
};

export const EXTERNAL_BASIS_LABEL: Record<ExternalRecordBasis, string> = {
  CLIENT_REPORTED: "Reported by the client, not independently verified",
  TEAM_VERIFIED: "Document checked by the Clyntique team",
};

export const EXTERNAL_OUTCOME_LABEL: Record<ExternalOutcomeKind, string> = {
  APPROVED: "Approved by external authority/platform",
  CHANGES_REQUESTED: "Changes requested externally",
  REJECTED: "Rejected externally",
};

/** Shown with every external record. */
export const EXTERNAL_DISCLAIMER =
  "Recorded manually. Clyntique did not submit this and has no connection to the platform or regulator; the outcome is as reported or as read from the document.";

/** Shown on every review record / passport page. */
export const RECORD_DISCLAIMER =
  "This is Clyntique's internal review record. It is not legal advice, not government approval, and not acceptance by any advertising platform. External outcomes below are recorded manually and are not independently certified by Clyntique.";

// ---------------------------------------------------------------------------
// Assessment of client evidence (P0, Oct 27). Internal review wording only:
// it never says a study or document was validated scientifically or legally.

export type EvidenceAssessmentResultKey = "ACCEPTED_FOR_REVIEW" | "INSUFFICIENT" | "NOT_RELEVANT" | "NEEDS_CLARIFICATION";

export const EVIDENCE_ASSESSMENT_LABEL: Record<EvidenceAssessmentResultKey, string> = {
  ACCEPTED_FOR_REVIEW: "Accepted for this review",
  INSUFFICIENT: "Not sufficient for the claim",
  NOT_RELEVANT: "Not relevant to the claim",
  NEEDS_CLARIFICATION: "Needs clarification",
};

export const EVIDENCE_ASSESSMENT_NOTICE =
  "This is Clyntique's internal review assessment. It is not a scientific, legal, regulatory or platform validation of the evidence.";
