import type { PolicyRule } from "@/lib/policy/types";

/*
 * Which Policy Library rules the AI may use for one creative. Pure, so the
 * grounding boundary can be unit tested without a database.
 *
 * A rule is usable only when ALL of these hold:
 * - its current version is ACTIVE and VERIFIED (approved by a TEAM policy
 *   administrator) and in effect today (effectiveFrom/effectiveTo);
 * - it cites at least one source section, and every cited source has been
 *   independently VERIFIED (a rule with nothing to cite can't ground a finding);
 * - its jurisdiction is GLOBAL or one of the creative's markets (a subdivision
 *   market such as CA-ON also counts for its country, CA); a rule limited to a
 *   sub-jurisdiction also needs that sub-jurisdiction among the markets;
 * - its platform is unset (platform-agnostic) or one of the creative's platforms;
 * - its industry is GENERAL, or equals the industry of the work under review.
 *   The industry is unknown unless configured (see policyIndustry), and an
 *   industry-specific rule never applies to work of unknown industry.
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
 * Industry of the work under review. No submission records its industry yet,
 * so it comes from POLICY_DEFAULT_INDUSTRY (e.g. HEALTHCARE for a deployment
 * that only serves healthcare clients). Unset means unknown.
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

    const ruleIndustry = (rule.industry ?? "").trim().toUpperCase();
    if (ruleIndustry && ruleIndustry !== "GENERAL" && ruleIndustry !== industry) return false;

    return true;
  });
}
