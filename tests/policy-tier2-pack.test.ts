import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planResearchImport, type ResearchPack } from "@/lib/policy/research-import";
import { OFFICIAL_DOMAINS } from "@/lib/policy/validate";

type Tier2Pack = ResearchPack & { status: string; rules: Array<ResearchPack["rules"][number] & { researchStatus: string }> };
const pack = JSON.parse(readFileSync(resolve(__dirname, "../docs/p0-policy-evidence/research/tier2-healthcare-expansion-pack.json"), "utf8")) as Tier2Pack;

const ctx = {
  jurisdictions: ["US", "CA", "AE"],
  platforms: ["META", "TIKTOK", "GOOGLE", "SNAPCHAT", "LINKEDIN", "X", "OTHER"],
  existingSourceUrls: new Map<string, string>(),
  existingRuleCodes: new Set<string>(),
};

const CODES = [
  "RX-META-PA-01",
  "RX-GOOG-PA-01",
  "RX-GOOG-PDS-01",
  "RX-GOOG-RDT-01",
  "RX-TIKTOK-MC-01",
  "RX-TIKTOK-HP-01",
  "RX-US-FTC-CS-01",
  "RX-US-FTC-TE-01",
];

const SOURCE_KEYS = [
  "google-health-personalized",
  "google-healthcare-medicines",
  "meta-personal-attributes",
  "tiktok-advertising-policies",
  "tiktok-healthcare-pharmaceuticals",
  "us-ftc-endorsement-guides",
  "us-ftc-health-products-guidance",
];

