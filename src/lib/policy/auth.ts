import type { CurrentUser } from "@/lib/auth/dal";
import type { PolicyRuleVersion } from "./types";

/**
 * Server-side authorization for the Clyntique Compliance Policy Library.
 * 1. Only TEAM members with the explicit User.isPolicyAdmin permission can
 *    create, edit, verify or approve rules and sources (decision D6: no
 *    hard-coded email addresses). Quick demo-login sessions never can.
 * 2. Two-person control (decision D1): one policy admin verifies a version
 *    against its sources, a DIFFERENT one approves it. The approver can also
 *    never be the version's author. Both identities and times are kept.
 * 3. Never trusts client input; evaluated strictly on the server.
 */

export function isPolicyAdmin(user: CurrentUser): boolean {
  if (user.role !== "TEAM") return false;
  if (user.demoSession) return false;
  return user.isPolicyAdmin === true;
}

export function assertPolicyAdmin(user: CurrentUser): void {
  if (!isPolicyAdmin(user)) {
    throw new Error("Unauthorized: Policy Library administration requires TEAM Policy Administrator rights.");
  }
}

export interface ApprovalCheckResult {
  allowed: boolean;
  reason?: string;
}

type VersionFacts = Pick<PolicyRuleVersion, "createdById" | "status"> &
  Partial<Pick<PolicyRuleVersion, "verificationStatus" | "verifiedById">>;

/** Whether this admin may record the human verification of a version. */
export function canVerifyPolicyVersion(user: CurrentUser, version: VersionFacts): ApprovalCheckResult {
  if (!isPolicyAdmin(user)) return { allowed: false, reason: "Only Policy Administrators can verify compliance rules." };
  if (version.status !== "PENDING_APPROVAL") {
    return { allowed: false, reason: "Only a version submitted for verification can be verified. Submit the draft first." };
  }
  if (version.verificationStatus && version.verificationStatus !== "UNVERIFIED") {
    return { allowed: false, reason: "This version has already been verified, returned or rejected." };
  }
  return { allowed: true };
}

/**
 * Two-person check for approving a policy rule version: verified first, by
 * someone else, and never approved by its author.
 */
export function canApprovePolicyVersion(user: CurrentUser, version: VersionFacts): ApprovalCheckResult {
  if (!isPolicyAdmin(user)) {
    return { allowed: false, reason: "Only Policy Administrators can approve compliance rules." };
  }
  if (version.status === "ACTIVE") {
    return { allowed: false, reason: "This rule version is already approved and active. Approved versions are immutable." };
  }
  if (version.status === "DEPRECATED") {
    return { allowed: false, reason: "Deprecated rule versions cannot be reactivated directly. Propose a new version instead." };
  }
  if (version.status !== "PENDING_APPROVAL") {
    return { allowed: false, reason: "Only a version submitted for verification can be approved." };
  }
  if (version.verificationStatus !== "VERIFIED" || !version.verifiedById) {
    return { allowed: false, reason: "This version must be verified against its sources by a Policy Administrator before it can be approved." };
  }
  if (version.verifiedById === user.id) {
    return { allowed: false, reason: "Two-person control: you verified this version, so a different Policy Administrator must approve it." };
  }
  if (version.createdById && version.createdById === user.id) {
    return { allowed: false, reason: "Two-person control: you cannot approve a policy version that you created." };
  }
  return { allowed: true };
}
