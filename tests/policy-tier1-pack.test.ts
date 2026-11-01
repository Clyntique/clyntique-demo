import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planResearchImport, type ResearchPack } from "@/lib/policy/research-import";
import { OFFICIAL_DOMAINS } from "@/lib/policy/validate";

// The Tier 1 Meta/Google pack imported by prisma/policy-tier1-import.ts: three
// official sources, three DRAFT rules, every statement still to be verified by
// a policy admin. These tests keep the pack honest: it must pass the Policy
// Library's own validation, cite only official pages, carry no superseded
// wording, and plan an import that reuses stored sources and skips stored rules.

type Tier1Pack = ResearchPack & { status: string; rules: Array<ResearchPack["rules"][number] & { researchStatus: string }> };
const pack = JSON.parse(readFileSync(resolve(__dirname, "../docs/p0-policy-evidence/research/tier1-meta-google-pack.json"), "utf8")) as Tier1Pack;
const ctx = { jurisdictions: ["US", "CA", "AE"], platforms: ["META", "TIKTOK", "GOOGLE", "SNAPCHAT", "LINKEDIN", "X", "OTHER"], existingSourceUrls: new Map<string, string>(), existingRuleCodes: new Set<string>() };
const CODES = ["RX-META-PA-01", "RX-GOOG-PA-01", "RX-GOOG-HM-01"];

describe("Tier 1 Meta/Google policy pack", () => {
  it("holds exactly the three Tier 1 rules and their three official sources", () => {
    expect(pack.rules.map((r) => r.code)).toEqual(CODES);
    expect(pack.sources.map((s) => s.key).sort()).toEqual(["google-health-personalized", "google-healthcare-medicines", "meta-personal-attributes"]);
  });

  it("passes the Policy Library validation with no errors or warnings", () => {
    const plan = planResearchImport(pack, ctx);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.sources).toHaveLength(3);
    expect(plan.rules).toHaveLength(3);
    expect(plan.skippedRules).toEqual([]);
  });

  it("cites only official pages, with the cited URL on the source's domain", () => {
    for (const s of pack.sources) expect(OFFICIAL_DOMAINS.some((d) => new URL(String(s.officialUrl)).hostname.endsWith(d))).toBe(true);
    for (const r of pack.rules) {
      expect(r.citations.length).toBeGreaterThanOrEqual(1);
      for (const c of r.citations) {
        const src = pack.sources.find((s) => s.key === c.sourceKey);
        expect(src).toBeDefined();
        expect(new URL(String(c.directUrl)).hostname).toBe(new URL(String(src!.officialUrl)).hostname);
      }
    }
  });

  it("is unverified throughout and says so, with no human-only dates filled in", () => {
    expect(pack.status).toBe("UNVERIFIED");
    for (const s of pack.sources) expect(s.publishedAt).toBeNull();
    for (const r of pack.rules) {
      expect(r.researchStatus).toBe("REQUIRES_REVIEW");
      expect(String(r.version.reviewNote)).toMatch(/^IMPORTED DRAFT, UNVERIFIED/);
      expect(String(r.version.reviewNote)).toMatch(/Verifier questions:/);
      expect(r.version.officialEffectiveDate).toBeNull();
      for (const c of r.citations) {
        expect(c.sourceUpdatedAt).toBeNull();
        expect(c.retrievedAt).toBeNull();
      }
    }
  });

  it("carries no superseded or unsupported wording", () => {
    const text = JSON.stringify(pack);
    expect(text).not.toMatch(/secondary guides/i); // Oct 30 draft wrongly attributed the "you/your" point
    expect(text).not.toMatch(/not allowed in most countries/i); // Oct 30 correction for RX-GOOG-HM-01
    expect(text).not.toMatch(/none stated/i); // Meta's page has a change log (Nov 1 read)
    const meta = pack.rules.find((r) => r.code === "RX-META-PA-01")!;
    expect(String(meta.version.legalExplanation)).toMatch(/you\/your/);
    expect(meta.version.exceptions).toHaveLength(1);
    expect(meta.version.restrictionLevel).toBe("PROHIBITED");
    const hm = pack.rules.find((r) => r.code === "RX-GOOG-HM-01")!;
    expect(hm.version.substantiationRequirements).toEqual(["Google certification for the advertiser's domain in each targeted country"]);
    expect(String(hm.version.reviewNote)).toMatch(/United States/);
  });

  it("plans a re-run that reuses stored sources (any URL spelling) and skips stored rules", () => {
    const metaUrl = String(pack.sources.find((s) => s.key === "meta-personal-attributes")!.officialUrl);
    const plan = planResearchImport(pack, {
      ...ctx,
      existingSourceUrls: new Map([[metaUrl.replace(/\/$/, "").toUpperCase(), "stored-meta-id"]]),
      existingRuleCodes: new Set(["RX-META-PA-01"]),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.sources.find((s) => s.key === "meta-personal-attributes")!.existingId).toBe("stored-meta-id");
    expect(plan.sources.filter((s) => !s.existingId).map((s) => s.key).sort()).toEqual(["google-health-personalized", "google-healthcare-medicines"]);
    expect(plan.skippedRules).toEqual(["RX-META-PA-01"]);
    expect(plan.rules.map((r) => r.code)).toEqual(["RX-GOOG-PA-01", "RX-GOOG-HM-01"]);
    const full = planResearchImport(pack, { ...ctx, existingSourceUrls: new Map(pack.sources.map((s) => [String(s.officialUrl), `id-${s.key}`])), existingRuleCodes: new Set(CODES) });
    expect(full.sources.every((s) => s.existingId)).toBe(true);
    expect(full.rules).toEqual([]);
    expect(full.skippedRules).toEqual(CODES);
  });
});
