"use server";

import { requireRole } from "@/lib/auth/dal";
import {
  getDbPolicyRules,
  getDbPolicySources,
  createDbPolicyRule,
  proposeDbRuleVersion,
  approveDbRuleVersion,
  retireDbRule,
  verifyDbPolicySource,
  importCandidatePoliciesToDb,
  createDbPolicySource,
  updateDbPolicySource,
  updateDbDraftRuleVersion,
  submitDbRuleVersion,
  verifyDbRuleVersion,
  getDbPolicyHistory,
  type CreatePolicyRuleInput,
  type EditDraftVersionInput,
  type ProposeNewVersionInput,
  type SourceReviewResult,
  type VersionReviewResult,
} from "./db";
import type { SourceInput } from "./validate";
import { coverageReport, filterApplicableVerifiedRules, INSUFFICIENT_POLICY_COVERAGE, ruleIndustriesFor, type CoveragePair } from "@/lib/ai/applicability";
import type {
  PolicyFilterCriteria,
  PolicyRule,
  PolicyRuleVersion,
  PolicySource,
} from "./types";
import { isPolicyAdmin } from "./auth";

export interface PolicyLibraryPayload {
  rules: PolicyRule[];
  sources: PolicySource[];
  isPolicyAdmin: boolean;
  currentUser: { id: string; name: string; email: string };
  metrics: {
    /** Rules whose in-use version is approved and active. */
    approvedActive: number;
    /** Versions submitted and waiting for the first admin's verification. */
    awaitingVerification: number;
    /** Verified versions waiting for a second admin's approval. */
    awaitingApproval: number;
    /** Drafts, including versions returned for changes. */
    draftsAndReturned: number;
    sourcesVerified: number;
    sourcesTotal: number;
  };
}

export async function fetchPolicyLibraryData(
  criteria?: PolicyFilterCriteria
): Promise<PolicyLibraryPayload> {
  const user = await requireRole("TEAM");
  const allRules = await getDbPolicyRules();
  const filtered = criteria ? await getDbPolicyRules(criteria) : allRules;
  const sources = await getDbPolicySources();

  const versions = allRules.flatMap((r) => r.versions);
  const metrics = {
    approvedActive: allRules.filter((r) => r.versions.some((v) => v.status === "ACTIVE")).length,
    awaitingVerification: versions.filter((v) => v.status === "PENDING_APPROVAL" && v.verificationStatus !== "VERIFIED").length,
    awaitingApproval: versions.filter((v) => v.status === "PENDING_APPROVAL" && v.verificationStatus === "VERIFIED").length,
    draftsAndReturned: versions.filter((v) => v.status === "DRAFT").length,
    sourcesVerified: sources.filter((s) => s.verificationStatus === "VERIFIED").length,
    sourcesTotal: sources.length,
  };

  return {
    rules: filtered,
    sources,
    isPolicyAdmin: isPolicyAdmin(user),
    currentUser: { id: user.id, name: user.name, email: user.email },
    metrics,
  };
}

export async function createPolicyRuleServerAction(
  input: CreatePolicyRuleInput
): Promise<{ ok: boolean; rule?: PolicyRule; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    const created = await createDbPolicyRule(input, user);
    return { ok: true, rule: created };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create policy rule in PostgreSQL." };
  }
}

export async function proposeVersionServerAction(
  input: ProposeNewVersionInput
): Promise<{ ok: boolean; version?: PolicyRuleVersion; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    const version = await proposeDbRuleVersion(input, user);
    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to propose new version in PostgreSQL." };
  }
}

export async function approveVersionServerAction(
  ruleId: string,
  versionId: string,
  auditNote?: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    await approveDbRuleVersion(ruleId, versionId, user, auditNote);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to approve version." };
  }
}

export async function verifyPolicySourceServerAction(
  sourceId: string,
  review?: { result?: SourceReviewResult; note?: string }
): Promise<{ ok: boolean; source?: PolicySource; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    const source = await verifyDbPolicySource(String(sourceId ?? ""), user, review ?? {});
    return { ok: true, source };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to verify policy source." };
  }
}

