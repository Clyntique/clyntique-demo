import type { PolicyRule, PolicyRuleVersion } from "./types";

/*
 * What the PUBLIC policy dashboard (/policy-dashboard, no sign-in) may receive.
 *
 * The dashboard view is a client component, so everything passed to it is
 * serialized into the page and readable by any visitor, whatever the component
 * chooses to render. Filtering therefore has to happen here, on the server:
 *
 * - only rules whose current version is ACTIVE and VERIFIED are sent at all;
 * - of those, only history that was actually approved is sent (a DEPRECATED
 *   version can be a draft that was superseded without ever being approved);
 * - staff identities and internal review or verification notes are removed.
 */

const PUBLIC_AUTHOR = "Clyntique Policy Reviewer";

function isPublished(v: PolicyRuleVersion): boolean {
  return v.status === "ACTIVE" && v.verificationStatus === "VERIFIED";
}

function wasApproved(v: PolicyRuleVersion): boolean {
  return (v.status === "ACTIVE" || v.status === "DEPRECATED") && Boolean(v.approvedAt);
}

function redactVersion(v: PolicyRuleVersion): PolicyRuleVersion {
  return {
    ...v,
    createdById: "",
    createdByName: PUBLIC_AUTHOR,
    approvedById: null,
    approvedByName: null,
    verifiedById: null,
    verifiedByName: null,
    verificationNote: null,
    reviewNote: null,
  };
}

export function toPublicPolicyRules(rules: PolicyRule[]): PolicyRule[] {
  return rules
    .filter((r) => isPublished(r.currentVersion))
    .map((r) => ({
      ...r,
      currentVersion: redactVersion(r.currentVersion),
      versions: r.versions.filter(wasApproved).map(redactVersion),
    }));
}
