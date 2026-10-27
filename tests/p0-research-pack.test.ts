import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planResearchImport, type ResearchPack } from "@/lib/policy/research-import";
import { OFFICIAL_DOMAINS } from "@/lib/policy/validate";

// The research pack must stay a set of drafts: valid against the same checks
// as the Policy Library, on official domains, with no quotations or dates the
// research couldn't confirm, and an import plan that never changes stored rows.

const pack = JSON.parse(readFileSync(resolve(__dirname, "../docs/p0-policy-evidence/research/policy-research-pack.json"), "utf8")) as ResearchPack & {
  status: string;
  rules: Array<ResearchPack["rules"][number] & { researchStatus: string }>;
};

const ctx = {
  jurisdictions: ["US", "AE", "CA"],
  platforms: ["META", "GOOGLE", "TIKTOK"],
  existingSourceUrls: new Map<string, string>(),
  existingRuleCodes: new Set<string>(),
};

describe("P0 policy research pack", () => {
  it("passes the Policy Library validation with no errors", () => {
    const plan = planResearchImport(pack, ctx);
    expect(plan.errors).toEqual([]);
    expect(plan.rules).toHaveLength(pack.rules.length);
    expect(plan.sources).toHaveLength(pack.sources.length);
  });

  it("is marked for review and records no quotations or unconfirmed dates", () => {
    expect(pack.status).toBe("REQUIRES_REVIEW");
    for (const r of pack.rules) {
      expect(r.researchStatus).toBe("REQUIRES_REVIEW");
      expect(r.version.officialEffectiveDate ?? null).toBeNull();
      expect(r.version.effectiveFrom ?? null).toBeNull();
      for (const c of r.citations) {
        expect(c.excerpt ?? "").toBe("");
        expect(c.sourceUpdatedAt ?? null).toBeNull();
        expect(c.retrievedAt ?? null).toBeNull();
      }
    }
    for (const s of pack.sources) expect(s.publishedAt ?? null).toBeNull();
  });

  it("links only to official domains", () => {
    for (const s of pack.sources) {
      const host = new URL(String(s.officialUrl)).hostname;
      expect(OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)), host).toBe(true);
    }
    expect(planResearchImport(pack, ctx).warnings).toEqual([]);
  });

  it("covers Meta, Google and TikTok, and US and UAE law", () => {
    const platforms = new Set(pack.rules.map((r) => r.scope.platformCode).filter(Boolean));
    expect([...platforms].sort()).toEqual(["GOOGLE", "META", "TIKTOK"]);
    const regulation = pack.rules.filter((r) => r.scope.authorityType === "REGULATION").map((r) => r.scope.jurisdictionCode);
    expect(new Set(regulation)).toEqual(new Set(["US", "AE"]));
  });

  it("skips rules already stored and reuses stored sources instead of changing them", () => {
    const first = pack.rules[0].code;
    const url = String(pack.sources[0].officialUrl);
    const plan = planResearchImport(pack, { ...ctx, existingRuleCodes: new Set([first]), existingSourceUrls: new Map([[url + "/", "src_existing"]]) });
    expect(plan.skippedRules).toEqual([first]);
    expect(plan.rules.map((r) => r.code)).not.toContain(first);
    expect(plan.sources[0].existingId).toBe("src_existing");
  });

  it("rejects a pack with long quotations or unknown sources", () => {
    const bad = structuredClone(pack);
    bad.rules[0].citations[0].excerpt = "x".repeat(301);
    bad.rules[1].citations[0].sourceKey = "nope";
    const plan = planResearchImport(bad, ctx);
    expect(plan.errors.join("\n")).toMatch(/at most 300/);
    expect(plan.errors.join("\n")).toMatch(/unknown source nope/);
  });
});
