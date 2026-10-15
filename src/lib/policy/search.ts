import type {
  AIGroundingMatch,
  AIGroundingResult,
  PolicyFilterCriteria,
  PolicyRule,
} from "./types";

/**
 * Deterministic search and filtering engine for Clyntique Compliance Policy Library.
 * Pure deterministic algorithms; zero opaque embeddings or probabilistic vector drift.
 * Strictly enforces that ONLY approved, currently applicable versions are queryable by AI.
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

/**
 * Strict boundary: Only APPROVED, VERIFIED, currently active rule versions
 * can be accessed by AI retrieval or compliance automation.
 */
export function getActiveApprovedRules(rules: PolicyRule[], now: Date = new Date()): PolicyRule[] {
  const nowIso = now.toISOString();
  return rules.filter((rule) => {
    const v = rule.currentVersion;
    if (v.status !== "ACTIVE") return false;
    if (v.verificationStatus !== "VERIFIED") return false;
    if (v.effectiveFrom && v.effectiveFrom > nowIso) return false;
    if (v.effectiveTo && v.effectiveTo <= nowIso) return false;
    return true;
  });
}

export interface CreativeContextForGrounding {
  creativeTitle: string;
  adCopy?: string;
  markets: string[]; // e.g. ["US"], ["AE"], ["GLOBAL"]
  platforms: string[]; // e.g. ["TIKTOK"], ["META"], ["GOOGLE"]
  detectedVisualThemes?: string[]; // e.g. ["BEFORE_AFTER", "PRESCRIPTION_INJECTABLE", "INFLUENCER_ENDORSEMENT"]
}

// Deterministic keyword and claim pattern triggers
const CLAIM_PATTERNS: Record<
  string,
  {
    regex: RegExp;
    category: string;
    suggestedSeverity: "HIGH" | "MEDIUM" | "LOW" | "ADVISORY";
  }
