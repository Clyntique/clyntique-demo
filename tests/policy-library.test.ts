import { beforeEach, describe, expect, it } from "vitest";
import { canApprovePolicyVersion, isPolicyAdmin } from "@/lib/policy/auth";
import {
  filterPolicyRules,
  findGroundedRulesForContext,
  getActiveApprovedRules,
} from "@/lib/policy/search";
import {
  approveRuleVersion,
  createPolicyRule,
  deletePolicyRuleVersion,
  getAllPolicyRules,
  getAllPolicySources,
  getPolicyRuleById,
  proposeRuleVersion,
  resetPolicyStore,
  verifyPolicyVersion,
} from "@/lib/policy/store";
import type { CurrentUser } from "@/lib/auth/dal";

describe("Clyntique Compliance Policy Library", () => {
  const policyAdminUser: CurrentUser = {
    id: "usr-admin-1",
    name: "Admin Reviewer",
    email: "team@clyntique.demo",
    role: "TEAM",
  };

  const secondAdminUser: CurrentUser = {
    id: "usr-admin-2",
    name: "Secondary Approver",
    email: "compliance-admin@clyntique.com",
    role: "TEAM",
  };

  const clientUser: CurrentUser = {
    id: "usr-client-1",
    name: "Client Brand",
    email: "client@clyntique.demo",
    role: "CLIENT",
  };

  beforeEach(() => {
    resetPolicyStore();
  });

  describe("Authority Separation & Verification", () => {
    it("strictly separates government regulations, platform policies, and internal risk guidance", () => {
      const sources = getAllPolicySources();
      const regulations = sources.filter((s) => s.authorityType === "REGULATION");
      const platformPolicies = sources.filter((s) => s.authorityType === "PLATFORM_POLICY");
      const internalRisks = sources.filter((s) => s.authorityType === "INTERNAL_RISK");

      expect(regulations.length).toBeGreaterThan(0);
      expect(platformPolicies.length).toBeGreaterThan(0);
      expect(internalRisks.length).toBeGreaterThan(0);

      // Verify all starter sources have UNVERIFIED status by default (Requirement 1)
      for (const s of sources) {
        expect(s.verificationStatus).toBe("UNVERIFIED");
        expect(s.officialUrl).toMatch(/^https?:\/\//);
      }
    });

    it("verifies starter rule set contains US, UAE, TikTok, Meta, Google and Internal rules", () => {
      const rules = getAllPolicyRules();
      const codes = rules.map((r) => r.code);

      // US Regulations
      expect(codes).toContain("US-FTC-DISC-01");
      expect(codes).toContain("US-FTC-SUBST-02");
      expect(codes).toContain("US-FDA-COSM-01");

      // UAE Regulations
      expect(codes).toContain("AE-MOH-LIC-01");
      expect(codes).toContain("AE-NMC-BILING-02");

      // Platform Policies
      expect(codes).toContain("TIKTOK-HLT-01");
      expect(codes).toContain("TIKTOK-RX-02");
      expect(codes).toContain("META-HLT-01");
      expect(codes).toContain("GOOG-MED-01");

      // Internal Risk Guidance
      expect(codes).toContain("INT-RISK-AES-01");

      // Every approved version has exact source sections
      for (const rule of rules) {
        const ver = rule.currentVersion;
        expect(ver.sources.length).toBeGreaterThan(0);
        for (const sec of ver.sources) {
          expect(sec.sectionReference).toBeTruthy();
          expect(sec.authorityName).toBeTruthy();
        }
      }
    });
  });

  describe("Deterministic Filtering Engine", () => {
    it("filters rules by jurisdiction deterministically", () => {
      const allRules = getAllPolicyRules();
      const usRules = filterPolicyRules(allRules, { jurisdiction: "US" });
      const aeRules = filterPolicyRules(allRules, { jurisdiction: "AE" });

      expect(usRules.every((r) => r.jurisdictionCode === "US" || r.jurisdictionCode === "GLOBAL")).toBe(true);
      expect(aeRules.every((r) => r.jurisdictionCode === "AE" || r.jurisdictionCode === "GLOBAL")).toBe(true);
      expect(usRules.some((r) => r.code === "US-FTC-DISC-01")).toBe(true);
      expect(aeRules.some((r) => r.code === "AE-MOH-LIC-01")).toBe(true);
    });

    it("filters rules by ad platform deterministically", () => {
      const allRules = getAllPolicyRules();
      const tiktokRules = filterPolicyRules(allRules, { platform: "TIKTOK" });

      expect(tiktokRules.some((r) => r.code === "TIKTOK-HLT-01")).toBe(true);
      expect(tiktokRules.some((r) => r.code === "TIKTOK-RX-02")).toBe(true);
      expect(tiktokRules.every((r) => !r.platformCode || r.platformCode === "TIKTOK" || r.platformCode === "GLOBAL")).toBe(true);
    });

    it("filters rules by text query on code, citation, and keyword", () => {
      const allRules = getAllPolicyRules();
      const ftcByCitation = filterPolicyRules(allRules, { query: "16 CFR § 255.5" });
      expect(ftcByCitation.length).toBe(1);
      expect(ftcByCitation[0].code).toBe("US-FTC-DISC-01");

      const mohapByQuery = filterPolicyRules(allRules, { query: "MOHAP" });
      expect(mohapByQuery.some((r) => r.code === "AE-MOH-LIC-01")).toBe(true);
    });
  });

  describe("Maker-Checker Governance & Immutability", () => {
    it("enforces that policy creation requires TEAM policy administrator permissions", () => {
      expect(isPolicyAdmin(policyAdminUser)).toBe(true);
      expect(isPolicyAdmin(clientUser)).toBe(false);

      expect(() =>
        createPolicyRule(
          {
            code: "TEST-FORBIDDEN-01",
            title: "Unauthorized Rule",
            authorityType: "REGULATION",
            jurisdictionCode: "US",
            industry: "HEALTHCARE",
            category: "DISCLOSURE",
            summary: "Summary",
            legalExplanation: "Explanation",
            remediationAction: "Remediation",
            applicabilityConditions: ["Condition 1"],
            effectiveFrom: new Date().toISOString(),
            sources: [],
            status: "PENDING_APPROVAL",
          },
          clientUser
        )
      ).toThrowError(/Unauthorized/);
    });

    it("ensures newly created rules are NEVER automatically approved (Requirement 10)", () => {
      const created = createPolicyRule(
        {
          code: "US-NEW-TEST-01",
          title: "New Health Testimonial Standard",
          authorityType: "REGULATION",
          jurisdictionCode: "US",
          industry: "HEALTHCARE",
          category: "DISCLOSURE",
          summary: "Newly imported regulation from legal briefing.",
          legalExplanation: "Under statutory review.",
          remediationAction: "Insert clear disclaimer.",
          applicabilityConditions: ["Applies to video ads"],
          effectiveFrom: new Date().toISOString(),
          sources: [
            {
              sourceId: "src-us-ftc-endorsements",
              sectionReference: "16 CFR § 255.5",
              sectionTitle: "Section Title",
              directUrl: "https://ftc.gov",
              excerpt: "Excerpt",
            },
          ],
          status: "PENDING_APPROVAL",
        },
        policyAdminUser
      );

      expect(created.currentVersion.status).toBe("PENDING_APPROVAL");
      expect(created.currentVersion.approvedAt).toBeNull();
      expect(created.currentVersion.approvedById).toBeNull();
    });

    it("enforces maker-checker rule: an author CANNOT approve their own submission", () => {
      const created = createPolicyRule(
        {
          code: "US-MAKER-CHECKER-01",
          title: "Maker Checker Rule",
          authorityType: "REGULATION",
          jurisdictionCode: "US",
          industry: "HEALTHCARE",
          category: "DISCLOSURE",
          summary: "Summary",
          legalExplanation: "Explanation",
          remediationAction: "Remediation",
          applicabilityConditions: ["Condition"],
          effectiveFrom: new Date().toISOString(),
          sources: [],
          status: "PENDING_APPROVAL",
        },
        policyAdminUser
      );

      // Attempt self-approval
      const selfCheck = canApprovePolicyVersion(policyAdminUser, created.currentVersion);
      expect(selfCheck.allowed).toBe(false);
      expect(selfCheck.reason).toMatch(/Maker-Checker Governance/);

      expect(() =>
        approveRuleVersion(created.id, created.currentVersion.id, policyAdminUser)
      ).toThrowError(/Maker-Checker Governance/);

      // A different policy administrator CAN approve
      const secondCheck = canApprovePolicyVersion(secondAdminUser, created.currentVersion);
      expect(secondCheck.allowed).toBe(true);

      const approvedResult = approveRuleVersion(
        created.id,
        created.currentVersion.id,
        secondAdminUser,
        "Verified against official register."
      );

      expect(approvedResult.approvedVersion.status).toBe("ACTIVE");
      expect(approvedResult.approvedVersion.approvedById).toBe(secondAdminUser.id);
      expect(approvedResult.approvedVersion.approvedByName).toBe(secondAdminUser.name);
      expect(approvedResult.approvedVersion.approvedAt).toBeTruthy();
    });

    it("preserves immutable version history when proposing a new version", () => {
      const rule = getPolicyRuleById("rule-us-ftc-disc-01")!;
      const originalV1 = rule.currentVersion;
      expect(originalV1.versionNumber).toBe(1);
      expect(originalV1.status).toBe("ACTIVE");

      // Propose version 2.0
      const v2 = proposeRuleVersion(
        {
          ruleId: rule.id,
          title: "Updated Endorsement Disclosure v2",
          summary: "Updated guidance with video caption rules.",
          legalExplanation: "Updated legal explanation.",
          remediationAction: "Updated remediation action.",
          applicabilityConditions: ["Applies to all video creatives"],
          changeSummary: "Updated for 2026 mobile video requirements.",
          effectiveFrom: new Date().toISOString(),
          sources: originalV1.sources,
        },
        policyAdminUser
      );

      expect(v2.versionNumber).toBe(2);
      expect(v2.status).toBe("PENDING_APPROVAL");

      // The rule now has 2 versions in history
      const updatedRule = getPolicyRuleById(rule.id)!;
      expect(updatedRule.versions.length).toBe(2);
      // v1 remains intact in history
      const foundV1 = updatedRule.versions.find((v) => v.versionNumber === 1);
      expect(foundV1?.status).toBe("ACTIVE");

      // Approve v2 by secondary administrator
      approveRuleVersion(updatedRule.id, v2.id, secondAdminUser, "Approved v2.");
      const ruleAfterApproval = getPolicyRuleById(rule.id)!;

      expect(ruleAfterApproval.currentVersionNumber).toBe(2);
      expect(ruleAfterApproval.currentVersion.status).toBe("ACTIVE");
      // Old v1 is now DEPRECATED with effectiveTo set
      const deprecatedV1 = ruleAfterApproval.versions.find((v) => v.versionNumber === 1);
      expect(deprecatedV1?.status).toBe("DEPRECATED");
      expect(deprecatedV1?.effectiveTo).toBeTruthy();
    });
  });

  describe("AI Retrieval & Deterministic Grounding (Requirements 6 & 11)", () => {
    it("strictly excludes draft, pending approval, and unverified rule versions from AI retrieval", () => {
      const allRules = getAllPolicyRules();
      // Starter rules start as UNVERIFIED, so none are active & verified initially (Requirement 1)
      expect(getActiveApprovedRules(allRules).length).toBe(0);

      // Verify a rule via Policy Administrator review
      verifyPolicyVersion("rule-us-ftc-disc-01", "ver-us-ftc-disc-01-v1", policyAdminUser, "Checked official FTC URL and section 255.5");
      const activeRulesAfter = getActiveApprovedRules(getAllPolicyRules());
      expect(activeRulesAfter.length).toBe(1);
      expect(activeRulesAfter[0].code).toBe("US-FTC-DISC-01");
      expect(activeRulesAfter[0].currentVersion.verificationStatus).toBe("VERIFIED");
    });

    it("preserves historical policy references permanently and prevents deleting approved versions", () => {
      // Requirement 2: Prevent deletion of approved rule versions
      expect(() =>
        deletePolicyRuleVersion("rule-us-ftc-disc-01", "ver-us-ftc-disc-01-v1")
      ).toThrowError(/immutable and permanently preserved/);
    });

    it("triggers explicit insufficient coverage response when creative targets an unverified market", () => {
      const allRules = getAllPolicyRules();
      const result = findGroundedRulesForContext(allRules, {
        creativeTitle: "Tokyo Aesthetic Clinic Treatment",
        adCopy: "Get our luxury aesthetic skin therapy in Tokyo.",
        markets: ["JP"], // Not yet in verified policy library!
        platforms: ["META"],
      });

      expect(result.hasCoverage).toBe(false);
      expect(result.insufficientCoverageReason).toMatch(/Insufficient verified policy coverage for market/);
      expect(result.matches.length).toBe(0);
      expect(result.disclaimer).toBeTruthy();
    });

    it("deterministically matches TikTok prescription aesthetic restrictions and FTC endorsement once verified", () => {
      // Verify the relevant rules for this test scope
      verifyPolicyVersion("rule-tiktok-rx-02", "ver-tiktok-rx-02-v1", policyAdminUser);
      verifyPolicyVersion("rule-tiktok-hlt-01", "ver-tiktok-hlt-01-v1", policyAdminUser);
      verifyPolicyVersion("rule-us-ftc-disc-01", "ver-us-ftc-disc-01-v1", policyAdminUser);

      const allRules = getAllPolicyRules();
      const result = findGroundedRulesForContext(allRules, {
        creativeTitle: "Beverly Hills Aesthetic Glow — Before & After Wrinkle Elimination",
        adCopy:
          "Get our celebrity Botox treatment in Beverly Hills! Guaranteed wrinkle elimination in 7 days. Recommended by top influencers with dramatic before and after results! Book today.",
        markets: ["US"],
        platforms: ["TIKTOK"],
        detectedVisualThemes: ["BEFORE_AFTER", "PRESCRIPTION_INJECTABLE"],
      });

      expect(result.hasCoverage).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);

      const matchedCodes = result.matches.map((m) => m.ruleCode);
      expect(matchedCodes).toContain("TIKTOK-RX-02"); // Botox prescription restriction
      expect(matchedCodes).toContain("TIKTOK-HLT-01"); // Before & After
      expect(matchedCodes).toContain("US-FTC-DISC-01"); // Endorsement disclosure missing

      // Verify source section citation is populated
      const tiktokRxMatch = result.matches.find((m) => m.ruleCode === "TIKTOK-RX-02");
      expect(tiktokRxMatch?.sourceSection).toBe("Section 4.3");
      expect(tiktokRxMatch?.suggestedSeverity).toBe("HIGH");
      expect(tiktokRxMatch?.remediationAction).toBeTruthy();
    });

    it("deterministically matches UAE MOHAP license requirement when permit is absent once verified", () => {
      verifyPolicyVersion("rule-ae-mohap-lic-01", "ver-ae-mohap-lic-01-v1", policyAdminUser);
      verifyPolicyVersion("rule-ae-nmc-biling-02", "ver-ae-nmc-biling-02-v1", policyAdminUser);

      const allRules = getAllPolicyRules();
      const result = findGroundedRulesForContext(allRules, {
        creativeTitle: "Dubai Marina Aesthetic Clinic — Laser Rejuvenation Package",
        adCopy: "Transform your skin at our luxury Dubai clinic. Advanced laser resurfacing administered by certified dermatologists.",
        markets: ["AE"],
        platforms: ["META"],
      });

      expect(result.hasCoverage).toBe(true);
      const matchedCodes = result.matches.map((m) => m.ruleCode);
      expect(matchedCodes).toContain("AE-MOH-LIC-01"); // Missing MOHAP permit
      expect(matchedCodes).toContain("AE-NMC-BILING-02"); // Missing Arabic disclosure
    });
  });
});
