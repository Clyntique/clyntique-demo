import type { CurrentUser } from "@/lib/auth/dal";
import { canApprovePolicyVersion, isPolicyAdmin } from "./auth";
import { STARTER_POLICY_RULES, STARTER_POLICY_SOURCES } from "./starter-policies";
import type {
  PolicyFilterCriteria,
  PolicyRule,
  PolicyRuleVersion,
  PolicySource,
} from "./types";
import { filterPolicyRules } from "./search";

/**
 * In-memory policy repository for the Clyntique Policy Library demo module.
 * Preserves immutable version history, strict maker-checker approval, and
 * separates sources from rule versions.
 *
 * Designed to seamlessly transition to Prisma once the additive schema migration is approved.
 */

// Global repository state initialized from verified starter datasets
let memoryRules: PolicyRule[] = JSON.parse(JSON.stringify(STARTER_POLICY_RULES));
let memorySources: PolicySource[] = JSON.parse(JSON.stringify(STARTER_POLICY_SOURCES));

export function resetPolicyStore(): void {
  memoryRules = JSON.parse(JSON.stringify(STARTER_POLICY_RULES));
  memorySources = JSON.parse(JSON.stringify(STARTER_POLICY_SOURCES));
}

export function getAllPolicyRules(): PolicyRule[] {
  return [...memoryRules];
}

export function getAllPolicySources(): PolicySource[] {
  return [...memorySources];
}

export function getFilteredPolicyRules(criteria: PolicyFilterCriteria): PolicyRule[] {
  return filterPolicyRules(memoryRules, criteria);
}

