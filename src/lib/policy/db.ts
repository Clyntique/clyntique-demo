import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/dal";
import type {
  PolicyFilterCriteria,
  PolicyRule,
  PolicyRuleVersion,
  PolicySource,
} from "./types";
import { filterPolicyRules } from "./search";
import { assertPolicyAdmin, canApprovePolicyVersion, canVerifyPolicyVersion } from "./auth";
import { CANDIDATE_POLICY_RULES, CANDIDATE_POLICY_SOURCES } from "./candidates";
import {
  LIMITS,
  ruleCode,
  validateCitations,
  validateRuleScope,
  validateSource,
  validateVersionContent,
  type CitationInput,
  type SourceInput,
  type ValidCitation,
  type ValidVersionContent,
  type VersionContentInput,
} from "./validate";

/**
 * PostgreSQL Data Access Layer for the Clyntique Compliance Policy Library.
 *
 * Guarantees:
 * 1. PostgreSQL persistence via Prisma only; with 0 rules the UI shows 0.
 * 2. New rules, versions and sources start UNVERIFIED and are never active.
 * 3. Lifecycle of a version (P0, Oct 27):
 *      DRAFT (editable) ──submit──► PENDING_APPROVAL + UNVERIFIED
 *        ▲                              │ verify (admin A, sources verified)
 *        └──── return for review ◄──────┤
 *                                       ▼
 *                         PENDING_APPROVAL + VERIFIED ──approve (admin B ≠ A, ≠ author)──► ACTIVE
 *      Rejected versions stay as history (REJECTED) and can't be edited.
 * 4. Approved (ACTIVE) and DEPRECATED versions are immutable. Nothing is ever
 *    deleted; every command appends a PolicyRuleEvent in its transaction.
 * 5. Every input is validated on the server (./validate.ts).
 */

const VERSION_INCLUDE = {
  sources: { include: { source: true } },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  verifiedBy: { select: { id: true, name: true } },
} as const;

type SourceRow = {
  id: string;
  name: string;
  authorityName: string;
  authorityType: PolicySource["authorityType"];
  jurisdictionCode: string;
  officialUrl: string;
  publishedAt: Date | null;
  lastAuditedAt: Date;
  verificationStatus: PolicySource["verificationStatus"];
  sourceKind?: PolicySource["sourceKind"];
  accessNote?: string | null;
  verifiedById?: string | null;
  verifiedAt?: Date | null;
  verificationNote?: string | null;
  verifiedBy?: { name: string } | null;
};

function toSource(r: SourceRow): PolicySource {
  return {
    id: r.id,
    name: r.name,
    authorityName: r.authorityName,
    authorityType: r.authorityType,
    jurisdictionCode: r.jurisdictionCode,
    officialUrl: r.officialUrl,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : undefined,
    lastAuditedAt: r.lastAuditedAt.toISOString(),
    verificationStatus: r.verificationStatus,
    sourceKind: r.sourceKind ?? null,
    accessNote: r.accessNote ?? null,
    verifiedById: r.verifiedById ?? null,
    verifiedByName: r.verifiedBy?.name ?? null,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    verificationNote: r.verificationNote ?? null,
  };
}

/** Valid market and platform codes, for validating rule scope and sources. */
async function referenceCodes() {
  const [markets, platforms] = await Promise.all([
    prisma.market.findMany({ select: { code: true } }),
    prisma.adPlatform.findMany({ select: { code: true } }),
  ]);
  return { jurisdictions: (markets ?? []).map((m) => m.code), platforms: (platforms ?? []).map((p) => p.code) };
}

// ---------------------------------------------------------------------------
// Sources

export async function getDbPolicySources(): Promise<PolicySource[]> {
  const rows = await prisma.policySource.findMany({
    orderBy: { createdAt: "asc" },
    include: { verifiedBy: { select: { name: true } } },
  });
  return rows.map(toSource);
}

