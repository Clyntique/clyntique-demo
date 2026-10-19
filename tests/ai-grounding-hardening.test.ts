import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { createPrismaMock, type PrismaMock } from "./helpers";
import { filterApplicableVerifiedRules, policyIndustry, INSUFFICIENT_POLICY_COVERAGE } from "@/lib/ai/applicability";
import type { PolicyRule } from "@/lib/policy/types";
import type { AIComplianceProvider, AISuggestedFinding } from "@/lib/ai/types";

// Grounding boundary, failed-scan handling, submitted-snapshot privacy and
// server-side re-validation of accepted AI suggestions. All rules here are
// SYNTHETIC TEST FIXTURES: not real regulations or platform policies.
const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock, user: null as CurrentUser | null }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: vi.fn(async () => h.user) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { analyzeCreativeCompliance, clearAnalysisCache, NO_SUGGESTIONS_SUMMARY } = await import("@/lib/ai/service");
const { acceptAIFindingAction } = await import("@/lib/ai/actions");
const { importCandidatesServerAction } = await import("@/lib/policy/actions");

const TEAM: CurrentUser = { id: "team-1", name: "Reviewer", email: "r@test.invalid", role: "TEAM" };

function rule(over: Partial<PolicyRule> & { version?: Partial<PolicyRule["currentVersion"]> } = {}): PolicyRule {
  const { version, ...rest } = over;
  const currentVersion = {
    id: "ver-syn-1",
    ruleId: "rule-syn-1",
    versionNumber: 2,
    title: "SYNTHETIC rule",
    summary: "Synthetic summary",
    legalExplanation: "Synthetic explanation",
    remediationAction: "Synthetic remediation",
    applicabilityConditions: [],
    exceptions: [],
    effectiveFrom: "2026-01-01T00:00:00Z",
    effectiveTo: null,
    status: "ACTIVE" as const,
    verificationStatus: "VERIFIED" as const,
    changeSummary: "test",
    createdById: "a",
    createdByName: "A",
    createdAt: "2026-01-01T00:00:00Z",
    sources: [
      {
        id: "cit-1",
        sourceId: "src-syn",
        sourceName: "SYNTHETIC TEST SOURCE",
        authorityName: "Synthetic Authority",
        sectionReference: "SYN §1",
        sectionTitle: "Synthetic",
        directUrl: "https://example.test/synthetic",
        excerpt: "Synthetic excerpt",
        sourceVerificationStatus: "VERIFIED" as const,
      },
    ],
    ...version,
  };
  return {
    id: "rule-syn-1",
    code: "SYN-TEST-01",
    title: "SYNTHETIC rule",
    authorityType: "INTERNAL_RISK",
    jurisdictionCode: "US",
    subJurisdiction: null,
    platformCode: null,
    industry: "GENERAL",
    category: "DISCLOSURE",
    currentVersionNumber: 2,
    currentVersion,
    versions: [currentVersion],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...rest,
  } as PolicyRule;
}

const NOW = new Date("2026-10-16T12:00:00Z");
const ctx = { markets: ["US"], platforms: ["META"], industry: null };