export function getPolicyRuleById(id: string): PolicyRule | null {
  const found = memoryRules.find((r) => r.id === id || r.code === id);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

export interface CreatePolicyRuleInput {
  code: string;
  title: string;
  authorityType: PolicyRule["authorityType"];
  jurisdictionCode: string;
  subJurisdiction?: string | null;
  platformCode?: string | null;
  industry: string;
  category: PolicyRule["category"];
  summary: string;
  legalExplanation: string;
  remediationAction: string;
  applicabilityConditions: string[];
  exceptions?: string[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  sources: Array<{
    sourceId: string;
    sectionReference: string;
    sectionTitle: string;
    directUrl: string;
    excerpt: string;
  }>;
  status: "DRAFT" | "PENDING_APPROVAL"; // Never auto-approved!
}

export function createPolicyRule(input: CreatePolicyRuleInput, user: CurrentUser): PolicyRule {
  if (!isPolicyAdmin(user)) {
    throw new Error("Unauthorized: Policy creation requires TEAM Policy Administrator permissions.");
  }

  // Ensure unique rule code
  if (memoryRules.some((r) => r.code.toUpperCase() === input.code.toUpperCase())) {
    throw new Error(`Rule code '${input.code}' already exists. Rule codes must be unique.`);
  }

  const now = new Date().toISOString();
  const ruleId = `rule-${Date.now()}`;
  const versionId = `ver-${ruleId}-v1`;

  const sourcesWithNames = input.sources.map((s, idx) => {
    const parentSource = memorySources.find((src) => src.id === s.sourceId);
    return {
      id: `sec-${ruleId}-${idx}`,
      sourceId: s.sourceId,
      sourceName: parentSource ? parentSource.name : "Official Source",
      authorityName: parentSource ? parentSource.authorityName : "Official Authority",
      sectionReference: s.sectionReference,
      sectionTitle: s.sectionTitle,
      directUrl: s.directUrl,
      excerpt: s.excerpt,
    };
  });

  const initialVersion: PolicyRuleVersion = {
    id: versionId,
    ruleId,
    versionNumber: 1,
    title: input.title,
    summary: input.summary,
    legalExplanation: input.legalExplanation,
    remediationAction: input.remediationAction,
    applicabilityConditions: input.applicabilityConditions,
    exceptions: input.exceptions ?? [],
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    status: input.status,
    verificationStatus: "UNVERIFIED",
    sources: sourcesWithNames,
    changeSummary: "Initial version created.",
    createdById: user.id,
    createdByName: user.name,
    createdAt: now,
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
  };

  const newRule: PolicyRule = {
    id: ruleId,
    code: input.code.toUpperCase().trim(),
    title: input.title,
    authorityType: input.authorityType,
    jurisdictionCode: input.jurisdictionCode,
    subJurisdiction: input.subJurisdiction ?? null,
    platformCode: input.platformCode ?? null,
    industry: input.industry,
    category: input.category,
    currentVersionNumber: 1,
    currentVersion: initialVersion,
    versions: [initialVersion],
    createdAt: now,
    updatedAt: now,
  };

  memoryRules.unshift(newRule);
  return JSON.parse(JSON.stringify(newRule));
}

export interface ProposeNewVersionInput {
  ruleId: string;
  title: string;
  summary: string;
  legalExplanation: string;
  remediationAction: string;
  applicabilityConditions: string[];
  exceptions?: string[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  changeSummary: string;
  sources: Array<{
    sourceId: string;
    sectionReference: string;
    sectionTitle: string;
    directUrl: string;
    excerpt: string;
  }>;
}

export function proposeRuleVersion(input: ProposeNewVersionInput, user: CurrentUser): PolicyRuleVersion {
  if (!isPolicyAdmin(user)) {
    throw new Error("Unauthorized: Proposing rule versions requires Policy Administrator permissions.");
  }

  const rule = memoryRules.find((r) => r.id === input.ruleId);
  if (!rule) {
    throw new Error(`Rule ${input.ruleId} not found.`);
  }

  const nextVersionNumber = rule.currentVersionNumber + 1;
  const now = new Date().toISOString();
  const versionId = `ver-${rule.id}-v${nextVersionNumber}`;

  const sourcesWithNames = input.sources.map((s, idx) => {
    const parentSource = memorySources.find((src) => src.id === s.sourceId);
    return {
      id: `sec-${rule.id}-v${nextVersionNumber}-${idx}`,
      sourceId: s.sourceId,
      sourceName: parentSource ? parentSource.name : "Official Source",
      authorityName: parentSource ? parentSource.authorityName : "Official Authority",
      sectionReference: s.sectionReference,
      sectionTitle: s.sectionTitle,
      directUrl: s.directUrl,
      excerpt: s.excerpt,
    };
  });

  const newVersion: PolicyRuleVersion = {
    id: versionId,
    ruleId: rule.id,
    versionNumber: nextVersionNumber,
    title: input.title,
    summary: input.summary,
    legalExplanation: input.legalExplanation,
    remediationAction: input.remediationAction,
    applicabilityConditions: input.applicabilityConditions,
    exceptions: input.exceptions ?? [],
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    status: "PENDING_APPROVAL", // Always pending approval! Never auto-approved
    verificationStatus: "UNVERIFIED",
    sources: sourcesWithNames,
    changeSummary: input.changeSummary,
    createdById: user.id,
    createdByName: user.name,
    createdAt: now,
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
  };

  // Append new version to immutable history
  rule.versions.unshift(newVersion);
  rule.updatedAt = now;

  return JSON.parse(JSON.stringify(newVersion));
}

export function approveRuleVersion(
  ruleId: string,
  versionId: string,
  user: CurrentUser,
  auditNote?: string
): { rule: PolicyRule; approvedVersion: PolicyRuleVersion } {
  const rule = memoryRules.find((r) => r.id === ruleId);
  if (!rule) {
    throw new Error(`Rule ${ruleId} not found.`);
  }

  const targetVersion = rule.versions.find((v) => v.id === versionId);
  if (!targetVersion) {
    throw new Error(`Version ${versionId} not found on rule ${ruleId}.`);
  }

  // Maker-checker check
  const check = canApprovePolicyVersion(user, targetVersion);
  if (!check.allowed) {
    throw new Error(check.reason ?? "Approval denied by maker-checker policy governance.");
  }

  const now = new Date().toISOString();

  // Deprecate previous active version if replacing
  for (const v of rule.versions) {
    if (v.id !== versionId && v.status === "ACTIVE") {
      v.status = "DEPRECATED";
      v.effectiveTo = now;
    }
  }

  // Mark target version as ACTIVE and approved (and verified by policy admin review)
  targetVersion.status = "ACTIVE";
  targetVersion.verificationStatus = "VERIFIED";
  targetVersion.approvedById = user.id;
  targetVersion.approvedByName = user.name;
  targetVersion.approvedAt = now;
  if (auditNote) {
    targetVersion.changeSummary = `${targetVersion.changeSummary} [Approved & Verified: ${auditNote}]`;
  }

  // Update rule pointer
  rule.currentVersionNumber = targetVersion.versionNumber;
  rule.currentVersion = targetVersion;
  rule.updatedAt = now;

  return {
    rule: JSON.parse(JSON.stringify(rule)),
    approvedVersion: JSON.parse(JSON.stringify(targetVersion)),
  };
}

export function verifyPolicyVersion(
  ruleId: string,
  versionId: string,
  user: CurrentUser,
  auditNote?: string
): PolicyRuleVersion {
  if (!isPolicyAdmin(user)) {
    throw new Error("Unauthorized: Verifying policy citations requires Policy Administrator rights.");
  }

  const rule = memoryRules.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`Rule ${ruleId} not found.`);

  const version = rule.versions.find((v) => v.id === versionId);
  if (!version) throw new Error(`Version ${versionId} not found.`);

  version.verificationStatus = "VERIFIED";
  if (auditNote) {
    version.changeSummary = `${version.changeSummary} [Verified: ${auditNote}]`;
  }
  if (rule.currentVersion.id === versionId) {
    rule.currentVersion.verificationStatus = "VERIFIED";
    rule.currentVersion.changeSummary = version.changeSummary;
  }
  rule.updatedAt = new Date().toISOString();

  return JSON.parse(JSON.stringify(version));
}

/**
 * Requirement 2: Preserve historical policy references permanently.
 * Prevent deletion of approved or cited rule versions.
 */
export function deletePolicyRuleVersion(ruleId: string, versionId: string): void {
  const rule = memoryRules.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`Rule ${ruleId} not found.`);

  const version = rule.versions.find((v) => v.id === versionId);
  if (!version) throw new Error(`Version ${versionId} not found.`);

  if (version.status === "ACTIVE" || version.approvedAt) {
    throw new Error("Cannot delete approved policy version: Approved versions are immutable and permanently preserved for audit and historical findings reference.");
  }

  rule.versions = rule.versions.filter((v) => v.id !== versionId);
}