export async function createDbPolicySource(input: SourceInput, user: CurrentUser): Promise<{ source: PolicySource; warnings: string[] }> {
  assertPolicyAdmin(user);
  const { jurisdictions } = await referenceCodes();
  const valid = validateSource(input, jurisdictions);
  if (!valid.ok) throw new Error(valid.error);
  const { warnings, ...data } = valid.value;
  const created = await prisma.$transaction(async (tx) => {
    const source = await tx.policySource.create({ data: { ...data, verificationStatus: "UNVERIFIED" } });
    await tx.policyRuleEvent.create({ data: { sourceId: source.id, kind: "SOURCE_CREATED", actorId: user.id, note: `${source.name} added as UNVERIFIED.` } });
    return source;
  });
  return { source: toSource(created), warnings };
}

/**
 * Edits a source. Editing a VERIFIED source sets it back to UNVERIFIED: a
 * changed source must be checked again before rules citing it reach the AI.
 */
export async function updateDbPolicySource(sourceId: string, input: SourceInput, user: CurrentUser): Promise<{ source: PolicySource; warnings: string[] }> {
  assertPolicyAdmin(user);
  const existing = await prisma.policySource.findUnique({ where: { id: String(sourceId ?? "") } });
  if (!existing) throw new Error("This policy source no longer exists.");
  const { jurisdictions } = await referenceCodes();
  const valid = validateSource(input, jurisdictions);
  if (!valid.ok) throw new Error(valid.error);
  const { warnings, ...data } = valid.value;
  const wasVerified = existing.verificationStatus === "VERIFIED";
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.policySource.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data: { ...data, verificationStatus: "UNVERIFIED", verifiedById: null, verifiedAt: null, verificationNote: null },
    });
    if (!count) throw new Error("This source changed meanwhile. Refresh and try again.");
    await tx.policyRuleEvent.create({
      data: { sourceId: existing.id, kind: "SOURCE_EDITED", actorId: user.id, note: wasVerified ? "Edited; verification cleared, must be verified again." : "Edited." },
    });
    return tx.policySource.findUniqueOrThrow({ where: { id: existing.id }, include: { verifiedBy: { select: { name: true } } } });
  });
  return { source: toSource(updated), warnings };
}

export type SourceReviewResult = "VERIFIED" | "REQUIRES_REVIEW" | "REJECTED";

/**
 * A policy admin records that they checked the source: the URL is the
 * publisher's own, current page (VERIFIED), or it needs another look
 * (REQUIRES_REVIEW), or it is not a usable official source (REJECTED).
 */
export async function verifyDbPolicySource(
  sourceId: string,
  user: CurrentUser,
  review: { result?: SourceReviewResult; note?: string } = {},
): Promise<PolicySource> {
  assertPolicyAdmin(user);
  const result: SourceReviewResult = review.result ?? "VERIFIED";
  if (!["VERIFIED", "REQUIRES_REVIEW", "REJECTED"].includes(result)) throw new Error("Choose a valid verification result.");
  const note = String(review.note ?? "").trim();
  if (note.length > LIMITS.note) throw new Error(`Keep the note under ${LIMITS.note} characters.`);
  if (result !== "VERIFIED" && note.length < 5) throw new Error("Say why the source needs review or was rejected.");

  const existing = await prisma.policySource.findUnique({ where: { id: sourceId } });
  if (!existing) throw new Error(`Policy source '${sourceId}' not found in database.`);

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.policySource.update({
      where: { id: sourceId },
      data: {
        verificationStatus: result,
        verifiedById: result === "VERIFIED" ? user.id : null,
        verifiedAt: result === "VERIFIED" ? now : null,
        verificationNote: note || null,
        lastAuditedAt: now,
      },
      include: { verifiedBy: { select: { name: true } } },
    });
    await tx.policyRuleEvent.create({
      data: { sourceId, kind: result === "VERIFIED" ? "SOURCE_VERIFIED" : "SOURCE_EDITED", actorId: user.id, note: [result === "VERIFIED" ? "Verified" : `Marked ${result}`, note || null].filter(Boolean).join(" · ") },
    });
    return row;
  });
  return toSource(updated);
}

// ---------------------------------------------------------------------------
// Rules

type VersionRow = Awaited<ReturnType<typeof loadRules>>[number]["versions"][number];

