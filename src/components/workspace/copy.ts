import type { ActivityType, CreativeStatus, Role } from "@/generated/prisma/enums";
import type { ProjectSummary } from "@/lib/demo-data";

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

export function activityTitle(type: ActivityType, version?: number) {
  switch (type) {
    case "CREATIVE_UPLOADED":
      return "Creative uploaded";
    case "VERSION_UPLOADED":
      return version ? `V${version} uploaded` : "New version uploaded";
    case "FEEDBACK_RECEIVED":
      return "Feedback received";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "CREATIVE_APPROVED":
      return "Creative approved";
    default:
      return "Update";
  }
}

// A project's overall state is driven by the creative that most needs attention.
export function projectStatus(counts: ProjectSummary["statusCounts"]): CreativeStatus {
  if (counts.CHANGES_REQUESTED) return "CHANGES_REQUESTED";
  if (counts.IN_REVIEW) return "IN_REVIEW";
  if (counts.APPROVED && !counts.DRAFT) return "APPROVED";
  return "DRAFT";
}
