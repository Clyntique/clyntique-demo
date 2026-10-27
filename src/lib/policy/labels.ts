import type { PolicyRuleEventKind } from "@/generated/prisma/enums";

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
};
