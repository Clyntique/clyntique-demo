import type { PolicyChangeKind, PolicyChangeProposalStatus, PolicyRuleEventKind, PolicySourceFetchOutcome } from "@/generated/prisma/enums";
import type { SourceMonitorStatus } from "./monitoring/service";
import type { PolicyAuthorityType, PolicyCategory, PolicyRestrictionLevel, PolicyRuleVersion, PolicySourceKind, PolicyVerificationStatus } from "./types";

/** Plain-language names of Policy Library history events (rules and sources). */
export const POLICY_EVENT_LABEL: Record<PolicyRuleEventKind, string> = {
  RULE_CREATED: "Rule created",
  VERSION_PROPOSED: "Version proposed",
  VERSION_EDITED: "Draft edited",
  VERSION_VERIFIED: "Version verified",
  VERSION_RETURNED: "Returned for review",
  VERSION_REJECTED: "Version rejected",
  VERSION_APPROVED: "Version approved",
  RULE_RETIRED: "Rule retired",
  SOURCE_CREATED: "Source added",
  SOURCE_EDITED: "Source edited",
  SOURCE_VERIFIED: "Source verified",
  SOURCE_CHANGE_DETECTED: "Source change detected",
  SOURCE_CHANGE_REVIEWED: "Source change reviewed",
  SOURCE_MONITORING_UPDATED: "Source monitoring updated",
};

// Policy source monitoring (Oct 31).

export const FETCH_OUTCOME_LABEL: Record<PolicySourceFetchOutcome, string> = {
  OK: "Fetched",
  REDIRECTED: "Redirected",
  NOT_FOUND: "Not found",
  BLOCKED: "Blocked",
  UNREACHABLE: "Unreachable",
  ERROR: "Error",
  SKIPPED: "Skipped",
};

export const CHANGE_KIND_LABEL: Record<PolicyChangeKind, string> = {
  CONTENT_CHANGED: "Content changed",
  REDIRECTED: "URL redirects elsewhere",
  NOT_FOUND: "Page not found",
  ACCESS_PROBLEM: "Access problem",
};

export const PROPOSAL_STATUS_LABEL: Record<PolicyChangeProposalStatus, string> = {
  PENDING_REVIEW: "Pending review",
  NO_RULE_CHANGE: "Reviewed · no rule change",
  RULE_UPDATE_STARTED: "Reviewed · rule update started",
  DISMISSED: "Dismissed",
};

export const MONITOR_STATUS_LABEL: Record<SourceMonitorStatus, string> = {
  DISCONTINUED: "Discontinued",
  NOT_MONITORED: "Not monitored",
  NEVER_CHECKED: "Never checked",
  OK: "No change",
  CHANGE_PENDING: "Change pending review",
  ACCESS_PROBLEM: "Access problem",
  LAST_CHECK_FAILED: "Last check failed",
};

// Plain-language names for the structured fields (P0, Oct 27).

export const AUTHORITY_LABEL: Record<PolicyAuthorityType, string> = {
  REGULATION: "Government regulation",
  PLATFORM_POLICY: "Platform policy",
  INTERNAL_RISK: "Internal risk guidance",
};

export const CATEGORY_LABEL: Record<PolicyCategory, string> = {
  EFFICACY_CLAIM: "Efficacy claims",
  BEFORE_AFTER: "Before and after images",
  DISCLOSURE: "Disclosures",
  PRICING_PROMO: "Pricing and promotions",
  SUBSTANTIATION: "Substantiation",
  RESTRICTED_PROCEDURES: "Restricted procedures",
  MANDATORY_LABELING: "Mandatory labelling",
  TARGETING_RESTRICTION: "Targeting restrictions",
  PRESCRIPTION_MEDICINE: "Prescription medicines",
  CREDENTIALS_LICENSING: "Credentials and licensing",
  TESTIMONIAL_ENDORSEMENT: "Testimonials and endorsements",
  PERSONAL_HEALTH_ATTRIBUTES: "Personal health attributes",
};

export const RESTRICTION_LABEL: Record<PolicyRestrictionLevel, string> = {
  PROHIBITED: "Prohibited",
  RESTRICTED: "Restricted",
  CONDITIONAL: "Allowed with conditions",
  DISCLOSURE_REQUIRED: "Disclosure required",
};

export const SOURCE_KIND_LABEL: Record<PolicySourceKind, string> = {
  PLATFORM_POLICY_PAGE: "Platform policy page",
  PLATFORM_HELP_ARTICLE: "Platform help article",
  STATUTE_OR_REGULATION: "Statute or regulation",
  REGULATOR_GUIDANCE: "Regulator guidance",
  OTHER_OFFICIAL: "Other official source",
};

export const RULE_INDUSTRY_LABEL: Record<string, string> = {
  GENERAL: "All industries",
  HEALTHCARE: "Healthcare",
  MEDICAL_AESTHETICS: "Medical aesthetics",
};

export const VERIFICATION_LABEL: Record<PolicyVerificationStatus, string> = {
  UNVERIFIED: "Not verified yet",
  VERIFIED: "Verified",
  REQUIRES_REVIEW: "Requires review",
  REJECTED: "Rejected",
};

/** Where a version is in Draft → Verified → Approved, in one phrase. */
export function versionStage(v: Pick<PolicyRuleVersion, "status" | "verificationStatus">): string {
  if (v.status === "ACTIVE") return "Approved and in use";
  if (v.status === "DEPRECATED") return "Superseded or retired";
  if (v.status === "PENDING_APPROVAL") return v.verificationStatus === "VERIFIED" ? "Verified · awaiting approval" : "Submitted · awaiting verification";
  if (v.verificationStatus === "REJECTED") return "Rejected";
  if (v.verificationStatus === "REQUIRES_REVIEW") return "Returned for changes";
  return "Draft";
}

/** Shown wherever a date the source doesn't state would go (never "today"). */
export const NOT_STATED = "Not stated by source";
