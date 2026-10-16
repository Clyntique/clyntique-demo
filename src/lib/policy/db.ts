import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/dal";
import type {
  PolicyFilterCriteria,
  PolicyRule,
  PolicyRuleVersion,
  PolicySource,
} from "./types";
import { filterPolicyRules } from "./search";
import { assertPolicyAdmin, canApprovePolicyVersion } from "./auth";
import { CANDIDATE_POLICY_RULES, CANDIDATE_POLICY_SOURCES } from "./candidates";

/**
 * PostgreSQL Data Access Layer for the Clyntique Compliance Policy Library (M7A).
 * 
 * Strict architectural guarantees:
 * 1. 100% PostgreSQL persistence via Prisma. Zero in-memory fallback for real workflows.
 * 2. If the database has 0 rules or 0 approved policies, returns [] so the UI renders
 *    an accurate empty state.
 * 3. All imported and newly submitted policies default to UNVERIFIED and PENDING_APPROVAL.
 * 4. Maker-checker governance: Authors cannot approve their own rule versions.
 * 5. Permanent referential preservation: History and citations are never deleted.
 */

export async function getDbPolicySources(): Promise<PolicySource[]> {
  const rows = await prisma.policySource.findMany({
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    authorityName: r.authorityName,
    authorityType: r.authorityType,
    jurisdictionCode: r.jurisdictionCode,
    officialUrl: r.officialUrl,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : undefined,
    lastAuditedAt: r.lastAuditedAt.toISOString(),
    verificationStatus: r.verificationStatus,
  }));
}

