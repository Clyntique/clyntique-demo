import { describe, expect, it } from "vitest";
import { canApprovePolicyVersion, canVerifyPolicyVersion, isPolicyAdmin } from "@/lib/policy/auth";
import { filterPolicyRules } from "@/lib/policy/search";
import { MAX_QUOTATION, officialUrl, optionalDate, ruleCode, shortList, validateCitations, validateRuleScope, validateVersionContent } from "@/lib/policy/validate";
import type { PolicyRule } from "@/lib/policy/types";
import type { CurrentUser } from "@/lib/auth/dal";

// Policy Library rules that need no database (P0, Oct 27): permissions,
// two-person control, input validation and list filtering. All rule content
// here is synthetic.

const admin: CurrentUser = { id: "adm-1", name: "Admin One", email: "one@test.invalid", role: "TEAM", isPolicyAdmin: true };
const admin2: CurrentUser = { id: "adm-2", name: "Admin Two", email: "two@test.invalid", role: "TEAM", isPolicyAdmin: true };
const reviewer: CurrentUser = { id: "rev-1", name: "Reviewer", email: "team@clyntique.demo", role: "TEAM" };
const client: CurrentUser = { id: "cli-1", name: "Client", email: "client@test.invalid", role: "CLIENT", isPolicyAdmin: true };

function rule(code: string, over: Partial<PolicyRule> = {}): PolicyRule {
  const version = {
    id: `${code}-v1`,
    ruleId: code,
    versionNumber: 1,
    title: `${code} title`,
    summary: `Synthetic summary for ${code}`,
    legalExplanation: "Synthetic explanation",
    remediationAction: "Synthetic remediation",
    applicabilityConditions: [],
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    status: "ACTIVE" as const,
    verificationStatus: "VERIFIED" as const,
    sources: [{ id: "c1", sourceId: "s1", sourceName: "Synthetic source", authorityName: "Synthetic publisher", sectionReference: `${code} §1`, sectionTitle: "t", directUrl: "https://example.com", excerpt: "" }],
    changeSummary: "c",
    createdById: "a",
    createdByName: "A",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    id: code,
    code,
    title: `${code} title`,
    authorityType: "PLATFORM_POLICY",
    jurisdictionCode: "US",
    platformCode: "META",
    industry: "HEALTHCARE",
    category: "EFFICACY_CLAIM",
    currentVersionNumber: 1,
    currentVersion: version,
    versions: [version],
    createdAt: version.createdAt,
    updatedAt: version.createdAt,
    ...over,
  };
}

describe("Policy Library permissions (decision D6)", () => {
  it("only TEAM users with the database permission administer the library; email addresses grant nothing", () => {
    expect(isPolicyAdmin(admin)).toBe(true);
    expect(isPolicyAdmin(reviewer)).toBe(false); // team@clyntique.demo without the flag
    expect(isPolicyAdmin({ ...reviewer, email: "compliance-admin@clyntique.com" })).toBe(false);
    expect(isPolicyAdmin(client)).toBe(false); // a CLIENT never, flag or not
    expect(isPolicyAdmin({ ...admin, demoSession: true })).toBe(false);
  });
});

describe("Two-person control (decision D1)", () => {
  const submitted = { createdById: admin.id, status: "PENDING_APPROVAL" as const, verificationStatus: "UNVERIFIED" as const, verifiedById: null };

  it("any policy admin can verify a submitted version, including its author", () => {
    expect(canVerifyPolicyVersion(admin, submitted).allowed).toBe(true);
    expect(canVerifyPolicyVersion(admin2, submitted).allowed).toBe(true);
    expect(canVerifyPolicyVersion(reviewer, submitted).allowed).toBe(false);
    expect(canVerifyPolicyVersion(admin2, { ...submitted, status: "DRAFT" }).allowed).toBe(false);
    expect(canVerifyPolicyVersion(admin2, { ...submitted, verificationStatus: "VERIFIED" }).allowed).toBe(false);
  });

  it("the approver differs from both the verifier and the author", () => {
    const verifiedByAuthor = { ...submitted, verificationStatus: "VERIFIED" as const, verifiedById: admin.id };
    expect(canApprovePolicyVersion(admin, verifiedByAuthor).allowed).toBe(false);
    expect(canApprovePolicyVersion(admin2, verifiedByAuthor).allowed).toBe(true); // two people: author+verifier, approver
    const verifiedBySecond = { ...verifiedByAuthor, verifiedById: admin2.id };
    expect(canApprovePolicyVersion(admin2, verifiedBySecond).allowed).toBe(false);
    expect(canApprovePolicyVersion(admin, verifiedBySecond).allowed).toBe(false); // author
  });
});