export async function createPolicySourceServerAction(
  input: SourceInput
): Promise<{ ok: boolean; source?: PolicySource; warnings?: string[]; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    const { source, warnings } = await createDbPolicySource(input, user);
    return { ok: true, source, warnings };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add the policy source." };
  }
}

export async function updatePolicySourceServerAction(
  sourceId: string,
  input: SourceInput
): Promise<{ ok: boolean; source?: PolicySource; warnings?: string[]; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    const { source, warnings } = await updateDbPolicySource(String(sourceId ?? ""), input, user);
    return { ok: true, source, warnings };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update the policy source." };
  }
}

export async function updateDraftVersionServerAction(
  input: EditDraftVersionInput
): Promise<{ ok: boolean; version?: PolicyRuleVersion; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    return { ok: true, version: await updateDbDraftRuleVersion(input, user) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save the draft." };
  }
}

export async function submitVersionServerAction(
  versionId: string
): Promise<{ ok: boolean; version?: PolicyRuleVersion; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    return { ok: true, version: await submitDbRuleVersion(String(versionId ?? ""), user) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to submit the version." };
  }
}

export async function verifyVersionServerAction(
  versionId: string,
  review: { result: VersionReviewResult; note?: string }
): Promise<{ ok: boolean; version?: PolicyRuleVersion; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    return { ok: true, version: await verifyDbRuleVersion(String(versionId ?? ""), user, review) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to record the verification." };
  }
}

export async function fetchPolicyHistoryServerAction(ruleId: string) {
  await requireRole("TEAM");
  return getDbPolicyHistory(String(ruleId ?? ""));
}

export async function retireRuleServerAction(
  ruleId: string,
  auditNote?: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    await retireDbRule(ruleId, user, auditNote);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to retire rule." };
  }
}

export async function importCandidatesServerAction(): Promise<{
  ok: boolean;
  sourcesImported?: number;
  rulesImported?: number;
  message?: string;
  error?: string;
}> {
  const user = await requireRole("TEAM");
  try {
    // Research candidates are unverified drafts with known source flaws. Importing
    // them needs explicit authorization, so it is off unless the deployment sets
    // POLICY_CANDIDATE_IMPORT=enabled. Imported candidates stay UNVERIFIED and
    // PENDING_APPROVAL either way.
    if (process.env.POLICY_CANDIDATE_IMPORT !== "enabled") {
      return {
        ok: false,
        error: "Importing research candidates is disabled. It needs explicit authorization and independent source verification first.",
      };
    }
    const result = await importCandidatePoliciesToDb(user);
    return {
      ok: true,
      sourcesImported: result.sourcesImported,
      rulesImported: result.rulesImported,
      message: result.message,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to import candidate policies." };
  }
}

export interface CoveragePreview {
  pairs: CoveragePair[];
  /** Rule codes the AI would be given for this scope. */
  ruleCodes: string[];
  industries: string[];
  insufficientMessage: string;
}

/**
 * Read-only coverage check for the Policy Library: which approved, verified
 * rules the AI would be given for a market / platform / industry scope, using
 * the same boundary as the real scan. No matching, no scores.
 */
export async function coveragePreviewServerAction(scope: {
  markets: string[];
  platforms: string[];
  industry: string | null;
}): Promise<CoveragePreview> {
  await requireRole("TEAM");
  const clean = (list: unknown) => (Array.isArray(list) ? list : []).map((v) => String(v ?? "").trim().toUpperCase()).filter((v) => /^[A-Z0-9-]{2,12}$/.test(v)).slice(0, 10);
  const context = { markets: clean(scope?.markets), platforms: clean(scope?.platforms), industry: scope?.industry ? String(scope.industry) : null };
  const rules = await getDbPolicyRules();
  return {
    pairs: coverageReport(rules, context),
    ruleCodes: filterApplicableVerifiedRules(rules, context).map((r) => r.code),
    industries: ruleIndustriesFor(context.industry),
    insufficientMessage: INSUFFICIENT_POLICY_COVERAGE,
  };
}
