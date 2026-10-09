import type { CreativeStatus, Role } from "@/generated/prisma/enums";
import type { StatusCounts } from "@/lib/data/workspace";

// Role-specific wording. TEAM language is about producing and tracking work,
// CLIENT language is about reviewing and approving it.

export const REVIEW_STATE: Record<Role, Record<CreativeStatus, string>> = {
  TEAM: {
    DRAFT: "Not shared with client yet",
    IN_REVIEW: "Waiting on client review",
    CHANGES_REQUESTED: "Feedback to address",
    APPROVED: "Approved by client",
    ARCHIVED: "Archived",
  },
  CLIENT: {
    DRAFT: "In preparation",
    IN_REVIEW: "Needs your review",
    CHANGES_REQUESTED: "Team is revising",
    APPROVED: "You approved this",
    ARCHIVED: "Archived",
  },
};

// A project's overall state is driven by the creative that most needs attention.
export function projectStatus(counts: StatusCounts): CreativeStatus {
  if (counts.CHANGES_REQUESTED) return "CHANGES_REQUESTED";
  if (counts.IN_REVIEW) return "IN_REVIEW";
  if (counts.APPROVED && !counts.DRAFT) return "APPROVED";
  return "DRAFT";
}