> = {
  BEFORE_AFTER: {
    regex: /\b(before\s*(&|and|\/)\s*after|transformation|results?\s*in\s*\d+\s*(days|weeks)|drastic\s*change)\b/i,
    category: "BEFORE_AFTER",
    suggestedSeverity: "HIGH",
  },
  INFLUENCER_ENDORSEMENT: {
    regex: /\b(paid\s*partnership|#ad|ambassador|sponsor|my\s*routine|testimonial|recommend(ed)?\s*by)\b/i,
    category: "DISCLOSURE",
    suggestedSeverity: "MEDIUM",
  },
  PRESCRIPTION_AESTHETIC: {
    regex: /\b(botox|filler|fillers|juvederm|dysport|ozempic|wegovy|glp-?1|retin-?a|tretinoin)\b/i,
    category: "RESTRICTED_PROCEDURES",
    suggestedSeverity: "HIGH",
  },
  MEDICAL_DISEASE_CURE: {
    regex: /\b(cures?|eliminates?\s*wrinkles?|repairs?\s*dna|stimulates?\s*collagen|anti-aging\s*miracle|permanent\s*fix)\b/i,
    category: "EFFICACY_CLAIM",
    suggestedSeverity: "HIGH",
  },
  MOHAP_PERMIT_MISSING: {
    regex: /\b(dubai|uae|abu\s*dhabi|sharjah|clinic|dermatolog(y|ist)|laser|skin)\b/i,
    category: "MANDATORY_LABELING",
    suggestedSeverity: "HIGH",
  },
};

/**
 * Grounded AI compliance retrieval using deterministic policy matching.
 * Returns matches with full rule citations and remediation advice, or an explicit
 * insufficient coverage response when no verified policies cover the requested scope.
 */
export function findGroundedRulesForContext(
  allRules: PolicyRule[],
  context: CreativeContextForGrounding,
  now: Date = new Date()
): AIGroundingResult {
  const activeRules = getActiveApprovedRules(allRules, now);
  const checkedJurisdictions = [...new Set(context.markets.map((m) => m.toUpperCase()))];
  const checkedPlatforms = [...new Set(context.platforms.map((p) => p.toUpperCase()))];

  // 1. Verify policy coverage for target markets
  const knownJurisdictions = new Set(["US", "AE", "GLOBAL"]);
  const unsupportedMarkets = checkedJurisdictions.filter((m) => !knownJurisdictions.has(m));

  if (unsupportedMarkets.length > 0) {
    return {
      hasCoverage: false,
      insufficientCoverageReason: `Insufficient verified policy coverage for market(s): ${unsupportedMarkets.join(
        ", "
      )}. Clyntique Policy Library currently has verified coverage for US, UAE, and Global ad platforms. Human TEAM compliance review required.`,
      matches: [],
      groundedRulesCount: 0,
      checkedJurisdictions,
      checkedPlatforms,
      disclaimer:
        "AI compliance suggestions are deterministically grounded in verified Clyntique policy versions. All suggestions require human TEAM reviewer confirmation before publishing to clients.",
    };
  }

  // 2. Filter applicable rules strictly for the given markets & platforms
  const scopeApplicableRules = activeRules.filter((rule) => {
    // Jurisdiction check
    const matchesJurisdiction =
      rule.jurisdictionCode === "GLOBAL" ||
      checkedJurisdictions.includes(rule.jurisdictionCode);

    if (!matchesJurisdiction) return false;

    // Platform check
    if (rule.platformCode && rule.platformCode !== "GLOBAL") {
      if (!checkedPlatforms.includes(rule.platformCode)) {
        return false;
      }
    }

    return true;
  });

  if (scopeApplicableRules.length === 0) {
    return {
      hasCoverage: false,
      insufficientCoverageReason: `No active, verified rules available for target combination of markets (${checkedJurisdictions.join(
        ", "
      )}) and platforms (${checkedPlatforms.join(", ")}).`,
      matches: [],
      groundedRulesCount: 0,
      checkedJurisdictions,
      checkedPlatforms,
      disclaimer:
        "AI compliance suggestions are deterministically grounded in verified Clyntique policy versions. Human review is required.",
    };
  }

  // 3. Match against creative text copy and visual themes
  const textToScan = `${context.creativeTitle} ${context.adCopy ?? ""}`;
  const matches: AIGroundingMatch[] = [];

  for (const rule of scopeApplicableRules) {
    const matchedConditions: string[] = [];
    let shouldInclude = false;
    let confidence = 0.85;

    // Direct platform policy match if platform is active
    if (rule.platformCode && checkedPlatforms.includes(rule.platformCode)) {
      if (rule.category === "BEFORE_AFTER" && (CLAIM_PATTERNS.BEFORE_AFTER.regex.test(textToScan) || context.detectedVisualThemes?.includes("BEFORE_AFTER"))) {
        matchedConditions.push("Platform specific before/after comparison detected in ad copy or creative visual theme.");
        shouldInclude = true;
        confidence = 0.95;
      }
      if (rule.category === "RESTRICTED_PROCEDURES" && (CLAIM_PATTERNS.PRESCRIPTION_AESTHETIC.regex.test(textToScan) || context.detectedVisualThemes?.includes("PRESCRIPTION_INJECTABLE"))) {
        matchedConditions.push("Restricted aesthetic injectable or prescription substance referenced.");
        shouldInclude = true;
        confidence = 0.98;
      }
    }

    // US Regulations
    if (rule.jurisdictionCode === "US" || checkedJurisdictions.includes("US")) {
      if (rule.code === "US-FTC-DISC-01") {
        if (CLAIM_PATTERNS.INFLUENCER_ENDORSEMENT.regex.test(textToScan) || context.detectedVisualThemes?.includes("INFLUENCER_ENDORSEMENT")) {
          // Check if disclosure is missing or ambiguous
          if (!/#ad\b/i.test(textToScan) && !/paid partnership/i.test(textToScan)) {
            matchedConditions.push("Endorsement or testimonial present without conspicuous '#Ad' or 'Paid Partnership' label.");
            shouldInclude = true;
          }
        }
      }
      if (rule.code === "US-FDA-COSM-01" && CLAIM_PATTERNS.MEDICAL_DISEASE_CURE.regex.test(textToScan)) {
        matchedConditions.push("Cosmetic copy contains medical disease or physiological structure/function claims.");
        shouldInclude = true;
        confidence = 0.92;
      }
      if (rule.code === "US-FTC-SUBST-02" && CLAIM_PATTERNS.BEFORE_AFTER.regex.test(textToScan)) {
        matchedConditions.push("Objective clinical performance claim requires prior substantiation on file.");
        shouldInclude = true;
      }
    }

    // UAE Regulations
    if (rule.jurisdictionCode === "AE" || checkedJurisdictions.includes("AE")) {
      if (rule.code === "AE-MOH-LIC-01") {
        // Check if MOHAP permit number is in text
        const hasMohapNumber = /MOHAP\/ADV\/|MOH Approval No/i.test(textToScan);
        if (!hasMohapNumber) {
          matchedConditions.push("Mandatory UAE MOHAP Health Advertising permit number not detected in creative copy.");
          shouldInclude = true;
          confidence = 0.97;
        }
      }
      if (rule.code === "AE-NMC-BILING-02") {
        // Check if Arabic characters are present
        const hasArabic = /[\u0600-\u06FF]/.test(textToScan);
        if (!hasArabic) {
          matchedConditions.push("Mandatory dual Arabic/English disclosure missing in UAE consumer ad text.");
          shouldInclude = true;
          confidence = 0.91;
        }
      }
    }

    // Internal Risk
    if (rule.authorityType === "INTERNAL_RISK") {
      if (context.detectedVisualThemes?.includes("CLINIC_PROCEDURE") || /clinic|treatment|doctor|procedure/i.test(textToScan)) {
        matchedConditions.push("Depicts aesthetic clinic procedures; practitioner credentials required by Clyntique Protocol.");
        shouldInclude = true;
        confidence = 0.88;
      }
    }

    if (shouldInclude) {
      const primarySource = rule.currentVersion.sources[0];
      matches.push({
        ruleId: rule.id,
        ruleCode: rule.code,
        ruleTitle: rule.title,
        versionNumber: rule.currentVersion.versionNumber,
        authorityType: rule.authorityType,
        authorityName: primarySource ? primarySource.authorityName : rule.currentVersion.createdByName,
        sourceSection: primarySource ? primarySource.sectionReference : "Internal Directive",
        sourceUrl: primarySource ? primarySource.directUrl : "#",
        suggestedSeverity:
          rule.authorityType === "REGULATION" || rule.category === "RESTRICTED_PROCEDURES"
            ? "HIGH"
            : "MEDIUM",
        issue: rule.currentVersion.summary,
        legalExplanation: rule.currentVersion.legalExplanation,
        remediationAction: rule.currentVersion.remediationAction,
        confidenceScore: confidence,
        matchedConditions,
      });
    }
  }

  return {
    hasCoverage: true,
    matches,
    groundedRulesCount: scopeApplicableRules.length,
    checkedJurisdictions,
    checkedPlatforms,
    disclaimer:
      "Grounded suggestions are based exclusively on currently active, verified policy versions. All suggestions require human review by Clyntique TEAM compliance reviewers.",
  };
}