describe("filterApplicableVerifiedRules", () => {
  it("accepts an active, verified, in-effect rule with verified sources", () => {
    expect(filterApplicableVerifiedRules([rule()], ctx, NOW)).toHaveLength(1);
  });

  it("rejects rules not in effect, without sources, or citing an unverified source", () => {
    expect(filterApplicableVerifiedRules([rule({ version: { effectiveFrom: "2027-01-01T00:00:00Z" } })], ctx, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([rule({ version: { effectiveTo: "2026-02-01T00:00:00Z" } })], ctx, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([rule({ version: { sources: [] } })], ctx, NOW)).toHaveLength(0);
    const unverified = rule();
    unverified.currentVersion.sources[0].sourceVerificationStatus = "UNVERIFIED";
    expect(filterApplicableVerifiedRules([unverified], ctx, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([rule({ version: { status: "PENDING_APPROVAL" } })], ctx, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([rule({ version: { verificationStatus: "UNVERIFIED" } })], ctx, NOW)).toHaveLength(0);
  });

  it("matches industry only when the work's industry is known", () => {
    const healthcare = rule({ industry: "HEALTHCARE" });
    expect(filterApplicableVerifiedRules([healthcare], ctx, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([healthcare], { ...ctx, industry: "HEALTHCARE" }, NOW)).toHaveLength(1);
    expect(filterApplicableVerifiedRules([healthcare], { ...ctx, industry: "RETAIL" }, NOW)).toHaveLength(0);
    expect(policyIndustry({})).toBeNull();
    expect(policyIndustry({ POLICY_DEFAULT_INDUSTRY: " healthcare " })).toBe("HEALTHCARE");
  });

  it("matches jurisdiction, sub-jurisdiction and platform", () => {
    expect(filterApplicableVerifiedRules([rule({ jurisdictionCode: "CA" })], { ...ctx, markets: ["CA-ON"] }, NOW)).toHaveLength(1);
    expect(filterApplicableVerifiedRules([rule({ jurisdictionCode: "AE" })], ctx, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([rule({ jurisdictionCode: "GLOBAL" })], { ...ctx, markets: ["JP"] }, NOW)).toHaveLength(1);
    const dubai = rule({ jurisdictionCode: "AE", subJurisdiction: "Dubai" });
    expect(filterApplicableVerifiedRules([dubai], { ...ctx, markets: ["AE"] }, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([dubai], { ...ctx, markets: ["AE"], marketNames: ["Dubai"] }, NOW)).toHaveLength(1);
    expect(filterApplicableVerifiedRules([rule({ platformCode: "TIKTOK" })], ctx, NOW)).toHaveLength(0);
    expect(filterApplicableVerifiedRules([rule({ platformCode: "META" })], ctx, NOW)).toHaveLength(1);
  });
});

// --- Service --------------------------------------------------------------

function dbRule(over: { verificationStatus?: string; sourceStatus?: string } = {}) {
  return {
    id: "rule-syn-1",
    code: "SYN-TEST-01",
    title: "SYNTHETIC rule",
    authorityType: "INTERNAL_RISK",
    jurisdictionCode: "US",
    subJurisdiction: null,
    platformCode: null,
    industry: "GENERAL",
    category: "DISCLOSURE",
    currentVersionNumber: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: "ver-syn-2",
        ruleId: "rule-syn-1",
        versionNumber: 2,
        title: "SYNTHETIC rule",
        summary: "s",
        legalExplanation: "e",
        remediationAction: "r",
        applicabilityConditions: [],
        exceptions: [],
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
        status: "ACTIVE",
        verificationStatus: over.verificationStatus ?? "VERIFIED",
        changeSummary: "c",
        createdById: "a",
        createdAt: new Date(),
        approvedById: "b",
        approvedAt: new Date(),
        createdBy: { id: "a", name: "A" },
        approvedBy: { id: "b", name: "B" },
        sources: [
          {
            id: "cit-1",
            sourceId: "src-syn",
            sectionReference: "SYN §1",
            sectionTitle: "Synthetic",
            directUrl: "https://example.test/synthetic",
            excerpt: null,
            source: { name: "SYNTHETIC TEST SOURCE", authorityName: "Synthetic", verificationStatus: over.sourceStatus ?? "VERIFIED" },
          },
        ],
      },
    ],
  };
}

function setupCreative(prisma: PrismaMock, opts: { rounds?: unknown[]; rules?: unknown[] } = {}) {
  prisma.creative.findFirst.mockResolvedValue({
    id: "cr-1",
    name: "Live title",
    status: "IN_REVIEW",
    workflow: "SUBMISSION_REVIEW",
    projectId: "p-1",
    project: { name: "P", clientId: "client-a" },
  });
  prisma.creative.findUnique.mockResolvedValue({
    id: "cr-1",
    name: "Client's unsubmitted new title",
    description: "Unsubmitted private description",
    context: "Unsubmitted private context",
    format: "FEED",
    markets: [{ market: { code: "US", name: "United States" } }],
    platforms: [{ platform: { code: "META", name: "Meta" } }],
  });
  prisma.submissionRound.findMany.mockResolvedValue(
    opts.rounds ?? [
      {
        versionId: "v-2",
        submittedName: "Submitted title",
        submittedDescription: "Submitted description",
        submittedContext: "Submitted context",
        version: { id: "v-2", versionNumber: 2, fileUrl: null, mimeType: null },
      },
    ],
  );
  prisma.policyRule.findMany.mockResolvedValue(opts.rules ?? [dbRule()]);
}

const suggestion = (code: string): AISuggestedFinding => ({
  id: "s-1",
  issue: "Synthetic issue",
  severity: "MAJOR",
  requiredAction: "REVISE_CONTENT",
  explanation: "Synthetic explanation",
  actionDetails: "Synthetic action",
  confidenceScore: 0.9,
  policyCitation: { ruleId: "x", ruleCode: code, ruleTitle: "x", authorityType: "REGULATION", jurisdictionCode: "US", sectionReference: "Invented §99", officialUrl: "https://evil.example" },
});

describe("analyzeCreativeCompliance", () => {
  beforeEach(() => {
    h.prisma = createPrismaMock();
    h.user = TEAM;
    clearAnalysisCache();
  });

  it("sends only the submitted snapshot and version to the model, never unsubmitted client edits", async () => {
    setupCreative(h.prisma);
    const provider: AIComplianceProvider = {
      name: "mock",
      analyzeCreative: vi.fn().mockResolvedValue({ status: "SUCCESS", summary: "x", extractedVisualText: [], detectedClaims: [], findings: [] }),
    };
    await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider });
    const input = vi.mocked(provider.analyzeCreative).mock.calls[0][0];
    expect(input.title).toBe("Submitted title");
    expect(input.description).toBe("Submitted description");
    expect(input.context).toBe("Submitted context");
    expect(input.versionId).toBe("v-2");
    expect(JSON.stringify(input)).not.toContain("Unsubmitted");
  });

  it("refuses a version that was never submitted, and a submission with no rounds", async () => {
    setupCreative(h.prisma);
    await expect(analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", versionId: "v-3-private" })).rejects.toThrow(/never submitted/);
    setupCreative(h.prisma, { rounds: [] });
    await expect(analyzeCreativeCompliance(TEAM, { creativeId: "cr-1" })).rejects.toThrow(/hasn't been submitted/);
  });

  it("answers insufficient coverage without calling the model when the only rule cites an unverified source", async () => {
    setupCreative(h.prisma, { rules: [dbRule({ sourceStatus: "UNVERIFIED" })] });
    const provider: AIComplianceProvider = { name: "mock", analyzeCreative: vi.fn() };
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider });
    expect(result.status).toBe("INSUFFICIENT_COVERAGE");
    expect(result.summary).toBe(INSUFFICIENT_POLICY_COVERAGE);
    expect(result.findings).toEqual([]);
    expect(provider.analyzeCreative).not.toHaveBeenCalled();
  });

  it("reports a thrown provider error as ERROR, never as 'no findings'", async () => {
    setupCreative(h.prisma);
    const provider: AIComplianceProvider = { name: "mock", analyzeCreative: vi.fn().mockRejectedValue(new Error("network down")) };
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider });
    expect(result.status).toBe("ERROR");
    expect(result.findings).toEqual([]);
    expect(result.summary).toMatch(/failed/);
  });

  it("drops findings from an incomplete scan and doesn't cache it", async () => {
    setupCreative(h.prisma);
    const provider: AIComplianceProvider = {
      name: "mock",
      analyzeCreative: vi.fn().mockResolvedValue({ status: "ERROR", summary: "parse failure", extractedVisualText: [], detectedClaims: [], findings: [suggestion("SYN-TEST-01")] }),
    };
    const first = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider });
    expect(first.status).toBe("ERROR");
    expect(first.findings).toEqual([]);
    await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider });
    expect(provider.analyzeCreative).toHaveBeenCalledTimes(2);
  });

  it("replaces the model's summary with a non-clearance statement when nothing is suggested", async () => {
    setupCreative(h.prisma);
    const provider: AIComplianceProvider = {
      name: "mock",
      analyzeCreative: vi.fn().mockResolvedValue({
        status: "SUCCESS",
        summary: "The creative is fully compliant and approved for Meta.",
        extractedVisualText: [],
        detectedClaims: [],
        findings: [suggestion("INVENTED-01")],
      }),
    };
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider });
    expect(result.status).toBe("SUCCESS");
    expect(result.findings).toEqual([]);
    expect(result.discardedSuggestions).toBe(1);
    expect(result.summary).toBe(NO_SUGGESTIONS_SUMMARY);
    expect(result.summary).not.toMatch(/approved for/);
    expect(result.rulesChecked).toEqual([{ code: "SYN-TEST-01", title: "SYNTHETIC rule", versionNumber: 2 }]);
  });

  it("rebuilds citations from the Policy Library, ignoring what the model claimed", async () => {
    setupCreative(h.prisma);
    const provider: AIComplianceProvider = {
      name: "mock",
      analyzeCreative: vi.fn().mockResolvedValue({ status: "SUCCESS", summary: "x", extractedVisualText: [], detectedClaims: [], findings: [suggestion("syn-test-01")] }),
    };
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].policyCitation).toMatchObject({
      ruleCode: "SYN-TEST-01",
      ruleVersionId: "ver-syn-2",
      sectionReference: "SYN §1",
      officialUrl: "https://example.test/synthetic",
    });
  });
});

