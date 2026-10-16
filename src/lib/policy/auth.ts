import type { CurrentUser } from "@/lib/auth/dal";
import type { PolicyRuleVersion } from "./types";

/**
 * Server-side authorization for the Clyntique Compliance Policy Library.
 * Enforces explicit policy-administrator permissions and the maker-checker principle:
 * 1. Only TEAM members with policy administration rights can create, edit, or approve rules.
 * 2. An author cannot approve their own rule version (maker-checker separation).
 * 3. Never trusts client input; evaluated strictly on the server.
 */

// Designated policy administrators for demo/production
const DEMO_POLICY_ADMIN_EMAILS = new Set([
  "team@clyntique.demo",
  "compliance-admin@clyntique.com",
]);

export function isPolicyAdmin(user: CurrentUser): boolean {
  if (user.role !== "TEAM") return false;
  // Quick demo-login sessions never get policy administration rights.
  if (user.demoSession) return false;
  // Enforces explicit isPolicyAdmin column from PostgreSQL, or recognized policy administrator email
  return user.isPolicyAdmin === true || DEMO_POLICY_ADMIN_EMAILS.has(user.email);
}

export function assertPolicyAdmin(user: CurrentUser): void {
  if (!isPolicyAdmin(user)) {
    throw new Error("Unauthorized: Policy Library administration requires verified TEAM Policy Administrator rights.");
  }
}

export interface ApprovalCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Maker-checker authorization check for approving policy rule versions.
 * An author cannot approve their own rule or version.
 */
export function canApprovePolicyVersion(
  user: CurrentUser,
  version: Pick<PolicyRuleVersion, "createdById" | "status">
): ApprovalCheckResult {
  if (!isPolicyAdmin(user)) {
    return {
      allowed: false,
      reason: "Only verified Policy Administrators can approve compliance rules.",
    };
  }

  if (version.status === "ACTIVE") {
    return {
      allowed: false,
      reason: "This rule version is already approved and active. Approved versions are immutable.",
    };
  }

  if (version.status === "DEPRECATED") {
    return {
      allowed: false,
      reason: "Deprecated rule versions cannot be reactivated directly. Propose a new version instead.",
    };
  }

  // Maker-checker separation: author cannot approve their own submission
  if (version.createdById && version.createdById === user.id) {
    return {
      allowed: false,
      reason: "Maker-Checker Governance: You cannot approve a policy version that you created. A second authorized reviewer must verify and approve.",
    };
  }

  return { allowed: true };
}
