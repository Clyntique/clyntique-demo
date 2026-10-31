import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  AI_ONLY_PLAN,
  AI_HUMAN_PLAN,
  HUMAN_REVIEW_ADDON,
  COMPARISON_FEATURES,
  PRICING_FAQS,
} from "@/lib/plans/data";
import {
  GLOBAL_POLICY_KPIS,
  MONITORED_PLATFORMS,
  MONITORED_JURISDICTIONS,
  COVERAGE_MATRIX_CELLS,
  PENDING_REVIEW_RULES,
  TRACKED_REGULATORY_AUTHORITIES,
  ALL_GLOBAL_POLICIES,
} from "@/lib/policy/dashboard-data";
import {
  parseReviewTier,
  formatContextWithReviewTier,
  getReviewTierLabel,
  getReviewTierDetails,
} from "@/lib/plans/review-tier";

describe("AI-Only vs Human Review Plans Prototype", () => {
  it("defines AI-Only plan with rapid automated screening", () => {
    expect(AI_ONLY_PLAN.id).toBe("ai-only");
    expect(AI_ONLY_PLAN.name).toBe("AI-Only Review");
    expect(AI_ONLY_PLAN.turnaround).toBe("< 60 seconds");
    expect(AI_ONLY_PLAN.monthlyPrice).toBe(199);
    expect(AI_ONLY_PLAN.annualPrice).toBe(159);
    expect(AI_ONLY_PLAN.disclaimer).toContain("illustrative");

    // Features check
    const features = AI_ONLY_PLAN.features.map((f) => f.text);
    expect(features).toContain("Automated AI Policy Engine screening");
    expect(features).toContain("Platform coverage: Meta, Google Ads & TikTok");
    expect(features).toContain("Senior Regulatory Specialist human sign-off");

    const humanFeature = AI_ONLY_PLAN.features.find((f) => f.text.includes("human sign-off"));
    expect(humanFeature?.included).toBe(false);
  });

  it("defines AI + Human Review plan with dual-check defense and 24h SLA", () => {
    expect(AI_HUMAN_PLAN.id).toBe("ai-human");
    expect(AI_HUMAN_PLAN.name).toBe("AI + Human Review");
    expect(AI_HUMAN_PLAN.turnaround).toContain("24-hour");
    expect(AI_HUMAN_PLAN.monthlyPrice).toBe(599);
    expect(AI_HUMAN_PLAN.popular).toBe(true);
    expect(AI_HUMAN_PLAN.disclaimer).toContain("illustrative");

    // Verified features
    const features = AI_HUMAN_PLAN.features.map((f) => f.text);
    expect(features).toContain("Senior Human Regulatory Specialist dual-review");
    expect(features).toContain("Formal Internal Review Record with immutable timestamp");
    expect(features).toContain("Two-sided reviewer chat & direct remediation advice");
  });

  it("defines optional on-demand human review add-on for flexible escalation", () => {
    expect(HUMAN_REVIEW_ADDON.id).toBe("human-review-addon");
    expect(HUMAN_REVIEW_ADDON.price).toBe(49);
    expect(HUMAN_REVIEW_ADDON.unit).toBe("per creative review");
    expect(HUMAN_REVIEW_ADDON.turnaround).toBe("24 hours");
    expect(HUMAN_REVIEW_ADDON.benefits.length).toBeGreaterThanOrEqual(4);
    expect(HUMAN_REVIEW_ADDON.sampleUseCases.length).toBeGreaterThanOrEqual(3);
  });

  it("provides comprehensive comparison matrix across review, policy, evidence, and turnaround", () => {
    expect(COMPARISON_FEATURES.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(COMPARISON_FEATURES.map((f) => f.category));
    expect(categories).toContain("Review Execution");
    expect(categories).toContain("Policy & Intelligence");
    expect(categories).toContain("Evidence & Audit");
    expect(categories).toContain("Turnaround & Support");
  });

  it("includes clear FAQs highlighting non-government clearance disclaimer", () => {
    expect(PRICING_FAQS.length).toBeGreaterThanOrEqual(4);
    const disclaimerFaq = PRICING_FAQS.find((f) => f.question.includes("government clearance"));
    expect(disclaimerFaq).toBeDefined();
    expect(disclaimerFaq?.answer).toContain("does not provide legal advice");
    expect(disclaimerFaq?.answer).toContain("statutory approvals");
  });
});

describe("Global Policy Dashboard Domain Intelligence", () => {
  it("provides executive KPIs with verified rules and overall coverage score", () => {
    expect(GLOBAL_POLICY_KPIS.totalMonitoredRules).toBe(48);
    expect(GLOBAL_POLICY_KPIS.verifiedActiveRules).toBe(34);
    expect(GLOBAL_POLICY_KPIS.awaitingVerification).toBe(8);
    expect(GLOBAL_POLICY_KPIS.overallCoverageScore).toBeGreaterThan(90);
  });

  it("monitors primary advertising platforms and statutory jurisdictions", () => {
    const platformCodes = MONITORED_PLATFORMS.map((p) => p.code);
    expect(platformCodes).toContain("META");
    expect(platformCodes).toContain("GOOGLE");
    expect(platformCodes).toContain("TIKTOK");

    const jurisdictionCodes = MONITORED_JURISDICTIONS.map((j) => j.code);
    expect(jurisdictionCodes).toContain("US");
    expect(jurisdictionCodes).toContain("AE");
    expect(jurisdictionCodes).toContain("EU");
    expect(jurisdictionCodes).toContain("GB");
  });

  it("models multi-jurisdiction matrix with coverage status and core requirements", () => {
    expect(COVERAGE_MATRIX_CELLS.length).toBeGreaterThanOrEqual(10);
    const usMeta = COVERAGE_MATRIX_CELLS.find((c) => c.marketCode === "US" && c.platformCode === "META");
    expect(usMeta).toBeDefined();
    expect(usMeta?.status).toBe("FULL");
    expect(usMeta?.verifiedRuleCount).toBeGreaterThan(0);

    const aeTiktok = COVERAGE_MATRIX_CELLS.find((c) => c.marketCode === "AE" && c.platformCode === "TIKTOK");
    expect(aeTiktok).toBeDefined();
    expect(aeTiktok?.status).toBe("MANUAL_REQUIRED");
  });

  it("enforces dual-admin verification pipeline with pending review rules", () => {
    expect(PENDING_REVIEW_RULES.length).toBeGreaterThanOrEqual(4);
    const mohapRule = PENDING_REVIEW_RULES.find((r) => r.ruleCode === "RX-AE-MOHAP-01");
    expect(mohapRule).toBeDefined();
    expect(mohapRule?.verificationStage).toBe("AWAITING_APPROVER");
    expect(mohapRule?.openQuestions?.length).toBeGreaterThan(0);
  });

  it("tracks official regulatory bodies and platform policy sources", () => {
    expect(TRACKED_REGULATORY_AUTHORITIES.length).toBeGreaterThanOrEqual(5);
    const authNames = TRACKED_REGULATORY_AUTHORITIES.map((a) => a.name);
    expect(authNames.some((n) => n.includes("FTC"))).toBe(true);
    expect(authNames.some((n) => n.includes("MOHAP"))).toBe(true);
    expect(authNames.some((n) => n.includes("Meta"))).toBe(true);
  });
});

describe("Page Routes & Component Integration", () => {
  it("creates public pricing page and standalone policy dashboard", () => {
    expect(existsSync("src/app/pricing/page.tsx")).toBe(true);
    expect(existsSync("src/app/policy-dashboard/page.tsx")).toBe(true);
  });

  it("creates signed-in team policy dashboard and client plans routes", () => {
    expect(existsSync("src/app/admin/policy-dashboard/page.tsx")).toBe(true);
    expect(existsSync("src/app/dashboard/plans/page.tsx")).toBe(true);
  });

  it("includes illustrative disclaimers in pricing and policy dashboard components", () => {
    const pricingSrc = readFileSync("src/components/plans/pricing-view.tsx", "utf8");
    expect(pricingSrc).toContain("Sample Illustrative Pricing Prototype");
    expect(pricingSrc).toContain("No real payment processing or subscriptions are connected");

    const dashSrc = readFileSync("src/components/policy/global-policy-dashboard-view.tsx", "utf8");
    expect(dashSrc).toContain("Global Policy Dashboard · Illustrative Prototype");
    expect(dashSrc).toContain("dual-human admin verification pipeline");
  });

  it("links to pricing and policy dashboard in marketing navbar and footer", () => {
    const navSrc = readFileSync("src/components/marketing/navbar.tsx", "utf8");
    expect(navSrc).toContain('href: "/pricing"');
    expect(navSrc).toContain('href: "/policy-dashboard"');

    const footerSrc = readFileSync("src/components/marketing/footer.tsx", "utf8");
    expect(footerSrc).toContain('href="/pricing"');
    expect(footerSrc).toContain('href="/policy-dashboard"');
  });

  it("links to policy dashboard and plans in workspace navigation", () => {
    const navLinksSrc = readFileSync("src/components/layout/nav-links.tsx", "utf8");
    expect(navLinksSrc).toContain('label: "Policy dashboard"');
    expect(navLinksSrc).toContain('label: "Plans & Add-ons"');
  });
});

describe("Review Tier Context Integration (Safe zero-migration persistence)", () => {
  it("defaults to HUMAN_REVIEW when context has no explicit tag", () => {
    expect(parseReviewTier(null)).toBe("HUMAN_REVIEW");
    expect(parseReviewTier("")).toBe("HUMAN_REVIEW");
    expect(parseReviewTier("Video ad targeting 25-45 demographic")).toBe("HUMAN_REVIEW");
  });

  it("extracts AI_ONLY and HUMAN_REVIEW accurately from context tag", () => {
    expect(parseReviewTier("Context info\n\n[Review Tier: AI_ONLY]")).toBe("AI_ONLY");
    expect(parseReviewTier("Context info\n\n[Review Tier: HUMAN_REVIEW]")).toBe("HUMAN_REVIEW");
    expect(parseReviewTier("[Review Tier: AI_ONLY]\n\nLeading text")).toBe("AI_ONLY");
  });

  it("formats context without modifying core text and replaces old tags cleanly", () => {
    const initial = "Targeting aesthetic patients in Texas.";
    const withAiOnly = formatContextWithReviewTier(initial, "AI_ONLY");
    expect(withAiOnly).toBe("Targeting aesthetic patients in Texas.\n\n[Review Tier: AI_ONLY]");
    expect(parseReviewTier(withAiOnly)).toBe("AI_ONLY");

    const upgradedToHuman = formatContextWithReviewTier(withAiOnly, "HUMAN_REVIEW");
    expect(upgradedToHuman).toBe("Targeting aesthetic patients in Texas.\n\n[Review Tier: HUMAN_REVIEW]");
    expect(parseReviewTier(upgradedToHuman)).toBe("HUMAN_REVIEW");
  });

  it("provides user-facing labels and SLA descriptions", () => {
    expect(getReviewTierLabel("AI_ONLY")).toBe("AI-Only Review");
    expect(getReviewTierLabel("HUMAN_REVIEW")).toBe("Human Review (Add-on)");

    const aiDetails = getReviewTierDetails("AI_ONLY");
    expect(aiDetails.slaText).toContain("< 60 seconds");
    expect(aiDetails.isPaidAddon).toBe(false);

    const humanDetails = getReviewTierDetails("HUMAN_REVIEW");
    expect(humanDetails.slaText).toContain("24-hour");
    expect(humanDetails.isPaidAddon).toBe(true);
  });
});

describe("Granular Global Policy Rules & Dual-Admin Grounding Boundary", () => {
  it("provides comprehensive rule dataset spanning platforms and jurisdictions", () => {
    expect(ALL_GLOBAL_POLICIES.length).toBeGreaterThanOrEqual(10);

    const platforms = new Set(ALL_GLOBAL_POLICIES.map((r) => r.platformCode));
    expect(platforms.has("META")).toBe(true);
    expect(platforms.has("GOOGLE")).toBe(true);
    expect(platforms.has("TIKTOK")).toBe(true);
    expect(platforms.has("SNAPCHAT")).toBe(true);
    expect(platforms.has("ALL")).toBe(true);

    const jurisdictions = new Set(ALL_GLOBAL_POLICIES.map((r) => r.jurisdictionCode));
    expect(jurisdictions.has("US")).toBe(true);
    expect(jurisdictions.has("GB")).toBe(true);
    expect(jurisdictions.has("AE")).toBe(true);
    expect(jurisdictions.has("EU")).toBe(true);
    expect(jurisdictions.has("GLOBAL")).toBe(true);
  });

  it("strictly enforces AI Engine usability flag based on dual verification status", () => {
    for (const rule of ALL_GLOBAL_POLICIES) {
      if (rule.verificationStatus === "VERIFIED_ACTIVE") {
        expect(rule.isUsableByAI).toBe(true);
      } else {
        // Pending and Draft rules must NEVER be presented as usable by the AI policy engine
        expect(rule.isUsableByAI).toBe(false);
      }
    }

    const verifiedCount = ALL_GLOBAL_POLICIES.filter((r) => r.verificationStatus === "VERIFIED_ACTIVE").length;
    const draftCount = ALL_GLOBAL_POLICIES.filter((r) => r.verificationStatus === "UNVERIFIED_DRAFT").length;
    const pendingCount = ALL_GLOBAL_POLICIES.filter((r) => r.verificationStatus === "PENDING_VERIFICATION").length;

    expect(verifiedCount).toBeGreaterThanOrEqual(5);
    expect(draftCount).toBeGreaterThanOrEqual(3);
    expect(pendingCount).toBeGreaterThanOrEqual(2);
  });

  it("contains valid source citations, direct links, and version audit trails for each rule", () => {
    for (const rule of ALL_GLOBAL_POLICIES) {
      expect(rule.sourceLinks.length).toBeGreaterThanOrEqual(1);
      for (const src of rule.sourceLinks) {
        expect(src.title.length).toBeGreaterThan(0);
        expect(src.url.startsWith("http")).toBe(true);
        expect(src.citation.length).toBeGreaterThan(0);
      }

      expect(rule.versionHistory.length).toBeGreaterThanOrEqual(1);
      for (const ver of rule.versionHistory) {
        expect(ver.versionNumber).toBeGreaterThanOrEqual(1);
        expect(["ACTIVE", "DRAFT", "PENDING_APPROVAL"]).toContain(ver.status);
        expect(ver.author.length).toBeGreaterThan(0);
        expect(ver.notes.length).toBeGreaterThan(0);
      }

      expect(rule.lastCheckedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("flags pending regulatory updates and research questions for draft policies", () => {
    const mohapRule = ALL_GLOBAL_POLICIES.find((r) => r.code === "RX-AE-MOHAP-01");
    expect(mohapRule).toBeDefined();
    expect(mohapRule?.verificationStatus).toBe("UNVERIFIED_DRAFT");
    expect(mohapRule?.pendingUpdatesNote).toContain("EDE");

    const ftcRule = ALL_GLOBAL_POLICIES.find((r) => r.code === "RX-US-FTC-HP-01");
    expect(ftcRule).toBeDefined();
    expect(ftcRule?.verificationStatus).toBe("PENDING_VERIFICATION");
    expect(ftcRule?.pendingUpdatesNote).toBeDefined();
  });
});

describe("UI Integration: Review Tier & Global Policy Directory", () => {
  it("integrates review preference selection into SubmitPanel", () => {
    const submitPanelSrc = readFileSync("src/components/submissions/submit-panel.tsx", "utf8");
    expect(submitPanelSrc).toContain('name="reviewTier"');
    expect(submitPanelSrc).toContain('value="HUMAN_REVIEW"');
    expect(submitPanelSrc).toContain('value="AI_ONLY"');
    expect(submitPanelSrc).toContain("Human Review (Add-on)");
    expect(submitPanelSrc).toContain("AI-Only Review");
  });

  it("integrates ReviewTierCard into SubmissionView with one-click upgrade/switch", () => {
    const submissionViewSrc = readFileSync("src/components/submissions/submission-view.tsx", "utf8");
    expect(submissionViewSrc).toContain("<ReviewTierCard");
    expect(submissionViewSrc).toContain("submission.context");

    const reviewCardSrc = readFileSync("src/components/submissions/review-tier-card.tsx", "utf8");
    expect(reviewCardSrc).toContain("Review Type & Request Status");
    expect(reviewCardSrc).toContain("Switch to AI-only review");
    expect(reviewCardSrc).toContain("Request Human Review (Add-on)");
    expect(reviewCardSrc).toContain("updateReviewTierAction");
  });

  it("renders Policy Rules Directory and missing coverage warning in GlobalPolicyDashboardView", () => {
    const dashSrc = readFileSync("src/components/policy/global-policy-dashboard-view.tsx", "utf8");
    expect(dashSrc).toContain("Global Policy Rules & Verification Directory");
    expect(dashSrc).toContain("RuleVerificationBadge");
    expect(dashSrc).toContain("Missing Policy Coverage Detected");
    expect(dashSrc).toContain("Draft Rule — Non-Operational");
    expect(dashSrc).toContain("Immutable Version Audit Trail");
  });
});
