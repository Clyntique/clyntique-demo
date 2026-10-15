import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { createPrismaMock, type PrismaMock } from "./helpers";
import { CANDIDATE_POLICY_RULES, CANDIDATE_POLICY_SOURCES } from "@/lib/policy/candidates";
import { approveDbRuleVersion, verifyDbPolicySource } from "@/lib/policy/db";
import { GeminiAIProvider } from "@/lib/ai/gemini-provider";
import {
  analyzeCreativeCompliance,
  clearAnalysisCache,
  filterApplicableVerifiedRules,
  resetAIProvider,
} from "@/lib/ai/service";
import { runAICreativeScan, acceptAIFindingAction } from "@/lib/ai/actions";
import type {
  AIComplianceProvider,
  CreativeAnalysisInput,
} from "@/lib/ai/types";
import type { PolicyRule } from "@/lib/policy/types";

// Mock @/lib/prisma to test without live DB mutations
const h = vi.hoisted(() => ({
  prisma: null as unknown as PrismaMock,
  user: null as CurrentUser | null,
}));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

vi.mock("@/lib/auth/dal", () => ({
  getCurrentUser: vi.fn(async () => h.user),
}));

describe("M7B: Real Google Gemini AI Integration & Compliance Grounding", () => {
  const teamReviewer: CurrentUser = {
    id: "usr-team-reviewer",
    name: "Team Reviewer",
    email: "reviewer@clyntique.demo",
    role: "TEAM",
    isPolicyAdmin: false,
  };

  const policyAdmin: CurrentUser = {
    id: "usr-policy-admin",
    name: "Policy Administrator",
    email: "admin@clyntique.demo",
    role: "TEAM",
    isPolicyAdmin: true,
  };

  const clientUser: CurrentUser = {
    id: "usr-client-user",
    name: "Client Account",
    email: "client@brand.demo",
    role: "CLIENT",
    isPolicyAdmin: false,
  };

  beforeEach(() => {
    h.prisma = createPrismaMock();
    clearAnalysisCache();
    resetAIProvider();
    vi.clearAllMocks();
  });

  describe("1. Candidate Policy Mappings & Source Verification Governance (Requirement 6)", () => {
    it("has dedicated Meta Misleading Claims and Google Misrepresentation sources", () => {
      const metaSource = CANDIDATE_POLICY_SOURCES.find((s) => s.id === "src-meta-misleading-claims");
      expect(metaSource).toBeDefined();
      expect(metaSource?.officialUrl).toBe("https://transparency.meta.com/policies/ad-standards/deceptive-content/misleading-claims");

      const googleSource = CANDIDATE_POLICY_SOURCES.find((s) => s.id === "src-google-misrepresentation");
      expect(googleSource).toBeDefined();
      expect(googleSource?.officialUrl).toBe("https://support.google.com/adspolicy/answer/6020955");
    });

    it("correctly maps META-CLAIM-02 and GOOG-MISREP-02 to their verified policy sources", () => {
      const metaRule = CANDIDATE_POLICY_RULES.find((r) => r.code === "META-CLAIM-02");
      expect(metaRule).toBeDefined();
      expect(metaRule?.currentVersion.sources[0]?.sourceId).toBe("src-meta-misleading-claims");
      expect(metaRule?.currentVersion.sources[0]?.directUrl).toBe(
        "https://transparency.meta.com/policies/ad-standards/deceptive-content/misleading-claims"
      );

      const googleRule = CANDIDATE_POLICY_RULES.find((r) => r.code === "GOOG-MISREP-02");
      expect(googleRule).toBeDefined();
      expect(googleRule?.currentVersion.sources[0]?.sourceId).toBe("src-google-misrepresentation");
      expect(googleRule?.currentVersion.sources[0]?.directUrl).toBe("https://support.google.com/adspolicy/answer/6020955");
    });

    it("allows a policy administrator to independently verify a policy source", async () => {
      h.prisma.policySource.findUnique.mockResolvedValueOnce({
        id: "src-meta-misleading-claims",
        name: "Meta Advertising Standards: Misleading Claims and Practices (Policy 4.1)",
        verificationStatus: "UNVERIFIED",
        lastAuditedAt: new Date("2026-10-01"),
      });

      h.prisma.policySource.update.mockResolvedValueOnce({
        id: "src-meta-misleading-claims",
        name: "Meta Advertising Standards: Misleading Claims and Practices (Policy 4.1)",
        authorityName: "Meta Business Policy",
        authorityType: "PLATFORM_POLICY",
        jurisdictionCode: "GLOBAL",
        officialUrl: "https://transparency.meta.com/policies/ad-standards/deceptive-content/misleading-claims",
        publishedAt: new Date("2024-01-15"),
        lastAuditedAt: new Date(),
        verificationStatus: "VERIFIED",
      });

      const verified = await verifyDbPolicySource("src-meta-misleading-claims", policyAdmin);
      expect(verified.verificationStatus).toBe("VERIFIED");
    });

    it("rejects source verification if attempted by a non-administrator", async () => {
      await expect(
        verifyDbPolicySource("src-meta-misleading-claims", teamReviewer)
      ).rejects.toThrow(/Policy Administrator rights/);

      await expect(
        verifyDbPolicySource("src-meta-misleading-claims", clientUser)
      ).rejects.toThrow(/Policy Administrator rights/);
    });

    it("strictly blocks rule approval if any cited source is unverified", async () => {
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce({
        id: "ver-cand-meta-claim-02-v1",
        ruleId: "cand-meta-claim-02",
        versionNumber: 1,
        status: "PENDING_APPROVAL",
        verificationStatus: "UNVERIFIED",
        changeSummary: "Candidate rule",
        createdById: "usr-different-author",
      });

      // Cited source is UNVERIFIED
      h.prisma.policyRuleVersionSource.findMany.mockResolvedValueOnce([
        {
          id: "cit-1",
          source: {
            id: "src-meta-misleading-claims",
            name: "Meta Advertising Standards",
            verificationStatus: "UNVERIFIED",
          },
        },
      ]);

      await expect(
        approveDbRuleVersion("cand-meta-claim-02", "ver-cand-meta-claim-02-v1", policyAdmin)
      ).rejects.toThrow(/cited source "Meta Advertising Standards" must be independently audited and VERIFIED/);
    });
  });

  describe("2. AI Provider Abstraction & Model Selection", () => {
    it("implements the AIComplianceProvider interface with Google Gemini", () => {
      const provider = new GeminiAIProvider();
      expect(provider.name).toBe("Google Gemini");
      expect(typeof provider.analyzeCreative).toBe("function");
    });

    it("returns an error result if GEMINI_API_KEY is not configured", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const provider = new GeminiAIProvider();
        const dummyInput: CreativeAnalysisInput = {
          creativeId: "cre-test-1",
          title: "Test Ad",
          format: "IMAGE_SQUARE",
          markets: [{ code: "US", name: "United States" }],
          platforms: [{ code: "META", name: "Meta" }],
          groundedRules: [
            {
              id: "rule-1",
              code: "US-FTC-DISC-01",
              title: "Disclosure Rule",
              authorityType: "REGULATION",
              jurisdictionCode: "US",
              platformCode: null,
              category: "DISCLOSURE",
              summary: "Summary",
              legalExplanation: "Explanation",
              remediationAction: "Remediation",
              applicabilityConditions: [],
              exceptions: [],
              sources: [],
            },
          ],
        };

        const result = await provider.analyzeCreative(dummyInput);
        expect(result.status).toBe("ERROR");
        expect(result.summary).toContain("API key not configured");
      } finally {
        if (originalKey) process.env.GEMINI_API_KEY = originalKey;
      }
    });

    it("enforces safety limit if creative image file exceeds 4MB", async () => {
      const prevKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-api-key-for-size-check";

      try {
        const provider = new GeminiAIProvider();
        const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB

        const result = await provider.analyzeCreative({
          creativeId: "cre-test-2",
          title: "Large Ad",
          format: "IMAGE_SQUARE",
          markets: [],
          platforms: [],
          imageBuffer: oversizedBuffer,
          groundedRules: [
            {
              id: "rule-1",
              code: "US-FTC-DISC-01",
              title: "Rule",
              authorityType: "REGULATION",
              jurisdictionCode: "US",
              platformCode: null,
              category: "DISCLOSURE",
              summary: "Summary",
              legalExplanation: "Explanation",
              remediationAction: "Remediation",
              applicabilityConditions: [],
              exceptions: [],
              sources: [],
            },
          ],
        });

        expect(result.status).toBe("ERROR");
        expect(result.error).toBe("File size limit exceeded");
      } finally {
        if (prevKey) {
          process.env.GEMINI_API_KEY = prevKey;
        } else {
          delete process.env.GEMINI_API_KEY;
        }
      }
    });
  });

  describe("3. Strict Compliance Policy Grounding Boundary", () => {
    const mockRules: PolicyRule[] = [
      {
        id: "rule-us-ftc-1",
        code: "US-FTC-DISC-01",
        title: "FTC Endorsement Disclosure",
        authorityType: "REGULATION",
        jurisdictionCode: "US",
        subJurisdiction: null,
        platformCode: null,
        industry: "HEALTHCARE",
        category: "DISCLOSURE",
        currentVersionNumber: 1,
        currentVersion: {
          id: "v-1",
          ruleId: "rule-us-ftc-1",
          versionNumber: 1,
          title: "FTC Endorsement Disclosure",
          summary: "Disclose material connections",
          legalExplanation: "16 CFR 255",
          remediationAction: "Add clear visual #Ad super",
          applicabilityConditions: ["Targets US"],
          exceptions: [],
          effectiveFrom: "2024-01-01T00:00:00Z",
          effectiveTo: null,
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          changeSummary: "Approved",
          createdById: "usr-1",
          createdByName: "Legal Research",
          createdAt: "2024-01-01T00:00:00Z",
          approvedById: "usr-2",
          approvedByName: "Admin",
          approvedAt: "2024-01-02T00:00:00Z",
          sources: [
            {
              id: "src-cit-1",
              sourceId: "src-1",
              sourceName: "FTC Guides",
              authorityName: "FTC",
              sectionReference: "16 CFR 255.5",
              sectionTitle: "Endorsements",
              directUrl: "https://ftc.gov",
              excerpt: "Disclose clearly",
            },
          ],
        },
        versions: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
      {
        id: "rule-unverified-1",
        code: "DRAFT-UNVERIFIED-01",
        title: "Unverified Rule",
        authorityType: "REGULATION",
        jurisdictionCode: "US",
        subJurisdiction: null,
        platformCode: null,
        industry: "HEALTHCARE",
        category: "DISCLOSURE",
        currentVersionNumber: 1,
        currentVersion: {
          id: "v-draft",
          ruleId: "rule-unverified-1",
          versionNumber: 1,
          title: "Unverified Rule",
          summary: "Unverified",
          legalExplanation: "None",
          remediationAction: "None",
          applicabilityConditions: [],
          exceptions: [],
          effectiveFrom: "2024-01-01T00:00:00Z",
          effectiveTo: null,
          status: "PENDING_APPROVAL", // Unapproved
          verificationStatus: "UNVERIFIED", // Unverified
          changeSummary: "Draft",
          createdById: "usr-1",
          createdByName: "Legal Research",
          createdAt: "2024-01-01T00:00:00Z",
          approvedById: null,
          approvedByName: null,
          approvedAt: null,
          sources: [],
        },
        versions: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ];

    it("filters out any unverified or pending policies", () => {
      const applicable = filterApplicableVerifiedRules(mockRules, {
        markets: ["US"],
        platforms: ["META"],
      });

      expect(applicable.length).toBe(1);
      expect(applicable[0].code).toBe("US-FTC-DISC-01");
      expect(applicable.some((r) => r.code === "DRAFT-UNVERIFIED-01")).toBe(false);
    });

    it("returns 'Insufficient policy coverage — manual review required.' when 0 verified rules exist", async () => {
      // Mock creative in database
      h.prisma.creative.findFirst.mockResolvedValueOnce({
        id: "cre-test-japan",
        name: "Tokyo Clinic Ad",
        status: "IN_REVIEW",
        workflow: "SUBMISSION_REVIEW",
        projectId: "proj-1",
        project: { name: "Project", clientId: "client-1" },
      });

      h.prisma.creative.findUnique.mockResolvedValueOnce({
        id: "cre-test-japan",
        name: "Tokyo Clinic Ad",
        format: "IMAGE_SQUARE",
        markets: [{ creativeId: "cre-test-japan", market: { code: "JP", name: "Japan" } }],
        platforms: [{ creativeId: "cre-test-japan", platform: { code: "LINE", name: "Line" } }],
        versions: [{ id: "ver-1", versionNumber: 1, fileUrl: null, mimeType: null }],
      });

      // No rules match Japan / Line
      h.prisma.policyRule.findMany.mockResolvedValueOnce([]);

      const mockProvider: AIComplianceProvider = {
        name: "Mock Provider",
        analyzeCreative: vi.fn(),
      };

      const result = await analyzeCreativeCompliance(teamReviewer, {
        creativeId: "cre-test-japan",
        provider: mockProvider,
      });

      expect(result.status).toBe("INSUFFICIENT_COVERAGE");
      expect(result.summary).toBe("Insufficient policy coverage — manual review required.");
      expect(result.findings).toEqual([]);
      // Crucial: Provider must never be invoked if 0 applicable policies exist
      expect(mockProvider.analyzeCreative).not.toHaveBeenCalled();
    });
  });

  describe("4. Server-Side Validation of Rule Citations", () => {
    it("discards any hallucinated or unlisted rule codes returned by the AI", async () => {
      h.prisma.creative.findFirst.mockResolvedValueOnce({
        id: "cre-test-us",
        name: "US Aesthetic Ad",
        status: "IN_REVIEW",
        workflow: "SUBMISSION_REVIEW",
        projectId: "proj-1",
        project: { name: "Project", clientId: "client-1" },
      });

      h.prisma.creative.findUnique.mockResolvedValueOnce({
        id: "cre-test-us",
        name: "US Aesthetic Ad",
        format: "IMAGE_SQUARE",
        markets: [{ creativeId: "cre-test-us", market: { code: "US", name: "United States" } }],
        platforms: [{ creativeId: "cre-test-us", platform: { code: "META", name: "Meta" } }],
        versions: [{ id: "ver-1", versionNumber: 1, fileUrl: null, mimeType: null }],
      });

      // Only US-FTC-DISC-01 is approved in DB
      h.prisma.policyRule.findMany.mockResolvedValueOnce([
        {
          id: "rule-ftc",
          code: "US-FTC-DISC-01",
          title: "FTC Endorsement",
          authorityType: "REGULATION",
          jurisdictionCode: "US",
          subJurisdiction: null,
          platformCode: null,
          industry: "HEALTHCARE",
          category: "DISCLOSURE",
          currentVersionNumber: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          versions: [
            {
              id: "v-1",
              ruleId: "rule-ftc",
              versionNumber: 1,
              title: "FTC Endorsement",
              summary: "Disclose",
              legalExplanation: "Explanation",
              remediationAction: "Remediation",
              applicabilityConditions: [],
              exceptions: [],
              effectiveFrom: new Date(),
              effectiveTo: null,
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
              changeSummary: "Approved",
              createdById: "u-1",
              createdAt: new Date(),
              approvedById: "u-2",
              approvedAt: new Date(),
              createdBy: { id: "u-1", name: "Author" },
              approvedBy: { id: "u-2", name: "Approver" },
              sources: [],
            },
          ],
        },
      ]);

      // Mock AI provider returning 1 valid finding and 1 hallucinated finding
      const mockProvider: AIComplianceProvider = {
        name: "Mock Provider",
        analyzeCreative: vi.fn().mockResolvedValueOnce({
          status: "SUCCESS",
          summary: "Completed",
          extractedVisualText: [{ text: "Miracle Botox Results" }],
          detectedClaims: [{ claimText: "100% Guaranteed", category: "EFFICACY" }],
          findings: [
            {
              id: "f-1",
              issue: "Missing Material Connection Disclosure",
              severity: "CRITICAL",
              requiredAction: "REVISE_CONTENT",
              explanation: "Missing disclosure",
              actionDetails: "Add #Ad",
              confidenceScore: 0.95,
              policyCitation: {
                ruleId: "rule-ftc",
                ruleCode: "US-FTC-DISC-01",
                ruleTitle: "FTC Endorsement",
                authorityType: "REGULATION",
                jurisdictionCode: "US",
                sectionReference: "16 CFR 255.5",
              },
            },
            {
              id: "f-hallucinated",
              issue: "Invented European Regulation",
              severity: "MAJOR",
              requiredAction: "REVISE_CONTENT",
              explanation: "Hallucinated EU GDPR article for visual ads",
              actionDetails: "Remove",
              confidenceScore: 0.8,
              policyCitation: {
                ruleId: "fake-id",
                ruleCode: "EU-GDPR-ART-88-FAKE", // Hallucinated! Not in approved US rules
                ruleTitle: "Fake Rule",
                authorityType: "REGULATION",
                jurisdictionCode: "EU",
                sectionReference: "Article 88",
              },
            },
          ],
        }),
      };

      const result = await analyzeCreativeCompliance(teamReviewer, {
        creativeId: "cre-test-us",
        provider: mockProvider,
      });

      expect(result.status).toBe("SUCCESS");
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].policyCitation.ruleCode).toBe("US-FTC-DISC-01");
      // Hallucinated EU rule was discarded
      expect(result.findings.some((f) => f.policyCitation.ruleCode === "EU-GDPR-ART-88-FAKE")).toBe(false);
    });
  });

  describe("5. Human Review Authority & Strict Client Privacy Boundary", () => {
    it("refuses AI analysis when requested by a CLIENT role", async () => {
      await expect(
        analyzeCreativeCompliance(clientUser, { creativeId: "cre-1" })
      ).rejects.toThrow("Unauthorized: AI Compliance Analysis is restricted to TEAM reviewers.");
    });

    it("strictly blocks CLIENT users from invoking AI server actions directly", async () => {
      h.user = clientUser;

      const scanResult = await runAICreativeScan("cre-test-client-attempt");
      expect(scanResult.ok).toBe(false);
      expect(scanResult.error).toBe("Access denied: AI review tools are restricted to TEAM reviewers.");

      const acceptResult = await acceptAIFindingAction({
        creativeId: "cre-test-client-attempt",
        finding: {
          id: "fake-finding-1",
          issue: "Fake finding",
          severity: "MAJOR",
          requiredAction: "REVISE_CONTENT",
          explanation: "Explanation",
          actionDetails: "Action",
          confidenceScore: 0.9,
          policyCitation: {
            ruleId: "rule-1",
            ruleCode: "US-FTC-DISC-01",
            ruleTitle: "FTC Rule",
            authorityType: "REGULATION",
            jurisdictionCode: "US",
            sectionReference: "16 CFR 255.5",
          },
        },
      });
      expect(acceptResult.ok).toBe(false);
      expect(acceptResult.error).toBe("Access denied: Only TEAM reviewers can accept findings.");
    });

    it("caches analysis result to protect free tier API limits, and honors forceRefresh", async () => {
      h.prisma.creative.findFirst.mockResolvedValue({
        id: "cre-cached",
        name: "Cached Creative",
        status: "IN_REVIEW",
        workflow: "SUBMISSION_REVIEW",
        projectId: "proj-1",
        project: { name: "Project", clientId: "client-1" },
      });

      h.prisma.creative.findUnique.mockResolvedValue({
        id: "cre-cached",
        name: "Cached Creative",
        format: "IMAGE_SQUARE",
        markets: [{ creativeId: "cre-cached", market: { code: "US", name: "United States" } }],
        platforms: [{ creativeId: "cre-cached", platform: { code: "META", name: "Meta" } }],
        versions: [{ id: "ver-cached-1", versionNumber: 1, fileUrl: null, mimeType: null }],
      });

      h.prisma.policyRule.findMany.mockResolvedValue([
        {
          id: "r1",
          code: "US-FTC-DISC-01",
          title: "Rule",
          authorityType: "REGULATION",
          jurisdictionCode: "US",
          subJurisdiction: null,
          platformCode: null,
          industry: "HEALTHCARE",
          category: "DISCLOSURE",
          currentVersionNumber: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          versions: [
            {
              id: "v1",
              ruleId: "r1",
              versionNumber: 1,
              title: "Rule",
              summary: "Sum",
              legalExplanation: "Exp",
              remediationAction: "Rem",
              applicabilityConditions: [],
              exceptions: [],
              effectiveFrom: new Date(),
              effectiveTo: null,
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
              changeSummary: "Appr",
              createdById: "u1",
              createdAt: new Date(),
              approvedById: "u2",
              approvedAt: new Date(),
              createdBy: { id: "u1", name: "A" },
              approvedBy: { id: "u2", name: "B" },
              sources: [],
            },
          ],
        },
      ]);

      const mockProvider: AIComplianceProvider = {
        name: "Mock Provider",
        analyzeCreative: vi.fn().mockResolvedValue({
          status: "SUCCESS",
          summary: "Scan complete",
          extractedVisualText: [],
          detectedClaims: [],
          findings: [],
        }),
      };

      // Call 1: Provider invoked
      await analyzeCreativeCompliance(teamReviewer, {
        creativeId: "cre-cached",
        provider: mockProvider,
      });
      expect(mockProvider.analyzeCreative).toHaveBeenCalledTimes(1);

      // Call 2: Should hit in-memory cache, provider NOT invoked again
      await analyzeCreativeCompliance(teamReviewer, {
        creativeId: "cre-cached",
        provider: mockProvider,
      });
      expect(mockProvider.analyzeCreative).toHaveBeenCalledTimes(1);

      // Call 3 with forceRefresh: true -> cache bypassed, provider invoked again
      await analyzeCreativeCompliance(teamReviewer, {
        creativeId: "cre-cached",
        provider: mockProvider,
        forceRefresh: true,
      });
      expect(mockProvider.analyzeCreative).toHaveBeenCalledTimes(2);
    });
  });
});