describe("Policy input validation (decision D8)", () => {
  it("rule codes are short, upper case and dashed", () => {
    expect(ruleCode(" meta-hlt-01 ")).toEqual({ ok: true, value: "META-HLT-01" });
    expect(ruleCode("x").ok).toBe(false);
    expect(ruleCode("META HLT").ok).toBe(false);
  });

  it("official URLs are https without credentials; other domains are flagged, not refused", () => {
    expect(officialUrl("https://transparency.meta.com/policies/ad-standards/")).toMatchObject({ ok: true, value: { officialDomain: true } });
    expect(officialUrl("https://support.google.com/adspolicy/answer/1")).toMatchObject({ ok: true, value: { officialDomain: true } });
    expect(officialUrl("https://ads.tiktok.com/help/")).toMatchObject({ ok: true, value: { officialDomain: true } });
    expect(officialUrl("https://notmeta.com.evil.example/x")).toMatchObject({ ok: true, value: { officialDomain: false } });
    expect(officialUrl("https://evil-facebook.com/x")).toMatchObject({ ok: true, value: { officialDomain: false } });
    expect(officialUrl("http://www.ftc.gov").ok).toBe(false);
    expect(officialUrl("https://user:pw@www.ftc.gov").ok).toBe(false);
    expect(officialUrl("javascript:alert(1)").ok).toBe(false);
    expect(officialUrl("").ok).toBe(false);
  });

  it("dates the source does not state stay empty; nothing defaults to today", () => {
    expect(optionalDate("", "d")).toEqual({ ok: true, value: null });
    expect(optionalDate(undefined, "d")).toEqual({ ok: true, value: null });
    expect(optionalDate("2026-02-30", "d").ok).toBe(false);
    expect(optionalDate("March 2026", "d").ok).toBe(false);
    const d = optionalDate("2026-03-01", "d");
    expect(d.ok && d.value?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("citations keep quotations short, need a section and an https link", () => {
    const cite = { sourceId: "s1", sectionReference: "Healthcare section", sectionTitle: "", directUrl: "https://support.google.com/adspolicy/answer/1" };
    expect(validateCitations([], { required: true }).ok).toBe(false);
    expect(validateCitations([], { required: false }).ok).toBe(true);
    expect(validateCitations([{ ...cite, excerpt: "x".repeat(MAX_QUOTATION) }], { required: true }).ok).toBe(true);
    const long = validateCitations([{ ...cite, excerpt: "x".repeat(MAX_QUOTATION + 1) }], { required: true });
    expect(long.ok).toBe(false);
    expect(!long.ok && long.error).toMatch(/own words/);
    expect(validateCitations([{ ...cite, sectionReference: "" }], { required: true }).ok).toBe(false);
    expect(validateCitations([{ ...cite, retrievedAt: "2099-01-01" }], { required: true }).ok).toBe(false);
    const ok = validateCitations([{ ...cite, sourceUpdatedAt: "2026-05-01", retrievedAt: "2026-10-27" }], { required: true });
    expect(ok.ok && ok.value.citations[0]).toMatchObject({ sectionTitle: "Healthcare section", sourceUpdatedAt: new Date("2026-05-01T00:00:00.000Z") });
  });

  it("structured content: own-words summary, short lists, a valid restriction level and dates", () => {
    const base = { title: "Guaranteed outcomes", summary: "Ads must not promise guaranteed medical results.", legalExplanation: "", remediationAction: "" };
    const valid = validateVersionContent({ ...base, restrictionLevel: "prohibited", restrictedClaims: ["Guaranteed results", "Guaranteed results", "  "], substantiationRequirements: "Clinical evidence\nLicensed practitioner" });
    expect(valid.ok && valid.value).toMatchObject({ restrictionLevel: "PROHIBITED", restrictedClaims: ["Guaranteed results"], substantiationRequirements: ["Clinical evidence", "Licensed practitioner"], officialEffectiveDate: null, effectiveFrom: null });
    expect(validateVersionContent({ ...base, summary: "short" }).ok).toBe(false);
    expect(validateVersionContent({ ...base, restrictionLevel: "BANNED" }).ok).toBe(false);
    expect(validateVersionContent({ ...base, restrictedClaims: ["x".repeat(301)] }).ok).toBe(false);
    expect(validateVersionContent({ ...base, effectiveFrom: "2026-05-01", effectiveTo: "2026-04-01" }).ok).toBe(false);
    expect(shortList(Array(21).fill(0).map((_, i) => `item ${i}`), "l").ok).toBe(false);
  });

  it("scope: platform, market, industry and category come from fixed lists; platform policies name their platform", () => {
    const ref = { jurisdictions: ["US", "AE", "CA"], platforms: ["META", "GOOGLE", "TIKTOK"] };
    const base = { authorityType: "PLATFORM_POLICY", jurisdictionCode: "ae", platformCode: "tiktok", industry: "medical_aesthetics", category: "TESTIMONIAL_ENDORSEMENT" };
    expect(validateRuleScope(base, ref)).toMatchObject({ ok: true, value: { jurisdictionCode: "AE", platformCode: "TIKTOK", industry: "MEDICAL_AESTHETICS" } });
    expect(validateRuleScope({ ...base, platformCode: "SNAPCHAT" }, ref).ok).toBe(false);
    expect(validateRuleScope({ ...base, platformCode: "" }, ref).ok).toBe(false);
    expect(validateRuleScope({ ...base, authorityType: "REGULATION", platformCode: "" }, ref).ok).toBe(true);
    expect(validateRuleScope({ ...base, jurisdictionCode: "FR" }, ref).ok).toBe(false);
    expect(validateRuleScope({ ...base, jurisdictionCode: "GLOBAL" }, ref).ok).toBe(true);
    expect(validateRuleScope({ ...base, industry: "AESTHETICS" }, ref).ok).toBe(false);
    expect(validateRuleScope({ ...base, category: "MADE_UP" }, ref).ok).toBe(false);
    for (const category of ["TARGETING_RESTRICTION", "PRESCRIPTION_MEDICINE", "CREDENTIALS_LICENSING", "TESTIMONIAL_ENDORSEMENT", "PERSONAL_HEALTH_ATTRIBUTES"]) {
      expect(validateRuleScope({ ...base, category }, ref).ok).toBe(true);
    }
  });
});

describe("Policy Library list filtering", () => {
  const rules = [
    rule("META-HLT-01"),
    rule("TIKTOK-AE-01", { jurisdictionCode: "AE", platformCode: "TIKTOK", category: "TESTIMONIAL_ENDORSEMENT" }),
    rule("US-FTC-01", { authorityType: "REGULATION", platformCode: null }),
  ];

  it("filters by market, platform, authority, category and text", () => {
    expect(filterPolicyRules(rules, { jurisdiction: "AE" }).map((r) => r.code)).toEqual(["TIKTOK-AE-01"]);
    expect(filterPolicyRules(rules, { platform: "META" }).map((r) => r.code)).toEqual(["META-HLT-01", "US-FTC-01"]);
    expect(filterPolicyRules(rules, { authorityType: "REGULATION" }).map((r) => r.code)).toEqual(["US-FTC-01"]);
    expect(filterPolicyRules(rules, { category: "TESTIMONIAL_ENDORSEMENT" }).map((r) => r.code)).toEqual(["TIKTOK-AE-01"]);
    expect(filterPolicyRules(rules, { query: "us-ftc-01 §1" }).map((r) => r.code)).toEqual(["US-FTC-01"]);
  });
});