export async function verifyDbPolicySource(
  sourceId: string,
  user: CurrentUser
): Promise<PolicySource> {
  assertPolicyAdmin(user);

  const existing = await prisma.policySource.findUnique({
    where: { id: sourceId },
  });
  if (!existing) {
    throw new Error(`Policy source '${sourceId}' not found in database.`);
  }

  const updated = await prisma.policySource.update({
    where: { id: sourceId },
    data: {
      verificationStatus: "VERIFIED",
      lastAuditedAt: new Date(),
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    authorityName: updated.authorityName,
    authorityType: updated.authorityType,
    jurisdictionCode: updated.jurisdictionCode,
    officialUrl: updated.officialUrl,
    publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : undefined,
    lastAuditedAt: updated.lastAuditedAt.toISOString(),
    verificationStatus: updated.verificationStatus,
  };
}

export async function getDbPolicyRules(criteria?: PolicyFilterCriteria): Promise<PolicyRule[]> {
  const rules = await prisma.policyRule.findMany({
    include: {
      versions: {
        include: {
          sources: {
            include: { source: true },
          },
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: { versionNumber: "desc" },
      },
    },
    orderBy: { code: "asc" },
  });

  const formatted: PolicyRule[] = rules.map((r) => {
    const versions: PolicyRuleVersion[] = r.versions.map((v) => ({
      id: v.id,
      ruleId: v.ruleId,
      versionNumber: v.versionNumber,
      title: v.title,
      summary: v.summary,
      legalExplanation: v.legalExplanation,
      remediationAction: v.remediationAction,
      applicabilityConditions: v.applicabilityConditions,
      exceptions: v.exceptions,
      effectiveFrom: v.effectiveFrom.toISOString(),
      effectiveTo: v.effectiveTo ? v.effectiveTo.toISOString() : null,
      status: v.status,
      verificationStatus: v.verificationStatus,
      changeSummary: v.changeSummary,
      createdById: v.createdById,
      createdByName: v.createdBy.name,
      createdAt: v.createdAt.toISOString(),
      approvedById: v.approvedById,
      approvedByName: v.approvedBy?.name ?? null,
      approvedAt: v.approvedAt ? v.approvedAt.toISOString() : null,
      sources: v.sources.map((s) => ({
        id: s.id,
        sourceId: s.sourceId,
        sourceName: s.source.name,
        authorityName: s.source.authorityName,
        sectionReference: s.sectionReference,
        sectionTitle: s.sectionTitle,
        directUrl: s.directUrl,
        excerpt: s.excerpt ?? "",
        sourceVerificationStatus: s.source.verificationStatus,
      })),
    }));

    const currentVersion = versions.find((v) => v.versionNumber === r.currentVersionNumber) ?? versions[0];

    return {
      id: r.id,
      code: r.code,
      title: r.title,
      authorityType: r.authorityType,
      jurisdictionCode: r.jurisdictionCode,
      subJurisdiction: r.subJurisdiction,
      platformCode: r.platformCode,
      industry: r.industry,
      category: r.category,
      currentVersionNumber: r.currentVersionNumber,
      currentVersion,
      versions,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return criteria ? filterPolicyRules(formatted, criteria) : formatted;
}

export async function getDbPolicyRuleById(idOrCode: string): Promise<PolicyRule | null> {
  const all = await getDbPolicyRules();
  const target = all.find((r) => r.id === idOrCode || r.code.toUpperCase() === idOrCode.toUpperCase());
  return target ?? null;
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
  status: "DRAFT" | "PENDING_APPROVAL";
}

export async function createDbPolicyRule(
  input: CreatePolicyRuleInput,
  user: CurrentUser
): Promise<PolicyRule> {
  assertPolicyAdmin(user);

  const normalizedCode = input.code.trim().toUpperCase();
  const existing = await prisma.policyRule.findUnique({
    where: { code: normalizedCode },
  });
  if (existing) {
    throw new Error(`Rule code '${normalizedCode}' already exists in PostgreSQL.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const rule = await tx.policyRule.create({
      data: {
        code: normalizedCode,
        title: input.title.trim(),
        authorityType: input.authorityType,
        jurisdictionCode: input.jurisdictionCode.trim().toUpperCase(),
        subJurisdiction: input.subJurisdiction ? input.subJurisdiction.trim() : null,
        platformCode: input.platformCode ? input.platformCode.trim().toUpperCase() : null,
        industry: input.industry || "HEALTHCARE",
        category: input.category,
        currentVersionNumber: 1,
      },
    });

    const version = await tx.policyRuleVersion.create({
      data: {
        ruleId: rule.id,
        versionNumber: 1,
        title: input.title.trim(),
        summary: input.summary.trim(),
        legalExplanation: input.legalExplanation.trim(),
        remediationAction: input.remediationAction.trim(),
        applicabilityConditions: input.applicabilityConditions,
        exceptions: input.exceptions ?? [],
        effectiveFrom: new Date(input.effectiveFrom || Date.now()),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        // Never trust the submitted status: a new rule starts as DRAFT or PENDING_APPROVAL only.
        status: input.status === "DRAFT" ? "DRAFT" : "PENDING_APPROVAL",
        verificationStatus: "UNVERIFIED", // Always UNVERIFIED by default
        changeSummary: "Initial version created in Policy Library.",
        createdById: user.id,
      },
    });

    for (const src of input.sources) {
      await tx.policyRuleVersionSource.create({
        data: {
          versionId: version.id,
          sourceId: src.sourceId,
          sectionReference: src.sectionReference.trim(),
          sectionTitle: src.sectionTitle.trim(),
          directUrl: src.directUrl.trim(),
          excerpt: src.excerpt.trim(),
        },
      });
    }

    return rule.id;
  });

  const fullRule = await getDbPolicyRuleById(created);
  if (!fullRule) throw new Error("Failed to retrieve created policy rule.");
  return fullRule;
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

export async function proposeDbRuleVersion(
  input: ProposeNewVersionInput,
  user: CurrentUser
): Promise<PolicyRuleVersion> {
  assertPolicyAdmin(user);

  const rule = await prisma.policyRule.findUnique({
    where: { id: input.ruleId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!rule) throw new Error(`Policy rule ${input.ruleId} not found.`);

  const highestVersion = rule.versions[0]?.versionNumber ?? 0;
  const nextVersionNumber = highestVersion + 1;

  const newVersionId = await prisma.$transaction(async (tx) => {
    const version = await tx.policyRuleVersion.create({
      data: {
        ruleId: rule.id,
        versionNumber: nextVersionNumber,
        title: input.title.trim(),
        summary: input.summary.trim(),
        legalExplanation: input.legalExplanation.trim(),
        remediationAction: input.remediationAction.trim(),
        applicabilityConditions: input.applicabilityConditions,
        exceptions: input.exceptions ?? [],
        effectiveFrom: new Date(input.effectiveFrom || Date.now()),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        status: "PENDING_APPROVAL", // Always pending approval
        verificationStatus: "UNVERIFIED", // Always unverified until reviewed
        changeSummary: input.changeSummary.trim(),
        createdById: user.id,
      },
    });

    for (const src of input.sources) {
      await tx.policyRuleVersionSource.create({
        data: {
          versionId: version.id,
          sourceId: src.sourceId,
          sectionReference: src.sectionReference.trim(),
          sectionTitle: src.sectionTitle.trim(),
          directUrl: src.directUrl.trim(),
          excerpt: src.excerpt.trim(),
        },
      });
    }

    await tx.policyRule.update({
      where: { id: rule.id },
      data: { updatedAt: new Date() },
    });

    return version.id;
  });

  const reloaded = await getDbPolicyRuleById(rule.id);
  const target = reloaded?.versions.find((v) => v.id === newVersionId);
  if (!target) throw new Error("Failed to load proposed rule version.");
  return target;
}

export async function approveDbRuleVersion(
  ruleId: string,
  versionId: string,
  user: CurrentUser,
  auditNote?: string
): Promise<{ rule: PolicyRule; approvedVersion: PolicyRuleVersion }> {
  assertPolicyAdmin(user);

  const targetVersion = await prisma.policyRuleVersion.findUnique({
    where: { id: versionId },
  });

  if (!targetVersion || targetVersion.ruleId !== ruleId) throw new Error("Policy rule version not found in database.");

  // Maker-checker governance: author cannot approve their own rule version
  const check = canApprovePolicyVersion(user, targetVersion);
  if (!check.allowed) {
    throw new Error(check.reason ?? "Approval denied by maker-checker policy governance.");
  }
  if (targetVersion.status !== "PENDING_APPROVAL") {
    throw new Error("Only a version that is pending approval can be approved.");
  }

  // Independent source verification check:
  // All cited sources for this version must be independently audited and VERIFIED first.
  const citedSources = await prisma.policyRuleVersionSource.findMany({
    where: { versionId },
    include: { source: true },
  });
  const unverifiedSource = citedSources.find((cs) => cs.source.verificationStatus !== "VERIFIED");
  if (unverifiedSource) {
    throw new Error(
      `Cannot approve policy rule version: cited source "${unverifiedSource.source.name}" must be independently audited and VERIFIED by a Policy Administrator first.`
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Deprecate earlier active versions for this rule
    await tx.policyRuleVersion.updateMany({
      where: { ruleId, status: "ACTIVE", id: { not: versionId } },
      data: { status: "DEPRECATED", effectiveTo: now },
    });

    // Mark target version as ACTIVE and VERIFIED, only if it is still pending
    // (two approvers clicking at once, or a version changed meanwhile).
    const approved = await tx.policyRuleVersion.updateMany({
      where: { id: versionId, ruleId, status: "PENDING_APPROVAL" },
      data: {
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
        approvedById: user.id,
        approvedAt: now,
        changeSummary: auditNote
          ? `${targetVersion.changeSummary} [Approved & Verified: ${auditNote}]`
          : `${targetVersion.changeSummary} [Approved & Verified]`,
      },
    });
    if (!approved.count) throw new Error("This version changed meanwhile. Refresh and try again.");

    // Advance rule pointer to the approved version number
    await tx.policyRule.update({
      where: { id: ruleId },
      data: { currentVersionNumber: targetVersion.versionNumber, updatedAt: now },
    });
  });

  const updatedRule = await getDbPolicyRuleById(ruleId);
  if (!updatedRule) throw new Error("Failed to reload approved policy rule.");
  const approvedVersion = updatedRule.versions.find((v) => v.id === versionId);
  if (!approvedVersion) throw new Error("Approved version not found.");

  return { rule: updatedRule, approvedVersion };
}

export async function retireDbRule(
  ruleId: string,
  user: CurrentUser,
  auditNote?: string
): Promise<void> {
  assertPolicyAdmin(user);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const activeVersions = await tx.policyRuleVersion.findMany({
      where: { ruleId, status: "ACTIVE" },
    });

    for (const v of activeVersions) {
      await tx.policyRuleVersion.update({
        where: { id: v.id },
        data: {
          status: "DEPRECATED",
          effectiveTo: now,
          changeSummary: auditNote
            ? `${v.changeSummary} [Retired: ${auditNote}]`
            : `${v.changeSummary} [Retired by Policy Administrator]`,
        },
      });
    }

    await tx.policyRule.update({
      where: { id: ruleId },
      data: { updatedAt: now },
    });
  });
}

/**
 * Source Verification Workflow:
 * Imports official candidate policies from regulatory and platform documentation.
 * Stores them as UNVERIFIED and PENDING_APPROVAL.
 * Maker-checker separation: candidates are attributed to the administrator who
 * imports them, so a different administrator must review the evidence and approve.
 */
export async function importCandidatePoliciesToDb(
  user: CurrentUser
): Promise<{ sourcesImported: number; rulesImported: number; message: string }> {
  assertPolicyAdmin(user);

  let sourcesImported = 0;
  let rulesImported = 0;

  // 2. Import official sources (idempotent, unverified by default)
  for (const src of CANDIDATE_POLICY_SOURCES) {
    const existing = await prisma.policySource.findUnique({
      where: { id: src.id },
    });
    if (!existing) {
      await prisma.policySource.create({
        data: {
          id: src.id,
          name: src.name,
          authorityName: src.authorityName,
          authorityType: src.authorityType,
          jurisdictionCode: src.jurisdictionCode,
          officialUrl: src.officialUrl,
          publishedAt: src.publishedAt ? new Date(src.publishedAt) : null,
          lastAuditedAt: new Date(src.lastAuditedAt),
          verificationStatus: "UNVERIFIED",
        },
      });
      sourcesImported++;
    }
  }

  // 3. Import candidate rules (idempotent, PENDING_APPROVAL and UNVERIFIED)
  for (const cand of CANDIDATE_POLICY_RULES) {
    const existing = await prisma.policyRule.findUnique({
      where: { code: cand.code },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const rule = await tx.policyRule.create({
        data: {
          id: cand.id,
          code: cand.code,
          title: cand.title,
          authorityType: cand.authorityType,
          jurisdictionCode: cand.jurisdictionCode,
          subJurisdiction: cand.subJurisdiction,
          platformCode: cand.platformCode,
          industry: cand.industry,
          category: cand.category,
          currentVersionNumber: 1,
        },
      });

      const ver = cand.currentVersion;
      const createdVersion = await tx.policyRuleVersion.create({
        data: {
          id: ver.id,
          ruleId: rule.id,
          versionNumber: 1,
          title: ver.title,
          summary: ver.summary,
          legalExplanation: ver.legalExplanation,
          remediationAction: ver.remediationAction,
          applicabilityConditions: ver.applicabilityConditions,
          exceptions: ver.exceptions,
          effectiveFrom: new Date(ver.effectiveFrom),
          effectiveTo: ver.effectiveTo ? new Date(ver.effectiveTo) : null,
          status: "PENDING_APPROVAL", // Never auto-approved!
          verificationStatus: "UNVERIFIED", // Never auto-verified!
          changeSummary: ver.changeSummary,
          // The importing administrator is the maker: a second administrator must approve.
          createdById: user.id,
        },
      });

      for (const s of ver.sources) {
        await tx.policyRuleVersionSource.create({
          data: {
            id: s.id,
            versionId: createdVersion.id,
            sourceId: s.sourceId,
            sectionReference: s.sectionReference,
            sectionTitle: s.sectionTitle,
            directUrl: s.directUrl,
            excerpt: s.excerpt,
          },
        });
      }
    });

    rulesImported++;
  }

  return {
    sourcesImported,
    rulesImported,
    message: `Successfully imported ${sourcesImported} official sources and ${rulesImported} candidate rules as PENDING_APPROVAL and UNVERIFIED.`,
  };
}
