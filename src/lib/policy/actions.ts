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
  type CreatePolicyRuleInput,
  type ProposeNewVersionInput,
} from "./db";
import { findGroundedRulesForContext, type CreativeContextForGrounding } from "./search";
import type {
  AIGroundingResult,
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
    totalActive: number;
    regulations: number;
    platformPolicies: number;
    internalRisk: number;
    pendingApproval: number;
  };
}

export async function fetchPolicyLibraryData(
  criteria?: PolicyFilterCriteria
): Promise<PolicyLibraryPayload> {
  const user = await requireRole("TEAM");
  const allRules = await getDbPolicyRules();
  const filtered = criteria ? await getDbPolicyRules(criteria) : allRules;
  const sources = await getDbPolicySources();

  const metrics = {
    totalActive: allRules.filter((r) => r.currentVersion.status === "ACTIVE").length,
    regulations: allRules.filter(
      (r) => r.authorityType === "REGULATION" && r.currentVersion.status === "ACTIVE"
    ).length,
    platformPolicies: allRules.filter(
      (r) => r.authorityType === "PLATFORM_POLICY" && r.currentVersion.status === "ACTIVE"
    ).length,
    internalRisk: allRules.filter(
      (r) => r.authorityType === "INTERNAL_RISK" && r.currentVersion.status === "ACTIVE"
    ).length,
    pendingApproval: allRules.reduce((acc, r) => {
      const pendingCount = r.versions.filter((v) => v.status === "PENDING_APPROVAL").length;
      return acc + pendingCount;
    }, 0),
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
  try {
    const user = await requireRole("TEAM");
    const created = await createDbPolicyRule(input, user);
    return { ok: true, rule: created };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create policy rule in PostgreSQL." };
  }
}

export async function proposeVersionServerAction(
  input: ProposeNewVersionInput
): Promise<{ ok: boolean; version?: PolicyRuleVersion; error?: string }> {
  try {
    const user = await requireRole("TEAM");
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
  try {
    const user = await requireRole("TEAM");
    await approveDbRuleVersion(ruleId, versionId, user, auditNote);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to approve version." };
  }
}

export async function verifyPolicySourceServerAction(
  sourceId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("TEAM");
    await verifyDbPolicySource(sourceId, user);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to verify policy source." };
  }
}

export async function retireRuleServerAction(
  ruleId: string,
  auditNote?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireRole("TEAM");
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
  try {
    const user = await requireRole("TEAM");
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

export async function runGroundingServerAction(
  context: CreativeContextForGrounding
): Promise<AIGroundingResult> {
  await requireRole("TEAM");
  const allRules = await getDbPolicyRules();
  return findGroundedRulesForContext(allRules, context);
}