describe("acceptAIFindingAction", () => {
  beforeEach(() => {
    h.prisma = createPrismaMock();
    h.user = TEAM;
  });

  it("refuses a suggestion whose rule is not active and verified for this submission", async () => {
    setupCreative(h.prisma, { rules: [dbRule({ verificationStatus: "UNVERIFIED" })] });
    const res = await acceptAIFindingAction({ creativeId: "cr-1", finding: suggestion("SYN-TEST-01") });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not an active, verified policy/);
    expect(h.prisma.finding.create).not.toHaveBeenCalled();
  });

  it("records a DRAFT finding linked to the exact rule version, with the database citation", async () => {
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 }); // row lock
    setupCreative(h.prisma);
    // recordFinding: the submission is in review with an open round.
    h.prisma.creative.findUnique.mockResolvedValueOnce({
      id: "cr-1",
      name: "x",
      description: null,
      context: null,
      format: "FEED",
      markets: [{ market: { code: "US", name: "United States" } }],
      platforms: [{ platform: { code: "META", name: "Meta" } }],
    });
    h.prisma.creative.findUnique.mockResolvedValue({ id: "cr-1", workflow: "SUBMISSION_REVIEW", status: "IN_REVIEW", project: { clientId: "client-a" } });
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "cy-1", number: 1, closedAt: null });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "rd-1", number: 1, versionId: "v-2", cycleId: "cy-1" });
    h.prisma.finding.create.mockResolvedValue({ id: "f-1" });

    const res = await acceptAIFindingAction({ creativeId: "cr-1", finding: suggestion("SYN-TEST-01") });
    expect(res.error).toBeUndefined();
    expect(res).toMatchObject({ ok: true, findingId: "f-1" });
    const data = h.prisma.finding.create.mock.calls[0][0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.ruleVersionId).toBe("ver-syn-2");
    expect(data.severity).toBe("HIGH");
    expect(data.explanation).toContain("SYN-TEST-01 v2");
    expect(data.explanation).toContain("SYN §1");
    expect(data.explanation).not.toContain("Invented §99");
  });
});

describe("research candidate import", () => {
  it("is disabled unless POLICY_CANDIDATE_IMPORT=enabled", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/dal", () => ({ requireRole: vi.fn(async () => ({ ...TEAM, isPolicyAdmin: true })) }));
    const { importCandidatesServerAction: gated } = await import("@/lib/policy/actions");
    h.prisma = createPrismaMock();
    const res = await gated();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/disabled/);
    expect(h.prisma.policyRule.create).not.toHaveBeenCalled();
    expect(h.prisma.policySource.create).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/auth/dal");
    expect(importCandidatesServerAction).toBeTypeOf("function");
  });
});