function toVersion(v: VersionRow): PolicyRuleVersion {
  return {
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
    restrictionLevel: v.restrictionLevel ?? null,
    restrictedClaims: v.restrictedClaims ?? [],
    substantiationRequirements: v.substantiationRequirements ?? [],
    officialEffectiveDate: v.officialEffectiveDate ? v.officialEffectiveDate.toISOString() : null,
    verifiedById: v.verifiedById ?? null,
    verifiedByName: v.verifiedBy?.name ?? null,
    verifiedAt: v.verifiedAt ? v.verifiedAt.toISOString() : null,
    verificationNote: v.verificationNote ?? null,
    reviewNote: v.reviewNote ?? null,
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
      sourceOfficialUrl: s.source.officialUrl,
      sourceUpdatedAt: s.sourceUpdatedAt ? s.sourceUpdatedAt.toISOString() : null,
      retrievedAt: s.retrievedAt ? s.retrievedAt.toISOString() : null,
    })),
  };
}

function loadRules(where?: { id: string }) {
  return prisma.policyRule.findMany({
    where,
    include: { versions: { include: VERSION_INCLUDE, orderBy: { versionNumber: "desc" } } },
    orderBy: { code: "asc" },
  });
}

export async function getDbPolicyRules(criteria?: PolicyFilterCriteria): Promise<PolicyRule[]> {
  const rules = await loadRules();
  const formatted: PolicyRule[] = rules.map((r) => {
    const versions = r.versions.map(toVersion);
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

type CitationArg = Omit<CitationInput, "sourceId" | "sectionReference" | "sectionTitle" | "directUrl"> & {
  sourceId: string;
  sectionReference: string;
  sectionTitle: string;
  directUrl: string;
  excerpt?: string;
  sourceUpdatedAt?: string | null;
  retrievedAt?: string | null;
};

type ContentArg = {
  summary: string;
  legalExplanation: string;
  remediationAction: string;
  applicabilityConditions: string[];
  exceptions?: string[];
  restrictionLevel?: string | null;
  restrictedClaims?: string[];
  substantiationRequirements?: string[];
  officialEffectiveDate?: string | null;
  /** Clyntique's own "in use from"; empty = from approval. */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  reviewNote?: string | null;
  sources: CitationArg[];
};

export interface CreatePolicyRuleInput extends ContentArg {
  code: string;
  title: string;
  authorityType: PolicyRule["authorityType"];
  jurisdictionCode: string;
  subJurisdiction?: string | null;
  platformCode?: string | null;
  industry: string;
  category: PolicyRule["category"];
  status: "DRAFT" | "PENDING_APPROVAL";
}

/** Content checks shared by create, propose and edit. Citations must point at existing sources. */
async function checkContent(title: unknown, input: ContentArg, submitting: boolean): Promise<{ content: ValidVersionContent; citations: ValidCitation[] }> {
  const content = validateVersionContent({ ...input, title } satisfies VersionContentInput);
  if (!content.ok) throw new Error(content.error);
  const cites = validateCitations(input.sources, { required: submitting });
  if (!cites.ok) throw new Error(cites.error);
  const ids = [...new Set(cites.value.citations.map((c) => c.sourceId))];
  if (ids.length) {
    const found = await prisma.policySource.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new Error("A cited source does not exist. Add the source first.");
  }
  return { content: content.value, citations: cites.value.citations };
}

function versionData(content: ValidVersionContent) {
  return {
    title: content.title,
    summary: content.summary,
    legalExplanation: content.legalExplanation,
    remediationAction: content.remediationAction,
    applicabilityConditions: content.applicabilityConditions,
    exceptions: content.exceptions,
    restrictionLevel: content.restrictionLevel,
    restrictedClaims: content.restrictedClaims,
    substantiationRequirements: content.substantiationRequirements,
    officialEffectiveDate: content.officialEffectiveDate,
    // The internal "in use" window. Without a chosen start, approval sets it.
    ...(content.effectiveFrom ? { effectiveFrom: content.effectiveFrom } : {}),
    effectiveTo: content.effectiveTo,
    reviewNote: content.reviewNote,
  };
}

export async function createDbPolicyRule(input: CreatePolicyRuleInput, user: CurrentUser): Promise<PolicyRule> {
  assertPolicyAdmin(user);

  const code = ruleCode(input.code);
  if (!code.ok) throw new Error(code.error);
  const scope = validateRuleScope(input, await referenceCodes());
  if (!scope.ok) throw new Error(scope.error);
  // Never trust the submitted status: a new rule starts as DRAFT or PENDING_APPROVAL only.
  const status = input.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "DRAFT";
  const { content, citations } = await checkContent(input.title, input, status === "PENDING_APPROVAL");

  const existing = await prisma.policyRule.findUnique({ where: { code: code.value } });
  if (existing) throw new Error(`Rule code '${code.value}' already exists in PostgreSQL.`);

  const created = await prisma.$transaction(async (tx) => {
    const rule = await tx.policyRule.create({
      data: { code: code.value, title: content.title, ...scope.value, currentVersionNumber: 1 },
    });
    const version = await tx.policyRuleVersion.create({
      data: {
        ruleId: rule.id,
        versionNumber: 1,
        ...versionData(content),
        status,
        verificationStatus: "UNVERIFIED",
        changeSummary: "Initial version created in Policy Library.",
        createdById: user.id,
      },
    });
    for (const c of citations) await tx.policyRuleVersionSource.create({ data: { versionId: version.id, ...c } });
    await tx.policyRuleEvent.create({
      data: { ruleId: rule.id, versionId: version.id, kind: "RULE_CREATED", actorId: user.id, note: `v1 created as ${version.status}; not active until verified and approved.` },
    });
    return rule.id;
  });

  const fullRule = await getDbPolicyRuleById(created);
  if (!fullRule) throw new Error("Failed to retrieve created policy rule.");
  return fullRule;
}

export interface ProposeNewVersionInput extends ContentArg {
  ruleId: string;
  title: string;
  changeSummary: string;
  /** Default PENDING_APPROVAL (submitted for verification). */
  status?: "DRAFT" | "PENDING_APPROVAL";
}

export async function proposeDbRuleVersion(input: ProposeNewVersionInput, user: CurrentUser): Promise<PolicyRuleVersion> {
  assertPolicyAdmin(user);

  const rule = await prisma.policyRule.findUnique({
    where: { id: input.ruleId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!rule) throw new Error(`Policy rule ${input.ruleId} not found.`);
  if (rule.versions.some((v) => v.status === "PENDING_APPROVAL" || (v.status === "DRAFT" && v.verificationStatus !== "REJECTED"))) {
    throw new Error("This rule already has a version in progress. Finish, return or reject it before proposing another.");
  }
  const changeSummary = String(input.changeSummary ?? "").trim();
  if (changeSummary.length < 5 || changeSummary.length > LIMITS.note) throw new Error("Say what changed in this version (5–1000 characters).");
  const status = input.status === "DRAFT" ? "DRAFT" : "PENDING_APPROVAL";
  const { content, citations } = await checkContent(input.title, input, status === "PENDING_APPROVAL");

  const nextVersionNumber = (rule.versions[0]?.versionNumber ?? 0) + 1;

  const newVersionId = await prisma.$transaction(async (tx) => {
    const version = await tx.policyRuleVersion.create({
      data: {
        ruleId: rule.id,
        versionNumber: nextVersionNumber,
        ...versionData(content),
        status,
        verificationStatus: "UNVERIFIED",
        changeSummary,
        createdById: user.id,
      },
    });
    for (const c of citations) await tx.policyRuleVersionSource.create({ data: { versionId: version.id, ...c } });
    await tx.policyRule.update({ where: { id: rule.id }, data: { updatedAt: new Date() } });
    await tx.policyRuleEvent.create({
      data: { ruleId: rule.id, versionId: version.id, kind: "VERSION_PROPOSED", actorId: user.id, note: `v${nextVersionNumber} proposed as ${status}: ${changeSummary}` },
    });
    return version.id;
  });

  return loadVersion(rule.id, newVersionId);
}

async function loadVersion(ruleId: string, versionId: string) {
  const reloaded = await getDbPolicyRuleById(ruleId);
  const target = reloaded?.versions.find((v) => v.id === versionId);
  if (!target) throw new Error("Failed to load the rule version.");
  return target;
}

export interface EditDraftVersionInput extends ContentArg {
  versionId: string;
  title: string;
  /** Rule-level scope; changeable only while the rule has never been active. */
  scope?: {
    authorityType: PolicyRule["authorityType"];
    jurisdictionCode: string;
    subJurisdiction?: string | null;
    platformCode?: string | null;
    industry: string;
    category: PolicyRule["category"];
  };
}

/**
 * Edits a DRAFT version (new, or returned for review). Citations are replaced.
 * Anything submitted, approved, deprecated or rejected can't be edited.
 */
export async function updateDbDraftRuleVersion(input: EditDraftVersionInput, user: CurrentUser): Promise<PolicyRuleVersion> {
  assertPolicyAdmin(user);
  const version = await prisma.policyRuleVersion.findUnique({
    where: { id: String(input.versionId ?? "") },
    include: { rule: { include: { versions: { select: { status: true, approvedAt: true } } } } },
  });
  if (!version) throw new Error("This rule version no longer exists.");
  if (version.status !== "DRAFT" || version.verificationStatus === "REJECTED" || version.verificationStatus === "VERIFIED") {
    throw new Error("Only a draft version can be edited. Submitted, approved and rejected versions stay as they are.");
  }
  const { content, citations } = await checkContent(input.title, input, false);
  let scopeData: Record<string, unknown> | null = null;
  if (input.scope) {
    if (version.rule.versions.some((v) => v.approvedAt)) throw new Error("This rule has been approved before, so its platform, market, industry and category are fixed. Create a new rule instead.");
    const scope = validateRuleScope(input.scope, await referenceCodes());
    if (!scope.ok) throw new Error(scope.error);
    scopeData = scope.value;
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.policyRuleVersion.updateMany({
      where: { id: version.id, status: "DRAFT", updatedAt: version.updatedAt },
      data: versionData(content),
    });
    if (!count) throw new Error("This version changed meanwhile. Refresh and try again.");
    // Draft citations were never relied on (the version never reached verification), so they can be replaced.
    await tx.policyRuleVersionSource.deleteMany({ where: { versionId: version.id } });
    for (const c of citations) await tx.policyRuleVersionSource.create({ data: { versionId: version.id, ...c } });
    await tx.policyRule.update({
      where: { id: version.ruleId },
      data: { ...(scopeData ?? {}), ...(version.versionNumber === 1 && !version.rule.versions.some((v) => v.approvedAt) ? { title: content.title } : {}), updatedAt: new Date() },
    });
    await tx.policyRuleEvent.create({ data: { ruleId: version.ruleId, versionId: version.id, kind: "VERSION_EDITED", actorId: user.id, note: `v${version.versionNumber} draft edited.` } });
  });
  return loadVersion(version.ruleId, version.id);
}

/** DRAFT → PENDING_APPROVAL (UNVERIFIED): ready for a verifier. Needs ≥1 citation. */
export async function submitDbRuleVersion(versionId: string, user: CurrentUser): Promise<PolicyRuleVersion> {
  assertPolicyAdmin(user);
  const version = await prisma.policyRuleVersion.findUnique({ where: { id: String(versionId ?? "") }, include: { sources: true } });
  if (!version) throw new Error("This rule version no longer exists.");
  if (version.status !== "DRAFT" || version.verificationStatus === "REJECTED") throw new Error("Only a draft can be submitted for verification.");
  if (version.sources.length === 0) throw new Error("Cite at least one official source section before submitting.");
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.policyRuleVersion.updateMany({
      where: { id: version.id, status: "DRAFT", updatedAt: version.updatedAt },
      data: { status: "PENDING_APPROVAL", verificationStatus: "UNVERIFIED" },
    });
    if (!count) throw new Error("This version changed meanwhile. Refresh and try again.");
    await tx.policyRuleEvent.create({ data: { ruleId: version.ruleId, versionId: version.id, kind: "VERSION_PROPOSED", actorId: user.id, note: `v${version.versionNumber} submitted for verification.` } });
  });
  return loadVersion(version.ruleId, version.id);
}

export type VersionReviewResult = "VERIFIED" | "REQUIRES_REVIEW" | "REJECTED";

/**
 * The human verification step (decision D1). A policy admin compares the
 * version with its official sources and records the result:
 * - VERIFIED: content matches the cited sources; every cited source must
 *   itself be VERIFIED. Stays PENDING_APPROVAL for a different approver.
 * - REQUIRES_REVIEW: back to DRAFT with the reason, for the author to fix.
 * - REJECTED: kept as history, can't be edited or approved.
 */
export async function verifyDbRuleVersion(
  versionId: string,
  user: CurrentUser,
  review: { result: VersionReviewResult; note?: string },
): Promise<PolicyRuleVersion> {
  assertPolicyAdmin(user);
  const result = review.result;
  if (!["VERIFIED", "REQUIRES_REVIEW", "REJECTED"].includes(result)) throw new Error("Choose a valid verification result.");
  const note = String(review.note ?? "").trim();
  if (note.length > LIMITS.note) throw new Error(`Keep the note under ${LIMITS.note} characters.`);
  if (result !== "VERIFIED" && note.length < 5) throw new Error("Say what needs review, or why the version is rejected.");

  const version = await prisma.policyRuleVersion.findUnique({ where: { id: String(versionId ?? "") }, include: { sources: { include: { source: true } } } });
  if (!version) throw new Error("This rule version no longer exists.");
  const check = canVerifyPolicyVersion(user, version);
  if (!check.allowed) throw new Error(check.reason);
  if (result === "VERIFIED") {
    if (version.sources.length === 0) throw new Error("A version without a cited source can't be verified.");
    const unverified = version.sources.find((s) => s.source.verificationStatus !== "VERIFIED");
    if (unverified) throw new Error(`Verify the cited source "${unverified.source.name}" first.`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const data =
      result === "VERIFIED"
        ? { verificationStatus: "VERIFIED" as const, verifiedById: user.id, verifiedAt: now, verificationNote: note || null }
        : result === "REQUIRES_REVIEW"
          ? { status: "DRAFT" as const, verificationStatus: "REQUIRES_REVIEW" as const, reviewNote: note, verifiedById: null, verifiedAt: null, verificationNote: null }
          : { status: "DRAFT" as const, verificationStatus: "REJECTED" as const, reviewNote: note, verifiedById: null, verifiedAt: null, verificationNote: null };
    const { count } = await tx.policyRuleVersion.updateMany({
      where: { id: version.id, status: "PENDING_APPROVAL", verificationStatus: "UNVERIFIED" },
      data,
    });
    if (!count) throw new Error("This version changed meanwhile. Refresh and try again.");
    await tx.policyRuleEvent.create({
      data: {
        ruleId: version.ruleId,
        versionId: version.id,
        kind: result === "VERIFIED" ? "VERSION_VERIFIED" : result === "REQUIRES_REVIEW" ? "VERSION_RETURNED" : "VERSION_REJECTED",
        actorId: user.id,
        note: [`v${version.versionNumber} ${result === "VERIFIED" ? "verified against its sources" : result === "REQUIRES_REVIEW" ? "returned for review" : "rejected"}`, note || null].filter(Boolean).join(" · "),
      },
    });
  });
  return loadVersion(version.ruleId, version.id);
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

  // Two-person control: verified by someone else, never approved by its author.
  const check = canApprovePolicyVersion(user, targetVersion);
  if (!check.allowed) {
    throw new Error(check.reason ?? "Approval denied by two-person policy control.");
  }

  // Independent source verification check: every cited source must still be VERIFIED.
  const citedSources = await prisma.policyRuleVersionSource.findMany({
    where: { versionId },
    include: { source: true },
  });
  if (citedSources.length === 0) throw new Error("A version without a cited source can't be approved.");
  const unverifiedSource = citedSources.find((cs) => cs.source.verificationStatus !== "VERIFIED");
  if (unverifiedSource) {
    throw new Error(
      `Cannot approve policy rule version: cited source "${unverifiedSource.source.name}" must be independently audited and VERIFIED by a Policy Administrator first.`
    );
  }

  const now = new Date();
  const note = String(auditNote ?? "").trim().slice(0, LIMITS.note);

  await prisma.$transaction(async (tx) => {
    // Deprecate earlier active versions for this rule
    const superseded = await tx.policyRuleVersion.findMany({ where: { ruleId, status: "ACTIVE", id: { not: versionId } }, select: { versionNumber: true } });
    await tx.policyRuleVersion.updateMany({
      where: { ruleId, status: "ACTIVE", id: { not: versionId } },
      data: { status: "DEPRECATED", effectiveTo: now },
    });

    // Activate the target only if it is still pending and verified (two
    // approvers clicking at once, or a version returned meanwhile). The
    // verification itself is not touched: it was recorded by the verifier.
    const approved = await tx.policyRuleVersion.updateMany({
      where: { id: versionId, ruleId, status: "PENDING_APPROVAL", verificationStatus: "VERIFIED", verifiedById: targetVersion.verifiedById },
      data: {
        status: "ACTIVE",
        approvedById: user.id,
        approvedAt: now,
        // In use from approval unless the author chose a later start.
        ...(targetVersion.effectiveFrom > now ? {} : { effectiveFrom: now }),
      },
    });
    if (!approved.count) throw new Error("This version changed meanwhile. Refresh and try again.");

    // Advance rule pointer to the approved version number
    await tx.policyRule.update({
      where: { id: ruleId },
      data: { currentVersionNumber: targetVersion.versionNumber, updatedAt: now },
    });

    // The rule-change event impact analysis starts from (Oct 19 sprint).
    await tx.policyRuleEvent.create({
      data: {
        ruleId,
        versionId,
        kind: "VERSION_APPROVED",
        actorId: user.id,
        note: [
          `v${targetVersion.versionNumber} approved`,
          superseded.length ? `supersedes ${superseded.map((v) => `v${v.versionNumber}`).join(", ")}` : "first active version",
          note || null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
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
  const note = String(auditNote ?? "").trim().slice(0, LIMITS.note);
  await prisma.$transaction(async (tx) => {
    const activeVersions = await tx.policyRuleVersion.findMany({
      where: { ruleId, status: "ACTIVE" },
    });

    // The author's change summary stays as written; the reason is on the event.
    await tx.policyRuleVersion.updateMany({
      where: { ruleId, status: "ACTIVE" },
      data: { status: "DEPRECATED", effectiveTo: now },
    });

    await tx.policyRule.update({
      where: { id: ruleId },
      data: { updatedAt: now },
    });

    await tx.policyRuleEvent.create({
      data: {
        ruleId,
        versionId: activeVersions[0]?.id ?? null,
        kind: "RULE_RETIRED",
        actorId: user.id,
        note: [activeVersions.length ? `retired ${activeVersions.map((v) => `v${v.versionNumber}`).join(", ")}` : "no active version", note || null].filter(Boolean).join(" · "),
      },
    });
  });
}

/** History of one rule (and the sources its versions cite), newest first. */
export async function getDbPolicyHistory(ruleId: string) {
  const versions = await prisma.policyRuleVersion.findMany({ where: { ruleId }, select: { sources: { select: { sourceId: true } } } });
  const sourceIds = [...new Set(versions.flatMap((v) => v.sources.map((s) => s.sourceId)))];
  const events = await prisma.policyRuleEvent.findMany({
    where: { OR: [{ ruleId }, ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : [])] },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, kind: true, note: true, createdAt: true, actor: { select: { name: true } }, version: { select: { versionNumber: true } }, source: { select: { name: true } } },
  });
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
    actorName: e.actor.name,
    versionNumber: e.version?.versionNumber ?? null,
    sourceName: e.source?.name ?? null,
  }));
}

/**
 * Research candidates (disabled by default, see actions.ts). Imports official
 * candidate policies as UNVERIFIED DRAFTS: never verified, never approved.
 * The importing administrator is the author, so a different administrator
 * must approve after someone verifies.
 */
export async function importCandidatePoliciesToDb(
  user: CurrentUser
): Promise<{ sourcesImported: number; rulesImported: number; message: string }> {
  assertPolicyAdmin(user);

  let sourcesImported = 0;
  let rulesImported = 0;

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

      await tx.policyRuleEvent.create({
        data: { ruleId: rule.id, versionId: createdVersion.id, kind: "RULE_CREATED", actorId: user.id, note: "Imported research candidate as UNVERIFIED; not active." },
      });
    });

    rulesImported++;
  }

  return {
    sourcesImported,
    rulesImported,
    message: `Imported ${sourcesImported} sources and ${rulesImported} candidate rules as UNVERIFIED drafts. Nothing was verified or approved.`,
  };
}