describe("Tier 2 Healthcare Advertising Policy Pack", () => {
  it("holds the expected 8 rules and 7 official sources", () => {
    expect(pack.rules.map((r) => r.code)).toEqual(CODES);
    expect(pack.sources.map((s) => s.key).sort()).toEqual(SOURCE_KEYS);
  });

  it("passes the Policy Library validation with zero errors and zero warnings", () => {
    const plan = planResearchImport(pack, ctx);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.sources).toHaveLength(7);
    expect(plan.rules).toHaveLength(8);
    expect(plan.skippedRules).toEqual([]);
  });

  it("cites only official recognized domains and direct URLs match the publisher domain", () => {
    for (const s of pack.sources) {
      expect(OFFICIAL_DOMAINS.some((d) => new URL(String(s.officialUrl)).hostname.endsWith(d))).toBe(true);
    }
    for (const r of pack.rules) {
      expect(r.citations.length).toBeGreaterThanOrEqual(1);
      for (const c of r.citations) {
        const src = pack.sources.find((s) => s.key === c.sourceKey);
        expect(src).toBeDefined();
        expect(new URL(String(c.directUrl)).hostname).toBe(new URL(String(src!.officialUrl)).hostname);
      }
    }
  });

  it("keeps all sources and rules strictly unverified drafts with verifier notes and no legal advice disclaimer", () => {
    expect(pack.status).toBe("UNVERIFIED");
    for (const s of pack.sources) {
      expect(s.publishedAt).toBeNull();
    }
    for (const r of pack.rules) {
      expect(r.researchStatus).toBe("REQUIRES_REVIEW");
      expect(String(r.version.reviewNote)).toMatch(/^RESEARCHED DRAFT, UNVERIFIED/);
      expect(String(r.version.reviewNote)).toMatch(/Verifier questions:/);
      expect(String(r.version.reviewNote)).toMatch(/Not legal advice/);
      expect(r.version.officialEffectiveDate).toBeNull();
      for (const c of r.citations) {
        expect(c.sourceUpdatedAt).toBeNull();
        expect(c.retrievedAt).toBeNull();
      }
    }
  });

  it("accurately incorporates Yash review feedback for Meta Personal Health Attributes (RX-META-PA-01)", () => {
    const meta = pack.rules.find((r) => r.code === "RX-META-PA-01")!;
    expect(meta.scope.category).toBe("PERSONAL_HEALTH_ATTRIBUTES");
    expect(meta.scope.platformCode).toBe("META");
    expect(meta.version.restrictionLevel).toBe("PROHIBITED");
    expect(meta.version.title).toContain("personal health attributes");
    expect(String(meta.version.legalExplanation)).toContain("second-person");
    expect(String(meta.version.legalExplanation)).toContain("Do you have diabetes?");
    expect(String(meta.version.legalExplanation)).toContain("third person");
    expect(String(meta.version.remediationAction)).toContain("objective service descriptions");
    const metaExceptions = meta.version.exceptions as string[];
    expect(metaExceptions).toHaveLength(1);
    expect(metaExceptions[0]).toContain("Public service announcements");
  });

  it("accurately incorporates Yash review feedback for Google Health Personalization (RX-GOOG-PA-01)", () => {
    const goog = pack.rules.find((r) => r.code === "RX-GOOG-PA-01")!;
    expect(goog.scope.category).toBe("TARGETING_RESTRICTION");
    expect(goog.scope.platformCode).toBe("GOOGLE");
    expect(goog.version.restrictionLevel).toBe("RESTRICTED");
    expect(String(goog.version.summary)).toContain("Customer Match");
    expect(String(goog.version.summary)).toContain("remarketing");
    expect(String(goog.version.legalExplanation)).toContain("Customer Match");
    expect(String(goog.version.legalExplanation)).toContain("standard contextual keyword targeting");
    const googExceptions = (goog.version.exceptions ?? []) as string[];
    expect(googExceptions.some((e: string) => e.includes("Contextual search"))).toBe(true);
    expect(googExceptions.some((e: string) => e.includes("predefined Google audience"))).toBe(true);
  });

  it("accurately splits Google prescription drugs into Services (RX-GOOG-PDS-01) and Terms (RX-GOOG-RDT-01)", () => {
    const pds = pack.rules.find((r) => r.code === "RX-GOOG-PDS-01")!;
    expect(pds.scope.category).toBe("CREDENTIALS_LICENSING");
    expect(pds.scope.industry).toBe("HEALTHCARE");
    expect(pds.version.title).toContain("prescription drug services and telemedicine prescribing");
    expect(String(pds.version.legalExplanation)).toContain("LegitScript");
    expect(String(pds.version.legalExplanation)).toContain("United States");
    expect(String(pds.version.legalExplanation)).toContain("UAE");
    const pdsExceptions = pds.version.exceptions as string[];
    expect(pdsExceptions[0]).toContain("Traditional physical medical practices");

    const rdt = pack.rules.find((r) => r.code === "RX-GOOG-RDT-01")!;
    expect(rdt.scope.category).toBe("PRESCRIPTION_MEDICINE");
    expect(rdt.scope.industry).toBe("HEALTHCARE");
    expect(rdt.version.title).toContain("Restrictions on prescription drug brand names");
    expect(String(rdt.version.legalExplanation)).toContain("direct-to-consumer");
    expect(String(rdt.version.legalExplanation)).toContain("United States");
    const rdtExceptions = rdt.version.exceptions as string[];
    expect(rdtExceptions[0]).toContain("Certified pharmaceutical manufacturers");
  });

  it("provides nuanced TikTok healthcare advertising coverage without unsupported blanket claims", () => {
    const mc = pack.rules.find((r) => r.code === "RX-TIKTOK-MC-01")!;
    expect(mc.scope.platformCode).toBe("TIKTOK");
    expect(mc.scope.category).toBe("EFFICACY_CLAIM");
    expect(mc.version.restrictionLevel).toBe("PROHIBITED");
    expect(String(mc.version.legalExplanation)).toContain("before-and-after");
    expect(String(mc.version.legalExplanation)).toContain("Weight Management");

    const hp = pack.rules.find((r) => r.code === "RX-TIKTOK-HP-01")!;
    expect(hp.scope.platformCode).toBe("TIKTOK");
    expect(hp.scope.category).toBe("PRESCRIPTION_MEDICINE");
    expect(hp.version.restrictionLevel).toBe("RESTRICTED");
    expect(String(hp.version.summary)).toContain("Industry Entry rules that vary by country");
    expect(String(hp.version.legalExplanation)).toContain("market-by-market matrix");
    expect(String(hp.version.reviewNote)).toContain("Verifier questions:");
  });

  it("accurately reflects FTC CARSE substantiation standard and endorsement rules", () => {
    const cs = pack.rules.find((r) => r.code === "RX-US-FTC-CS-01")!;
    expect(cs.scope.authorityType).toBe("REGULATION");
    expect(cs.scope.jurisdictionCode).toBe("US");
    expect(cs.scope.platformCode).toBeNull();
    expect(cs.scope.category).toBe("SUBSTANTIATION");
    expect(String(cs.version.summary)).toContain("context-dependent and determined by the Pfizer factors");
    expect(String(cs.version.legalExplanation)).toContain("competent and reliable scientific evidence");
    expect(String(cs.version.legalExplanation)).toContain("Pfizer factors");
    expect(String(cs.version.legalExplanation)).toContain("does not impose a rigid blanket requirement");

    const te = pack.rules.find((r) => r.code === "RX-US-FTC-TE-01")!;
    expect(te.scope.authorityType).toBe("REGULATION");
    expect(te.scope.jurisdictionCode).toBe("US");
    expect(te.scope.platformCode).toBeNull();
    expect(te.scope.category).toBe("TESTIMONIAL_ENDORSEMENT");
    expect(te.version.restrictionLevel).toBe("DISCLOSURE_REQUIRED");
    expect(String(te.version.legalExplanation)).toContain("16 CFR Part 255");
    expect(String(te.version.legalExplanation)).toContain("255.2");
    expect(String(te.version.legalExplanation)).toContain("255.5");
    expect(String(te.version.restrictedClaims)).toContain("Results may vary");
  });

  it("plans an idempotent import that reuses stored sources and skips stored rules", () => {
    const metaUrl = String(pack.sources.find((s) => s.key === "meta-personal-attributes")!.officialUrl);
    const plan = planResearchImport(pack, {
      ...ctx,
      existingSourceUrls: new Map([[metaUrl.replace(/\/$/, "").toUpperCase(), "stored-meta-source-id"]]),
      existingRuleCodes: new Set(["RX-META-PA-01"]),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.sources.find((s) => s.key === "meta-personal-attributes")!.existingId).toBe("stored-meta-source-id");
    expect(plan.skippedRules).toEqual(["RX-META-PA-01"]);
    expect(plan.rules).toHaveLength(7);
  });

  it("enforces transactional count invariants and rollback safety triggers under the established versioning model", () => {
    const before = { sources: 3, rules: 3, versions: 3, events: 9 };
    const newSources = [{ key: "s1" }, { key: "s2" }, { key: "s3" }, { key: "s4" }];
    const plannedRules = [{}, {}, {}, {}, {}, {}]; // 6 new canonical rules
    const newVersionsCreated = 6 + 2; // 6 new v1 drafts + 2 proposed v2 drafts
    const eventsCreated = 4 + 6 + 2 + 1; // 4 sources + 6 rules + 2 version proposed + 1 rule retired

    const expected = {
      sources: before.sources + newSources.length,
      rules: before.rules + plannedRules.length,
      versions: before.versions + newVersionsCreated,
      events: before.events + eventsCreated,
    };

    expect(expected).toEqual({
      sources: 7,
      rules: 9,
      versions: 11,
      events: 22,
    });

    const triggerRollback = (envVal: string | undefined, afterState: typeof expected) => {
      const bad = (Object.keys(expected) as Array<keyof typeof expected>).filter((k) => expected[k] !== afterState[k]);
      if (envVal === "1") bad.push("sources");
      if (bad.length) {
        throw new Error(`Post-write check failed for ${bad.join(", ")}; rolled back.`);
      }
      return true;
    };

    expect(() => triggerRollback("1", expected)).toThrow(/Post-write check failed for sources; rolled back\./);
    expect(() => triggerRollback(undefined, { ...expected, rules: 8 })).toThrow(/Post-write check failed for rules; rolled back\./);
    expect(triggerRollback(undefined, expected)).toBe(true);
  });
});
