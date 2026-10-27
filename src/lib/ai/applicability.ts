import type { PolicyRule } from "@/lib/policy/types";

/*
 * Which Policy Library rules the AI may use for one creative. Pure, so the
 * grounding boundary can be unit tested without a database.
 *
 * A rule is usable only when ALL of these hold:
 * - its current version is ACTIVE and VERIFIED, with a named verifier and a
 *   DIFFERENT named approver (two-person control, decision D1), and in effect
 *   today (effectiveFrom/effectiveTo);
 * - it cites at least one source section, and every cited source has been
 *   independently VERIFIED (a rule with nothing to cite can't ground a finding);
 * - its jurisdiction is GLOBAL or one of the creative's markets (a subdivision
 *   market such as CA-ON also counts for its country, CA); a rule limited to a
 *   sub-jurisdiction also needs that sub-jurisdiction among the markets;
 * - its platform is unset (platform-agnostic) or one of the creative's platforms;
 * - its industry is GENERAL, or matches the industry the client declared for
 *   the submission (ruleIndustriesFor: medical aesthetics also gets healthcare
 *   rules). Unknown or OTHER work only ever gets GENERAL rules.
 *
 * Anything else is left out, and when nothing is left the scan answers
 * INSUFFICIENT_POLICY_COVERAGE instead of asking the model.
 */

export const INSUFFICIENT_POLICY_COVERAGE = "Insufficient policy coverage — manual review required.";

export type ApplicabilityContext = {
  markets: string[];
  /** Market display names, used to match a rule's sub-jurisdiction by name. */
  marketNames?: string[];
  platforms: string[];
  /** Industry of the work under review, or null when it isn't known. */
  industry?: string | null;
};

/**
 * Fallback industry for submissions that declare none (rows from before the
 * P0 industry field): POLICY_DEFAULT_INDUSTRY, e.g. HEALTHCARE for a
 * deployment that only serves healthcare clients. Unset means unknown.
 */
export function policyIndustry(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.POLICY_DEFAULT_INDUSTRY?.trim().toUpperCase();
  return value ? value : null;
}

function inEffect(effectiveFrom: string | undefined, effectiveTo: string | null | undefined, now: Date) {
  const t = now.getTime();
  if (effectiveFrom && new Date(effectiveFrom).getTime() > t) return false;
  if (effectiveTo && new Date(effectiveTo).getTime() <= t) return false;
  return true;
}

export function filterApplicableVerifiedRules(
  rules: PolicyRule[],
  context: ApplicabilityContext,
  now: Date = new Date(),
): PolicyRule[] {
  const markets = new Set<string>();
  for (const code of context.markets) {
    const upper = code.trim().toUpperCase();
    if (!upper) continue;
    markets.add(upper);
    // Subdivision codes (ISO 3166-2, e.g. CA-ON) also count for their country.
    const country = upper.split("-")[0];
    if (country) markets.add(country);
  }
  const marketNames = new Set((context.marketNames ?? []).map((n) => n.trim().toUpperCase()).filter(Boolean));
  const platforms = new Set(context.platforms.map((p) => p.trim().toUpperCase()).filter(Boolean));
  const industry = context.industry?.trim().toUpperCase() || null;

  return rules.filter((rule) => {
    const ver = rule.currentVersion;
    if (!ver) return false;
    if (ver.status !== "ACTIVE" || ver.verificationStatus !== "VERIFIED") return false;
    // Two-person control (decision D1): a named verifier and a named approver.
    if (!ver.verifiedById || !ver.approvedById || ver.verifiedById === ver.approvedById) return false;
    if (!inEffect(ver.effectiveFrom, ver.effectiveTo, now)) return false;

    // Citations: at least one, all from independently verified sources.
    if (!ver.sources || ver.sources.length === 0) return false;
    if (ver.sources.some((s) => s.sourceVerificationStatus !== "VERIFIED")) return false;

    const jurisdiction = rule.jurisdictionCode.trim().toUpperCase();
    if (jurisdiction !== "GLOBAL" && !markets.has(jurisdiction)) return false;
    if (rule.subJurisdiction) {
      const sub = rule.subJurisdiction.trim().toUpperCase();
      if (!markets.has(sub) && !marketNames.has(sub)) return false;
    }

    if (rule.platformCode) {
      const platform = rule.platformCode.trim().toUpperCase();
      if (platform !== "GLOBAL" && !platforms.has(platform)) return false;
    }

    // GENERAL rules apply to all work; industry rules only to work of a
    // matching declared industry (medical aesthetics also gets healthcare).
    const ruleIndustry = (rule.industry ?? "").trim().toUpperCase() || "GENERAL";
    if (!ruleIndustriesFor(industry).includes(ruleIndustry)) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Industry matching and coverage (P0, Oct 27)

/** Industries a client can declare on a submission (decision D2). */
export const SUBMISSION_INDUSTRIES = ["HEALTHCARE", "MEDICAL_AESTHETICS", "OTHER"] as const;
export type SubmissionIndustry = (typeof SUBMISSION_INDUSTRIES)[number];

/**
 * Rule industries that may apply to work of a declared industry. Medical
 * aesthetics is healthcare, so healthcare rules apply to it too; anything
 * else (OTHER, or unknown) only gets GENERAL rules.
 */
export function ruleIndustriesFor(industry: string | null | undefined): string[] {
  const value = industry?.trim().toUpperCase() || null;
  if (value === "MEDICAL_AESTHETICS") return ["GENERAL", "HEALTHCARE", "MEDICAL_AESTHETICS"];
  if (value === "HEALTHCARE") return ["GENERAL", "HEALTHCARE"];
  return ["GENERAL"];
}

export type CoveragePair = {
  market: string | null;
  platform: string | null;
  covered: boolean;
  /** Applicable rule codes for this market and platform. */
  ruleCodes: string[];
  /** Of those, the ones that are the platform's own policies. */
  platformRuleCodes: string[];
};

/**
 * Coverage per market × platform for a submission. A pair is covered when at
 * least one applicable, verified, approved rule matches both; an uncovered
 * pair must show INSUFFICIENT_POLICY_COVERAGE even when other pairs ran.
 */
export function coverageReport(rules: PolicyRule[], context: ApplicabilityContext, now: Date = new Date()): CoveragePair[] {
  const applicable = filterApplicableVerifiedRules(rules, context, now);
  const markets = context.markets.length ? context.markets.map((m) => m.trim().toUpperCase()) : [null];
  const platforms = context.platforms.length ? context.platforms.map((p) => p.trim().toUpperCase()) : [null];
  const pairs: CoveragePair[] = [];
  for (const market of markets) {
    for (const platform of platforms) {
      const matching = applicable.filter((rule) => {
        const ctx = { ...context, markets: market ? [market] : [], platforms: platform ? [platform] : [] };
        return filterApplicableVerifiedRules([rule], ctx, now).length === 1;
      });
      pairs.push({
        market,
        platform,
        covered: matching.length > 0,
        ruleCodes: matching.map((r) => r.code),
        platformRuleCodes: matching.filter((r) => r.platformCode && r.platformCode.toUpperCase() === platform).map((r) => r.code),
      });
    }
  }
  return pairs;
}
