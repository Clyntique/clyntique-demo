import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { createPrismaMock, type PrismaMock } from "./helpers";
import { CANDIDATE_POLICY_RULES, CANDIDATE_POLICY_SOURCES } from "@/lib/policy/candidates";
import { canApprovePolicyVersion, isPolicyAdmin } from "@/lib/policy/auth";
import {
  findGroundedRulesForContext,
  getActiveApprovedRules,
} from "@/lib/policy/search";
import type { PolicyRule } from "@/lib/policy/types";

// Mock @/lib/prisma to test persistence methods safely without database side effects
const h = vi.hoisted(() => ({
  prisma: null as unknown as PrismaMock,
}));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

describe("M7A: Verified Policy Content & Production-Ready Persistence", () => {
  const policyAdmin: CurrentUser = {
    id: "usr-admin-1",
    name: "Policy Administrator",
    email: "team@clyntique.demo",
    role: "TEAM",
    isPolicyAdmin: true,
  };

  const secondaryAdmin: CurrentUser = {
    id: "usr-admin-2",
    name: "Secondary Approver",
    email: "compliance-admin@clyntique.com",
    role: "TEAM",
    isPolicyAdmin: true,
  };

  const clientUser: CurrentUser = {
    id: "usr-client-1",
    name: "Client Account",
    email: "client@clyntique.demo",
    role: "CLIENT",
    isPolicyAdmin: false,
  };

  beforeEach(() => {
    h.prisma = createPrismaMock();
  });

  describe("1. Starter Candidate Set Curation & Source Validation", () => {
    it("contains between 15 and 20 high-quality candidate policies (Requirement 5)", () => {
      expect(CANDIDATE_POLICY_RULES.length).toBeGreaterThanOrEqual(15);
      expect(CANDIDATE_POLICY_RULES.length).toBeLessThanOrEqual(20);
      expect(CANDIDATE_POLICY_RULES.length).toBe(18);
    });

    it("covers US, UAE, TikTok, Meta, Google, FTC, and internal risk guidance (Requirement 4)", () => {
      const jurisdictions = new Set(CANDIDATE_POLICY_RULES.map((r) => r.jurisdictionCode));
      expect(jurisdictions.has("US")).toBe(true);
      expect(jurisdictions.has("AE")).toBe(true);
      expect(jurisdictions.has("GLOBAL")).toBe(true);

      const platforms = new Set(CANDIDATE_POLICY_RULES.map((r) => r.platformCode).filter(Boolean));
      expect(platforms.has("TIKTOK")).toBe(true);
      expect(platforms.has("META")).toBe(true);
      expect(platforms.has("GOOGLE")).toBe(true);

      const authorityTypes = new Set(CANDIDATE_POLICY_RULES.map((r) => r.authorityType));
      expect(authorityTypes.has("REGULATION")).toBe(true);
      expect(authorityTypes.has("PLATFORM_POLICY")).toBe(true);
      expect(authorityTypes.has("INTERNAL_RISK")).toBe(true);
    });

    it("all candidate sources start as UNVERIFIED with valid official URLs (Requirement 6 & 7)", () => {
      for (const src of CANDIDATE_POLICY_SOURCES) {
        expect(src.verificationStatus).toBe("UNVERIFIED");
        expect(src.officialUrl).toMatch(/^https?:\/\//);
        expect(src.authorityName).toBeTruthy();
        expect(src.name).toBeTruthy();
      }
    });

    it("all candidate rules start as UNVERIFIED and PENDING_APPROVAL with exact citations (Requirement 6 & 7)", () => {
      for (const rule of CANDIDATE_POLICY_RULES) {
        expect(rule.code).toMatch(/^[A-Z0-9-]+$/);
        const ver = rule.currentVersion;
        expect(ver.status).toBe("PENDING_APPROVAL");
        expect(ver.verificationStatus).toBe("UNVERIFIED");
        expect(ver.approvedById).toBeNull();
        expect(ver.approvedAt).toBeNull();
        expect(ver.sources.length).toBeGreaterThan(0);

        for (const s of ver.sources) {
          expect(s.sectionReference).toBeTruthy();
          expect(s.sectionTitle).toBeTruthy();
          expect(s.directUrl).toMatch(/^https?:\/\//);
          expect(s.excerpt).toBeTruthy();
        }
      }
    });
  });

  describe("2. Maker-Checker Authorization & Permissions", () => {
    it("restricts policy administration to authorized TEAM accounts", () => {
      expect(isPolicyAdmin(policyAdmin)).toBe(true);
      expect(isPolicyAdmin(secondaryAdmin)).toBe(true);
      expect(isPolicyAdmin(clientUser)).toBe(false);
    });

    it("strictly blocks rule authors from self-approving their own versions (Requirement 8)", () => {
      const versionAuthoredByAdmin = {
        createdById: policyAdmin.id,
        status: "PENDING_APPROVAL" as const,
      };

      const checkSelf = canApprovePolicyVersion(policyAdmin, versionAuthoredByAdmin);
      expect(checkSelf.allowed).toBe(false);
      expect(checkSelf.reason).toContain("Maker-Checker Governance: You cannot approve a policy version that you created");

      const checkOther = canApprovePolicyVersion(secondaryAdmin, versionAuthoredByAdmin);
      expect(checkOther.allowed).toBe(true);
    });

    it("blocks approving already active or deprecated versions", () => {
      const activeVersion = {
        createdById: "other-user",
        status: "ACTIVE" as const,
      };
      expect(canApprovePolicyVersion(policyAdmin, activeVersion).allowed).toBe(false);

      const deprecatedVersion = {
        createdById: "other-user",
        status: "DEPRECATED" as const,
      };
      expect(canApprovePolicyVersion(policyAdmin, deprecatedVersion).allowed).toBe(false);
    });
  });

  describe("3. PostgreSQL Persistence & Zero In-Memory Fallback", () => {
    it("getDbPolicySources queries PostgreSQL and returns empty array when table is empty (Requirement 2)", async () => {
      const { getDbPolicySources } = await import("@/lib/policy/db");
      h.prisma.policySource.findMany.mockResolvedValueOnce([]);

      const sources = await getDbPolicySources();
      expect(h.prisma.policySource.findMany).toHaveBeenCalled();
      expect(sources).toEqual([]);
    });

    it("getDbPolicyRules queries PostgreSQL and returns empty array when table is empty (Requirement 2)", async () => {
      const { getDbPolicyRules } = await import("@/lib/policy/db");
      h.prisma.policyRule.findMany.mockResolvedValueOnce([]);

      const rules = await getDbPolicyRules();
      expect(h.prisma.policyRule.findMany).toHaveBeenCalled();
      expect(rules).toEqual([]);
    });

    it("createDbPolicyRule persists new rule to PostgreSQL with PENDING_APPROVAL and UNVERIFIED", async () => {
      const { createDbPolicyRule } = await import("@/lib/policy/db");
      h.prisma.policyRule.findUnique.mockResolvedValueOnce(null); // code is unique
      h.prisma.policyRule.create.mockResolvedValueOnce({ id: "rule-db-1" });
      h.prisma.policyRuleVersion.create.mockResolvedValueOnce({ id: "ver-db-1" });
      h.prisma.policyRuleVersionSource.create.mockResolvedValueOnce({ id: "src-link-1" });

      // Mock reload
      h.prisma.policyRule.findMany.mockResolvedValueOnce([
        {
          id: "rule-db-1",
          code: "TEST-FTC-01",
          title: "Test FTC Rule",
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
              id: "ver-db-1",
              ruleId: "rule-db-1",
              versionNumber: 1,
              title: "Test FTC Rule",
              summary: "Test summary",
              legalExplanation: "Legal text",
              remediationAction: "Remediation text",
              applicabilityConditions: ["Condition 1"],
              exceptions: [],
              effectiveFrom: new Date(),
              effectiveTo: null,
              status: "PENDING_APPROVAL",
              verificationStatus: "UNVERIFIED",
              changeSummary: "Initial version created in Policy Library.",
              createdById: policyAdmin.id,
              createdBy: { id: policyAdmin.id, name: policyAdmin.name },
              approvedById: null,
              approvedBy: null,
              approvedAt: null,
              createdAt: new Date(),
              sources: [],
            },
          ],
        },
      ]);

      const result = await createDbPolicyRule(
        {
          code: "TEST-FTC-01",
          title: "Test FTC Rule",
          authorityType: "REGULATION",
          jurisdictionCode: "US",
          industry: "HEALTHCARE",
          category: "DISCLOSURE",
          summary: "Test summary",
          legalExplanation: "Legal text",
          remediationAction: "Remediation text",
          applicabilityConditions: ["Condition 1"],
          effectiveFrom: new Date().toISOString(),
          sources: [],
          status: "PENDING_APPROVAL",
        },
        policyAdmin
      );

      expect(result.code).toBe("TEST-FTC-01");
      expect(result.currentVersion.status).toBe("PENDING_APPROVAL");
      expect(result.currentVersion.verificationStatus).toBe("UNVERIFIED");
      expect(result.currentVersion.createdById).toBe(policyAdmin.id);
    });

    it("proposeDbRuleVersion increments versionNumber and persists PENDING_APPROVAL in PostgreSQL", async () => {
      const { proposeDbRuleVersion } = await import("@/lib/policy/db");

      h.prisma.policyRule.findUnique.mockResolvedValueOnce({
        id: "rule-db-1",
        currentVersionNumber: 1,
        versions: [{ versionNumber: 1 }],
      });
      h.prisma.policyRuleVersion.create.mockResolvedValueOnce({ id: "ver-db-2" });

      h.prisma.policyRule.findMany.mockResolvedValueOnce([
        {
          id: "rule-db-1",
          code: "TEST-FTC-01",
          title: "Test FTC Rule",
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
              id: "ver-db-2",
              ruleId: "rule-db-1",
              versionNumber: 2,
              title: "Updated Title",
              summary: "Updated summary",
              legalExplanation: "Updated legal",
              remediationAction: "Updated remediation",
              applicabilityConditions: ["Cond 1"],
              exceptions: [],
              effectiveFrom: new Date(),
              effectiveTo: null,
              status: "PENDING_APPROVAL",
              verificationStatus: "UNVERIFIED",
              changeSummary: "Proposed version 2",
              createdById: policyAdmin.id,
              createdBy: { id: policyAdmin.id, name: policyAdmin.name },
              approvedById: null,
              approvedBy: null,
              approvedAt: null,
              createdAt: new Date(),
              sources: [],
            },
          ],
        },
      ]);

      const proposed = await proposeDbRuleVersion(
        {
          ruleId: "rule-db-1",
          title: "Updated Title",
          summary: "Updated summary",
          legalExplanation: "Updated legal",
          remediationAction: "Updated remediation",
          applicabilityConditions: ["Cond 1"],
          changeSummary: "Proposed version 2",
          effectiveFrom: new Date().toISOString(),
          sources: [],
        },
        policyAdmin
      );

      expect(proposed.versionNumber).toBe(2);
      expect(proposed.status).toBe("PENDING_APPROVAL");
      expect(proposed.verificationStatus).toBe("UNVERIFIED");
    });

    it("approveDbRuleVersion enforces maker-checker, updates status to ACTIVE & VERIFIED, and updates rule pointer", async () => {
      const { approveDbRuleVersion } = await import("@/lib/policy/db");

      // Target version was created by usr-admin-1
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce({
        id: "ver-db-1",
        ruleId: "rule-db-1",
        versionNumber: 1,
        createdById: policyAdmin.id, // usr-admin-1
        status: "PENDING_APPROVAL",
        changeSummary: "Initial version",
      });

      // Self-approval attempt by creator must be rejected
      await expect(
        approveDbRuleVersion("rule-db-1", "ver-db-1", policyAdmin, "Self approval")
      ).rejects.toThrow(/Maker-Checker/);

      // Secondary approver approves
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce({
        id: "ver-db-1",
        ruleId: "rule-db-1",
        versionNumber: 1,
        createdById: policyAdmin.id,
        status: "PENDING_APPROVAL",
        changeSummary: "Initial version",
      });

      h.prisma.policyRule.findMany.mockResolvedValueOnce([
        {
          id: "rule-db-1",
          code: "TEST-FTC-01",
          title: "Test FTC Rule",
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
              id: "ver-db-1",
              ruleId: "rule-db-1",
              versionNumber: 1,
              title: "Test FTC Rule",
              summary: "Test summary",
              legalExplanation: "Legal text",
              remediationAction: "Remediation text",
              applicabilityConditions: ["Condition 1"],
              exceptions: [],
              effectiveFrom: new Date(),
              effectiveTo: null,
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
              changeSummary: "Initial version [Approved & Verified]",
              createdById: policyAdmin.id,
              createdBy: { id: policyAdmin.id, name: policyAdmin.name },
              approvedById: secondaryAdmin.id,
              approvedBy: { id: secondaryAdmin.id, name: secondaryAdmin.name },
              approvedAt: new Date(),
              createdAt: new Date(),
              sources: [],
            },
          ],
        },
      ]);

      const approvalResult = await approveDbRuleVersion(
        "rule-db-1",
        "ver-db-1",
        secondaryAdmin,
        "Reviewed 16 CFR § 255.5"
      );

      expect(approvalResult.approvedVersion.status).toBe("ACTIVE");
      expect(approvalResult.approvedVersion.verificationStatus).toBe("VERIFIED");
      expect(approvalResult.approvedVersion.approvedById).toBe(secondaryAdmin.id);
    });

    it("retireDbRule sets status to DEPRECATED without deleting data", async () => {
      const { retireDbRule } = await import("@/lib/policy/db");

      h.prisma.policyRuleVersion.findMany.mockResolvedValueOnce([
        { id: "ver-db-1", ruleId: "rule-db-1", status: "ACTIVE", changeSummary: "Active version" },
      ]);

      await retireDbRule("rule-db-1", policyAdmin, "Replaced by 2026 revision");

      expect(h.prisma.policyRuleVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ver-db-1" },
          data: expect.objectContaining({ status: "DEPRECATED" }),
        })
      );
    });
  });

  describe("4. Candidate Import Workflow (Source Verification)", () => {
    it("importCandidatePoliciesToDb imports sources and candidate rules as UNVERIFIED & PENDING_APPROVAL", async () => {
      const { importCandidatePoliciesToDb } = await import("@/lib/policy/db");

      h.prisma.user.findFirst.mockResolvedValueOnce({
        id: "usr-clyntique-legal-research",
        name: "Clyntique Legal Research",
        email: "research@clyntique.internal",
      });

      // Sources do not exist yet
      h.prisma.policySource.findUnique.mockResolvedValue(null);
      // Rules do not exist yet
      h.prisma.policyRule.findUnique.mockResolvedValue(null);

      const result = await importCandidatePoliciesToDb(policyAdmin);

      expect(result.sourcesImported).toBe(CANDIDATE_POLICY_SOURCES.length);
      expect(result.rulesImported).toBe(CANDIDATE_POLICY_RULES.length);
      expect(result.rulesImported).toBe(18);

      // Verify that candidate rules were created with PENDING_APPROVAL and UNVERIFIED
      const createCalls = h.prisma.policyRuleVersion.create.mock.calls;
      for (const call of createCalls) {
        const data = (call[0] as { data: { status: string; verificationStatus: string; createdById: string } }).data;
        expect(data.status).toBe("PENDING_APPROVAL");
        expect(data.verificationStatus).toBe("UNVERIFIED");
        expect(data.createdById).toBe("usr-clyntique-legal-research");
      }
    });
  });

  describe("5. AI Grounding & Insufficient Coverage Retrieval Boundary", () => {
    it("strictly excludes unapproved and unverified candidate policies from AI retrieval (Requirement 9)", () => {
      // Candidate policies start as PENDING_APPROVAL & UNVERIFIED
      const candidateRules = CANDIDATE_POLICY_RULES;

      const activeRules = getActiveApprovedRules(candidateRules);
      expect(activeRules.length).toBe(0);

      // AI grounding against candidate rules returns insufficient coverage because none are approved yet
      const aiResult = findGroundedRulesForContext(candidateRules, {
        creativeTitle: "Beverly Hills Aesthetic Botox",
        adCopy: "Get our celebrity Botox treatment in Beverly Hills! Guaranteed wrinkle elimination.",
        markets: ["US"],
        platforms: ["TIKTOK"],
        detectedVisualThemes: ["BEFORE_AFTER", "PRESCRIPTION_INJECTABLE"],
      });

      expect(aiResult.hasCoverage).toBe(false);
      expect(aiResult.insufficientCoverageReason).toContain("No active, verified rules available");
      expect(aiResult.matches.length).toBe(0);
    });

    it("retrieves rules when approved & verified by policy administrator", () => {
      // Create an approved clone of US-FTC-DISC-01
      const approvedCandidate: PolicyRule = JSON.parse(JSON.stringify(CANDIDATE_POLICY_RULES[0]));
      approvedCandidate.currentVersion.status = "ACTIVE";
      approvedCandidate.currentVersion.verificationStatus = "VERIFIED";
      approvedCandidate.currentVersion.approvedById = secondaryAdmin.id;
      approvedCandidate.currentVersion.approvedByName = secondaryAdmin.name;

      const activeRules = getActiveApprovedRules([approvedCandidate]);
      expect(activeRules.length).toBe(1);

      const aiResult = findGroundedRulesForContext([approvedCandidate], {
        creativeTitle: "Ambassador aesthetic partnership",
        adCopy: "Special routine recommended by top celebrity brand ambassador.",
        markets: ["US"],
        platforms: ["TIKTOK"],
        detectedVisualThemes: ["INFLUENCER_ENDORSEMENT"],
      });

      expect(aiResult.hasCoverage).toBe(true);
      expect(aiResult.matches.length).toBe(1);
      expect(aiResult.matches[0].ruleCode).toBe("US-FTC-DISC-01");
      expect(aiResult.matches[0].sourceSection).toContain("16 CFR § 255.5");
    });

    it("returns explicit insufficient coverage when creative targets unmapped markets (e.g. JP)", () => {
      const approvedCandidate: PolicyRule = JSON.parse(JSON.stringify(CANDIDATE_POLICY_RULES[0]));
      approvedCandidate.currentVersion.status = "ACTIVE";
      approvedCandidate.currentVersion.verificationStatus = "VERIFIED";

      const aiResult = findGroundedRulesForContext([approvedCandidate], {
        creativeTitle: "Tokyo Ginza Aesthetic Clinic",
        adCopy: "Beauty therapy in Tokyo clinic.",
        markets: ["JP"], // Not yet in verified policy library!
        platforms: ["META"],
      });

      expect(aiResult.hasCoverage).toBe(false);
      expect(aiResult.insufficientCoverageReason).toContain("JP");
      expect(aiResult.insufficientCoverageReason).toContain("Human TEAM compliance review required");
    });
  });
});
