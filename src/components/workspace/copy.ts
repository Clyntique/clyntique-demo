import type { CreativeStatus, CreativeWorkflow, Role } from "@/generated/prisma/enums";
import type { StatusCounts } from "@/lib/data/workspace";

// Role-specific wording.

// Legacy workflow (pre-compliance): the team produced creatives and the
// client approved them. Kept for existing records.
export const REVIEW_STATE: Record<Role, Record<CreativeStatus, string>> = {
  TEAM: {
    DRAFT: "Not shared with client yet",
    IN_REVIEW: "Waiting on client review",
    CHANGES_REQUESTED: "Feedback to address",
    APPROVED: "Approved by client",
    ARCHIVED: "Archived",
    SUBMITTED: "Submitted for review",
    REVIEW_COMPLETE: "Review complete",
  },
  CLIENT: {
    DRAFT: "In preparation",
    IN_REVIEW: "Needs your review",
    CHANGES_REQUESTED: "Team is revising",
    APPROVED: "You approved this",
    ARCHIVED: "Archived",
    SUBMITTED: "Submitted for review",
    REVIEW_COMPLETE: "Review complete",
  },
};

// Submission-review workflow: the client submits, the Clyntique team reviews.
export const SUBMISSION_STATE: Record<Role, Record<CreativeStatus, string>> = {
  TEAM: {
    DRAFT: "Client draft",
    SUBMITTED: "Waiting for review",
    IN_REVIEW: "In review",
    CHANGES_REQUESTED: "Waiting on client changes",
    REVIEW_COMPLETE: "Review complete",
    APPROVED: "Approved",
    ARCHIVED: "Archived",
  },
  CLIENT: {
    DRAFT: "Draft · not submitted yet",
    SUBMITTED: "Submitted · waiting for review",
    IN_REVIEW: "Being reviewed",
    CHANGES_REQUESTED: "Changes requested",
    REVIEW_COMPLETE: "Review complete",
    APPROVED: "Approved",
    ARCHIVED: "Archived",
  },
};

export function reviewStateLabel(role: Role, workflow: CreativeWorkflow, status: CreativeStatus) {
  return (workflow === "SUBMISSION_REVIEW" ? SUBMISSION_STATE : REVIEW_STATE)[role][status];
}

/** Whether a creative is waiting on this person. */
export function needsAttention(role: Role, workflow: CreativeWorkflow, status: CreativeStatus) {
  if (workflow === "SUBMISSION_REVIEW") {
    return role === "CLIENT" ? status === "DRAFT" || status === "CHANGES_REQUESTED" : status === "SUBMITTED";
  }
  return (role === "CLIENT" && status === "IN_REVIEW") || (role === "TEAM" && status === "CHANGES_REQUESTED");
}

// A project's overall state is driven by the creative that most needs attention.
export function projectStatus(counts: StatusCounts): CreativeStatus {
  if (counts.CHANGES_REQUESTED) return "CHANGES_REQUESTED";
  if (counts.IN_REVIEW) return "IN_REVIEW";
  if (counts.SUBMITTED) return "SUBMITTED";
  const done = (counts.APPROVED ?? 0) + (counts.REVIEW_COMPLETE ?? 0);
  if (done && !counts.DRAFT) return counts.REVIEW_COMPLETE ? "REVIEW_COMPLETE" : "APPROVED";
  return "DRAFT";
}
