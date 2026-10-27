import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { createPrismaMock, withReferenceCodes, type PrismaMock } from "./helpers";
import { CANDIDATE_POLICY_RULES, CANDIDATE_POLICY_SOURCES } from "@/lib/policy/candidates";
import { canApprovePolicyVersion, isPolicyAdmin } from "@/lib/policy/auth";
import { filterApplicableVerifiedRules, INSUFFICIENT_POLICY_COVERAGE } from "@/lib/ai/applicability";
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
    h.prisma = withReferenceCodes(createPrismaMock());
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

  describe("2. Two-person control & permissions", () => {
    it("restricts policy administration to TEAM accounts with the explicit database permission", () => {
      expect(isPolicyAdmin(policyAdmin)).toBe(true);
      expect(isPolicyAdmin(secondaryAdmin)).toBe(true);
      expect(isPolicyAdmin(clientUser)).toBe(false);
      // Decision D6: a known email address alone grants nothing.
      expect(isPolicyAdmin({ ...policyAdmin, isPolicyAdmin: false })).toBe(false);
      expect(isPolicyAdmin({ ...policyAdmin, isPolicyAdmin: undefined })).toBe(false);
      expect(isPolicyAdmin({ ...policyAdmin, demoSession: true })).toBe(false);
    });

    it("blocks authors from approving their own versions, and approvers from approving what they verified", () => {
      const verifiedByOther = { createdById: policyAdmin.id, status: "PENDING_APPROVAL" as const, verificationStatus: "VERIFIED" as const, verifiedById: "usr-admin-3" };
      expect(canApprovePolicyVersion(policyAdmin, verifiedByOther)).toMatchObject({ allowed: false, reason: expect.stringContaining("that you created") });
      expect(canApprovePolicyVersion(secondaryAdmin, verifiedByOther).allowed).toBe(true);

      const verifiedBySecondary = { ...verifiedByOther, verifiedById: secondaryAdmin.id };
      expect(canApprovePolicyVersion(secondaryAdmin, verifiedBySecondary)).toMatchObject({ allowed: false, reason: expect.stringContaining("you verified this version") });
    });

    it("refuses approval before a named verification", () => {
      const unverified = { createdById: "other", status: "PENDING_APPROVAL" as const, verificationStatus: "UNVERIFIED" as const, verifiedById: null };
      expect(canApprovePolicyVersion(secondaryAdmin, unverified)).toMatchObject({ allowed: false, reason: expect.stringContaining("must be verified") });
      const noVerifier = { ...unverified, verificationStatus: "VERIFIED" as const };
      expect(canApprovePolicyVersion(secondaryAdmin, noVerifier).allowed).toBe(false);
    });

    it("blocks approving already active, deprecated or draft versions", () => {
      for (const status of ["ACTIVE", "DEPRECATED", "DRAFT"] as const) {
        expect(canApprovePolicyVersion(policyAdmin, { createdById: "other-user", status, verificationStatus: "VERIFIED", verifiedById: "x" }).allowed).toBe(false);
      }
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

    it("createDbPolicyRule persists a new rule as an UNVERIFIED DRAFT when it cites nothing yet", async () => {
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
              status: "DRAFT",
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
          status: "DRAFT",
        },
        policyAdmin
      );

      expect(result.code).toBe("TEST-FTC-01");
      expect(result.currentVersion.status).toBe("DRAFT");
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
      h.prisma.policySource.count.mockResolvedValueOnce(1); // the cited source exists

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
          sources: [{ sourceId: "src-1", sectionReference: "16 CFR 255.5", sectionTitle: "Disclosure", directUrl: "https://www.ecfr.gov/current/title-16/part-255" }],
        },
        policyAdmin
      );

      expect(proposed.versionNumber).toBe(2);
      expect(proposed.status).toBe("PENDING_APPROVAL");
      expect(proposed.verificationStatus).toBe("UNVERIFIED");
    });

    it("approveDbRuleVersion needs a different verifier and approver, and activates without re-verifying", async () => {
      const { approveDbRuleVersion } = await import("@/lib/policy/db");
      const target = {
        id: "ver-db-1",
        ruleId: "rule-db-1",
        versionNumber: 1,
        createdById: policyAdmin.id,
        status: "PENDING_APPROVAL",
        verificationStatus: "VERIFIED",
        verifiedById: secondaryAdmin.id,
        effectiveFrom: new Date(Date.now() - 1000),
        changeSummary: "Initial version",
      };

      // The author can't approve; neither can the verifier.
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce(target);
      await expect(approveDbRuleVersion("rule-db-1", "ver-db-1", policyAdmin, "Self approval")).rejects.toThrow(/you cannot approve a policy version that you created/);
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce(target);
      await expect(approveDbRuleVersion("rule-db-1", "ver-db-1", secondaryAdmin)).rejects.toThrow(/you verified this version/);

      // A third administrator approves.
      const third: CurrentUser = { id: "usr-admin-3", name: "Third Admin", email: "third@test.invalid", role: "TEAM", isPolicyAdmin: true };
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce(target);
      h.prisma.policyRuleVersionSource.findMany.mockResolvedValueOnce([{ source: { name: "FTC", verificationStatus: "VERIFIED" } }]);
      h.prisma.policyRuleVersion.findMany.mockResolvedValueOnce([]);
      h.prisma.policyRuleVersion.updateMany.mockResolvedValue({ count: 1 });
      h.prisma.policyRule.findMany.mockResolvedValueOnce([
        {
          id: "rule-db-1", code: "TEST-FTC-01", title: "Test FTC Rule", authorityType: "REGULATION", jurisdictionCode: "US", subJurisdiction: null, platformCode: null,
          industry: "HEALTHCARE", category: "DISCLOSURE", currentVersionNumber: 1, createdAt: new Date(), updatedAt: new Date(),
          versions: [
            {
              id: "ver-db-1", ruleId: "rule-db-1", versionNumber: 1, title: "Test FTC Rule", summary: "Test summary", legalExplanation: "", remediationAction: "",
              applicabilityConditions: [], exceptions: [], effectiveFrom: new Date(), effectiveTo: null, status: "ACTIVE", verificationStatus: "VERIFIED",
              changeSummary: "Initial version", createdById: policyAdmin.id, createdBy: { id: policyAdmin.id, name: policyAdmin.name },
              approvedById: third.id, approvedBy: { id: third.id, name: third.name }, approvedAt: new Date(),
              verifiedById: secondaryAdmin.id, verifiedBy: { id: secondaryAdmin.id, name: secondaryAdmin.name }, verifiedAt: new Date(),
              createdAt: new Date(), sources: [],
            },
          ],
        },
      ]);

      const approvalResult = await approveDbRuleVersion("rule-db-1", "ver-db-1", third, "Reviewed 16 CFR § 255.5");
      expect(approvalResult.approvedVersion).toMatchObject({ status: "ACTIVE", approvedById: third.id, verifiedById: secondaryAdmin.id, verifiedByName: secondaryAdmin.name });

      const activation = h.prisma.policyRuleVersion.updateMany.mock.calls.map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> }).find((c) => c.data.status === "ACTIVE");
      expect(activation?.where).toMatchObject({ id: "ver-db-1", status: "PENDING_APPROVAL", verificationStatus: "VERIFIED", verifiedById: secondaryAdmin.id });
      // Approval never writes the verification itself, nor rewrites the author's summary.
      expect(activation?.data).not.toHaveProperty("verificationStatus");
      expect(activation?.data).not.toHaveProperty("changeSummary");
      expect(h.prisma.policyRuleEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "VERSION_APPROVED", actorId: third.id, note: expect.stringContaining("Reviewed 16 CFR") }) }));
    });

    it("retireDbRule sets status to DEPRECATED without deleting data", async () => {
      const { retireDbRule } = await import("@/lib/policy/db");

      h.prisma.policyRuleVersion.findMany.mockResolvedValueOnce([
        { id: "ver-db-1", ruleId: "rule-db-1", status: "ACTIVE", changeSummary: "Active version" },
      ]);

      await retireDbRule("rule-db-1", policyAdmin, "Replaced by 2026 revision");

      expect(h.prisma.policyRuleVersion.updateMany).toHaveBeenCalledWith({
        where: { ruleId: "rule-db-1", status: "ACTIVE" },
        data: expect.objectContaining({ status: "DEPRECATED" }),
      });
      expect(h.prisma.policyRuleVersion.deleteMany).not.toHaveBeenCalled();
      expect(h.prisma.policyRuleEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "RULE_RETIRED", note: expect.stringContaining("Replaced by 2026 revision") }) }));
    });
  });

  describe("4. Candidate Import Workflow (Source Verification)", () => {
    it("importCandidatePoliciesToDb imports sources and candidate rules as UNVERIFIED & PENDING_APPROVAL", async () => {
      const { importCandidatePoliciesToDb } = await import("@/lib/policy/db");

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
        // The importer is the maker, so they can't also approve (maker-checker).
        expect(data.createdById).toBe(policyAdmin.id);
      }
    });
  });

  describe("4b. Approval guards", () => {
    const pending = { id: "ver-db-1", ruleId: "rule-db-1", versionNumber: 1, createdById: "usr-author", status: "PENDING_APPROVAL", verificationStatus: "VERIFIED", verifiedById: "usr-verifier", effectiveFrom: new Date(), changeSummary: "x" };

    it("an administrator can't approve candidates they imported", async () => {
      const { importCandidatePoliciesToDb } = await import("@/lib/policy/db");
      h.prisma.policySource.findUnique.mockResolvedValue(null);
      h.prisma.policyRule.findUnique.mockResolvedValue(null);
      await importCandidatePoliciesToDb(policyAdmin);
      const created = (h.prisma.policyRuleVersion.create.mock.calls[0][0] as { data: { createdById: string; status: "PENDING_APPROVAL" } }).data;
      expect(canApprovePolicyVersion(policyAdmin, created).allowed).toBe(false);
      expect(h.prisma.user.create).not.toHaveBeenCalled();
    });

    it("refuses a version that belongs to a different rule", async () => {
      const { approveDbRuleVersion } = await import("@/lib/policy/db");
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce({ ...pending, ruleId: "rule-other" });
      await expect(approveDbRuleVersion("rule-db-1", "ver-db-1", secondaryAdmin)).rejects.toThrow(/not found/);
      expect(h.prisma.policyRuleVersion.updateMany).not.toHaveBeenCalled();
    });

    it("refuses a DRAFT version (it must be submitted for approval first)", async () => {
      const { approveDbRuleVersion } = await import("@/lib/policy/db");
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce({ ...pending, status: "DRAFT" });
      await expect(approveDbRuleVersion("rule-db-1", "ver-db-1", secondaryAdmin)).rejects.toThrow(/submitted for verification/);
    });

    it("refuses when the version was approved or changed meanwhile", async () => {
      const { approveDbRuleVersion } = await import("@/lib/policy/db");
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce(pending);
      h.prisma.policyRuleVersionSource.findMany.mockResolvedValueOnce([{ source: { name: "S", verificationStatus: "VERIFIED" } }]);
      h.prisma.policyRuleVersion.updateMany.mockResolvedValue({ count: 0 });
      await expect(approveDbRuleVersion("rule-db-1", "ver-db-1", secondaryAdmin)).rejects.toThrow(/changed meanwhile/);
      expect(h.prisma.policyRule.update).not.toHaveBeenCalled();
    });

    it("createDbPolicyRule never stores a submitted ACTIVE status", async () => {
      const { createDbPolicyRule } = await import("@/lib/policy/db");
      h.prisma.policyRule.findUnique.mockResolvedValueOnce(null);
      h.prisma.policyRule.create.mockResolvedValueOnce({ id: "rule-db-1" });
      h.prisma.policyRuleVersion.create.mockResolvedValueOnce({ id: "ver-db-1" });
      await createDbPolicyRule(
        {
          code: "TEST-X", title: "Test rule", authorityType: "REGULATION", jurisdictionCode: "US", industry: "HEALTHCARE", category: "DISCLOSURE",
          summary: "A synthetic rule summary", legalExplanation: "l", remediationAction: "r", applicabilityConditions: [], effectiveFrom: new Date().toISOString(), sources: [],
          status: "ACTIVE" as unknown as "PENDING_APPROVAL",
        },
        policyAdmin,
      ).catch(() => {}); // the reload isn't mocked; only the write matters here
      const data = (h.prisma.policyRuleVersion.create.mock.calls[0][0] as { data: { status: string; verificationStatus: string } }).data;
      expect(data.status).toBe("DRAFT");
      expect(data.verificationStatus).toBe("UNVERIFIED");
    });

    it("refuses approval when the version cites no source at all", async () => {
      const { approveDbRuleVersion } = await import("@/lib/policy/db");
      h.prisma.policyRuleVersion.findUnique.mockResolvedValueOnce(pending);
      h.prisma.policyRuleVersionSource.findMany.mockResolvedValueOnce([]);
      await expect(approveDbRuleVersion("rule-db-1", "ver-db-1", secondaryAdmin)).rejects.toThrow(/without a cited source/);
      expect(h.prisma.policyRuleVersion.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("5. AI eligibility of research candidates", () => {
    it("no imported research candidate is ever eligible for the AI as imported", () => {
      expect(filterApplicableVerifiedRules(CANDIDATE_POLICY_RULES, { markets: ["US", "AE"], platforms: ["META", "TIKTOK", "GOOGLE"], industry: "MEDICAL_AESTHETICS" })).toEqual([]);
      expect(INSUFFICIENT_POLICY_COVERAGE).toBe("Insufficient policy coverage — manual review required.");
    });

    it("a candidate marked ACTIVE + VERIFIED still needs a named verifier and a different approver", () => {
      const clone: PolicyRule = JSON.parse(JSON.stringify(CANDIDATE_POLICY_RULES[0]));
      clone.currentVersion.status = "ACTIVE";
      clone.currentVersion.verificationStatus = "VERIFIED";
      clone.currentVersion.effectiveFrom = new Date(Date.now() - 86400000).toISOString();
      for (const s of clone.currentVersion.sources) s.sourceVerificationStatus = "VERIFIED";
      const ctx = { markets: [clone.jurisdictionCode], platforms: clone.platformCode ? [clone.platformCode] : [], industry: "MEDICAL_AESTHETICS" };
      expect(filterApplicableVerifiedRules([clone], ctx)).toHaveLength(0);
      clone.currentVersion.verifiedById = secondaryAdmin.id;
      clone.currentVersion.approvedById = secondaryAdmin.id;
      expect(filterApplicableVerifiedRules([clone], ctx)).toHaveLength(0); // same person twice
      clone.currentVersion.approvedById = policyAdmin.id;
      expect(filterApplicableVerifiedRules([clone], ctx)).toHaveLength(1);
    });
  });
});
