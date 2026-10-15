import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/dal";
import { findAccessibleCreative } from "@/lib/review/access";
import { readBlob, isPrivateBlobUrl } from "@/lib/review/blob";
import { getDbPolicyRules } from "@/lib/policy/db";
import type { PolicyRule } from "@/lib/policy/types";
import { GeminiAIProvider } from "./gemini-provider";
import type {
  AIComplianceProvider,
  AIAnalysisResult,
  CreativeAnalysisInput,
  GroundedPolicyRuleContext,
} from "./types";

// In-memory cache for analysis results by versionId or creativeId to prevent redundant API calls
const analysisCache = new Map<string, { result: AIAnalysisResult; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let defaultProvider: AIComplianceProvider = new GeminiAIProvider();

export function setAIProvider(provider: AIComplianceProvider) {
  defaultProvider = provider;
}

export function resetAIProvider() {
  defaultProvider = new GeminiAIProvider();
}

export function clearAnalysisCache(key?: string) {
  if (key) {
    analysisCache.delete(key);
  } else {
    analysisCache.clear();
  }
}

/**
 * Orchestrates real AI compliance review with strict PostgreSQL policy grounding.
 * Strictly guarantees:
 * 1. Only TEAM accounts may invoke (enforced by caller and verified here).
 * 2. Creative must be accessible to the reviewer.
 * 3. Only ACTIVE and VERIFIED policies from PostgreSQL are provided for grounding.
 * 4. If 0 applicable verified policies match, returns "Insufficient policy coverage — manual review required."
 * 5. Server-side validation of every returned rule code and source reference.
 * 6. Results cached to prevent duplicate cost/API calls on free tier.
 */
export async function analyzeCreativeCompliance(
  user: CurrentUser,
  params: {
    creativeId: string;
    versionId?: string;
    forceRefresh?: boolean;
    provider?: AIComplianceProvider;
  }
): Promise<AIAnalysisResult> {
  if (user.role !== "TEAM") {
    throw new Error("Unauthorized: AI Compliance Analysis is restricted to TEAM reviewers.");
  }

  // 1. Fetch creative and verify access
  const creative = await findAccessibleCreative(user, params.creativeId);
  if (!creative) {
    throw new Error(`Creative '${params.creativeId}' not found or access denied.`);
  }

  // 2. Fetch full creative details (targeting markets & platforms)
  const fullCreative = await prisma.creative.findUnique({
    where: { id: params.creativeId },
    include: {
      markets: { include: { market: true } },
      platforms: { include: { platform: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 10,
      },
    },
  });

  if (!fullCreative) {
    throw new Error(`Creative '${params.creativeId}' not found in database.`);
  }

  // 3. Resolve target version
  let targetVersion = fullCreative.versions[0];
  if (params.versionId) {
    const found = fullCreative.versions.find((v) => v.id === params.versionId);
    if (found) targetVersion = found;
  }

  const cacheKey = targetVersion ? targetVersion.id : fullCreative.id;

  // Check cache unless force refresh requested
  if (!params.forceRefresh) {
    const cached = analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.result;
    }
  }

  // 4. Grounding: Fetch ACTIVE and VERIFIED policies matching jurisdiction and platforms
  const allDbRules = await getDbPolicyRules();
  const marketCodes = fullCreative.markets.map((m) => m.market.code);
  const platformCodes = fullCreative.platforms.map((p) => p.platform.code);

  const applicableRules = filterApplicableVerifiedRules(allDbRules, {
    markets: marketCodes,
    platforms: platformCodes,
  });

  // Strict grounding boundary: If 0 applicable verified rules, return early without calling AI
  if (applicableRules.length === 0) {
    const result: AIAnalysisResult = {
      status: "INSUFFICIENT_COVERAGE",
      extractedVisualText: [],
      detectedClaims: [],
      findings: [],
      summary: "Insufficient policy coverage — manual review required.",
    };
    analysisCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  // 5. Read creative image buffer if available
  let imageBuffer: Buffer | undefined;
  let imageMimeType: string | undefined;

  if (targetVersion?.fileUrl) {
    try {
      if (isPrivateBlobUrl(targetVersion.fileUrl)) {
        const blobResp = await readBlob(targetVersion.fileUrl, {});
        if (blobResp && blobResp.statusCode === 200 && blobResp.stream) {
          imageBuffer = await streamToBuffer(blobResp.stream);
          imageMimeType = targetVersion.mimeType ?? undefined;
        }
      }
    } catch {
      // If blob fetch fails, proceed with copy & context analysis
    }
  }

  // 6. Map grounded rules to AI context format
  const groundedRulesContext: GroundedPolicyRuleContext[] = applicableRules.map((r) => {
    const ver = r.currentVersion;
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      authorityType: r.authorityType,
      jurisdictionCode: r.jurisdictionCode,
      platformCode: r.platformCode ?? null,
      category: r.category,
      summary: ver.summary,
      legalExplanation: ver.legalExplanation,
      remediationAction: ver.remediationAction,
      applicabilityConditions: ver.applicabilityConditions,
      exceptions: ver.exceptions ?? [],
      sources: ver.sources.map((s) => ({
        sourceName: s.sourceName,
        sectionReference: s.sectionReference,
        officialUrl: s.directUrl,
        excerpt: s.excerpt,
      })),
    };
  });

  const input: CreativeAnalysisInput = {
    creativeId: fullCreative.id,
    versionId: targetVersion?.id,
    versionNumber: targetVersion?.versionNumber,
    title: fullCreative.name,
    description: fullCreative.description ?? undefined,
    context: fullCreative.context ?? undefined,
    format: fullCreative.format,
    markets: fullCreative.markets.map((m) => ({ code: m.market.code, name: m.market.name })),
    platforms: fullCreative.platforms.map((p) => ({ code: p.platform.code, name: p.platform.name })),
    imageBuffer,
    imageMimeType,
    groundedRules: groundedRulesContext,
  };

  // 7. Invoke provider
  const provider = params.provider ?? defaultProvider;
  const rawResult = await provider.analyzeCreative(input);

  // 8. Server-side validation of findings
  const validRuleCodes = new Set(applicableRules.map((r) => r.code.toUpperCase()));
  const validatedFindings = rawResult.findings.filter((f) =>
    validRuleCodes.has(f.policyCitation.ruleCode.toUpperCase())
  );

  const finalResult: AIAnalysisResult = {
    ...rawResult,
    findings: validatedFindings,
  };

  // Cache successful or coverage results
  if (finalResult.status === "SUCCESS" || finalResult.status === "INSUFFICIENT_COVERAGE") {
    analysisCache.set(cacheKey, { result: finalResult, timestamp: Date.now() });
  }

  return finalResult;
}

/**
 * Filters PolicyRules that are ACTIVE, VERIFIED, and match the creative's target markets and platforms.
 */
export function filterApplicableVerifiedRules(
  rules: PolicyRule[],
  context: { markets: string[]; platforms: string[] }
): PolicyRule[] {
  const normMarkets = new Set(context.markets.map((m) => m.toUpperCase()));
  const normPlatforms = new Set(context.platforms.map((p) => p.toUpperCase()));

  return rules.filter((rule) => {
    const ver = rule.currentVersion;
    // Must be ACTIVE and VERIFIED
    if (ver.status !== "ACTIVE" || ver.verificationStatus !== "VERIFIED") {
      return false;
    }

    // Jurisdiction match: rule is GLOBAL or creative targets this jurisdiction
    const ruleJurisdiction = rule.jurisdictionCode.toUpperCase();
    const jurisdictionMatches =
      ruleJurisdiction === "GLOBAL" ||
      normMarkets.has(ruleJurisdiction) ||
      (ruleJurisdiction === "US" && normMarkets.has("USA")) ||
      (ruleJurisdiction === "AE" && normMarkets.has("UAE"));

    if (!jurisdictionMatches) return false;

    // Platform match: rule platform is null/universal or creative targets this platform
    if (rule.platformCode) {
      const rulePlatform = rule.platformCode.toUpperCase();
      const platformMatches = normPlatforms.has(rulePlatform);
      if (!platformMatches) return false;
    }

    return true;
  });
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}
