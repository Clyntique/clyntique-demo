import type { PolicyFilterCriteria, PolicyRule } from "./types";

/**
 * Filtering for the Policy Library list (search box and filters). Which rules
 * the AI may use is decided only by src/lib/ai/applicability.ts.
 */

export function filterPolicyRules(rules: PolicyRule[], criteria: PolicyFilterCriteria): PolicyRule[] {
  return rules.filter((rule) => {
    // 1. Text Query (code, title, summary, legal explanation, sources)
    if (criteria.query && criteria.query.trim()) {
      const q = criteria.query.toLowerCase().trim();
      const matchCode = rule.code.toLowerCase().includes(q);
      const matchTitle = rule.title.toLowerCase().includes(q);
      const matchSummary = rule.currentVersion.summary.toLowerCase().includes(q);
      const matchExplanation = rule.currentVersion.legalExplanation.toLowerCase().includes(q);
      const matchSources = rule.currentVersion.sources.some(
        (s) =>
          s.sourceName.toLowerCase().includes(q) ||
          s.sectionReference.toLowerCase().includes(q) ||
          s.authorityName.toLowerCase().includes(q)
      );
      if (!matchCode && !matchTitle && !matchSummary && !matchExplanation && !matchSources) {
        return false;
      }
    }

    // 2. Authority Type
    if (criteria.authorityType && criteria.authorityType !== "ALL") {
      if (rule.authorityType !== criteria.authorityType) return false;
    }

    // 3. Jurisdiction
    if (criteria.jurisdiction && criteria.jurisdiction !== "ALL") {
      if (rule.jurisdictionCode !== criteria.jurisdiction && rule.jurisdictionCode !== "GLOBAL") {
        return false;
      }
    }

    // 4. Platform
    if (criteria.platform && criteria.platform !== "ALL") {
      if (rule.platformCode && rule.platformCode !== criteria.platform && rule.platformCode !== "GLOBAL") {
        return false;
      }
    }

    // 5. Status
    if (criteria.status && criteria.status !== "ALL") {
      if (rule.currentVersion.status !== criteria.status) return false;
    }

    // 6. Category
    if (criteria.category && criteria.category !== "ALL") {
      if (rule.category !== criteria.category) return false;
    }

    return true;
  });
}
