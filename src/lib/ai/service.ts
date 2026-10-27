import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/dal";
import { findAccessibleCreative } from "@/lib/review/access";
import { readBlob, isPrivateBlobUrl } from "@/lib/review/blob";
import { getDbPolicyRules } from "@/lib/policy/db";
import type { PolicyRule } from "@/lib/policy/types";
import { GeminiAIProvider } from "./gemini-provider";
import { INSUFFICIENT_POLICY_COVERAGE, coverageReport, filterApplicableVerifiedRules, policyIndustry } from "./applicability";
import type {
  AIComplianceProvider,
  AIAnalysisResult,
  AISuggestedFinding,
  CreativeAnalysisInput,
  GroundedPolicyRuleContext,
} from "./types";

export { INSUFFICIENT_POLICY_COVERAGE, filterApplicableVerifiedRules } from "./applicability";

// In-memory cache of successful analyses, keyed by the submitted version AND
// the exact rule versions it was checked against, so approving or retiring a
// policy never serves a stale result.
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

// Shown with every successful scan: AI output is a suggestion for a human
// reviewer, never a legal, government or platform clearance.
export const NO_SUGGESTIONS_SUMMARY =
  "No findings were suggested against the approved policies checked. This is not a compliance clearance: a TEAM reviewer must still review the creative and record the decision.";

/**
 * The submission as the team last received it: the latest submission round's
 * version and its snapshot of title, description and campaign context. A
 * client's unsubmitted edits or revisions are never sent to the AI (they are
 * private to the client until resubmitted).
 */
async function submittedSnapshot(creativeId: string, versionId?: string) {
  const rounds = await prisma.submissionRound.findMany({
    where: { creativeId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      cycleId: true,
      versionId: true,
      submittedName: true,
      submittedDescription: true,
      submittedContext: true,
      submittedIndustry: true,
      version: { select: { id: true, versionNumber: true, fileUrl: true, mimeType: true } },
    },
  });
  if (rounds.length === 0) return null;
  const round = versionId ? rounds.find((r) => r.versionId === versionId) : rounds[0];
  return round ?? null;
}

/**
 * Rules the AI may use for this submission (see applicability.ts), and the
 * coverage per market and platform. The industry is the one the client
 * declared with the submitted round (decision D2); older rounds without one
 * fall back to the creative's, then to POLICY_DEFAULT_INDUSTRY.
 */
async function applicableRulesFor(creativeId: string, submittedIndustry: string | null | undefined) {
  const creative = await prisma.creative.findUnique({
    where: { id: creativeId },
    select: {
      id: true,
      name: true,
      description: true,
      context: true,
      format: true,
      industry: true,
      markets: { select: { market: { select: { code: true, name: true } } } },
      platforms: { select: { platform: { select: { code: true, name: true } } } },
    },
  });
  if (!creative) return null;
  const markets = creative.markets.map((m) => m.market);
  const platforms = creative.platforms.map((p) => p.platform);
  const industry = submittedIndustry ?? creative.industry ?? policyIndustry();
  const context = {
    markets: markets.map((m) => m.code),
    marketNames: markets.map((m) => m.name),
    platforms: platforms.map((p) => p.code),
    industry,
  };
  const now = new Date();
  const library = await getDbPolicyRules();
  const rules = filterApplicableVerifiedRules(library, context, now);
  const coverage = coverageReport(library, context, now);
  return { creative, markets, platforms, rules, industry, coverage };
}

function emptyResult(status: AIAnalysisResult["status"], summary: string, extra: Partial<AIAnalysisResult> = {}): AIAnalysisResult {
  return { status, extractedVisualText: [], detectedClaims: [], findings: [], summary, ...extra };
}

type ScanContext = {
  creativeId: string;
  versionId: string;
  cycleId: string | null;
  roundId: string | null;
  initiatedById: string;
  rulesChecked: { ruleVersionId: string; ruleCode: string; ruleVersionNumber: number }[];
  promptVersion?: string;
};

/**
 * Persists one scan as it ran (Oct 19 sprint: AI scan history). Every outcome
 * is recorded, including insufficient coverage and provider failures, so the
 * review record and later impact analysis know exactly which approved rule
 * versions a submitted version was checked against. Only server-validated
 * suggestions are stored, never the raw provider output, and never a provider
 * error message. A failed write never hides the scan result from the
 * reviewer; the result then simply carries no scanId.
 */
async function recordScan(ctx: ScanContext, result: AIAnalysisResult): Promise<AIAnalysisResult> {
  try {
    const run = await prisma.aIScanRun.create({
      data: {
        creativeId: ctx.creativeId,
        versionId: ctx.versionId,
        cycleId: ctx.cycleId,
        roundId: ctx.roundId,
        initiatedById: ctx.initiatedById,
        status: result.status,
        modelUsed: result.modelUsed ?? null,
        promptVersion: ctx.promptVersion ?? null,
        summary: result.summary,
        errorName: result.error ?? null,
        // Plain JSON copies of the validated result (never the raw provider output).
        extractedVisualText: JSON.parse(JSON.stringify(result.extractedVisualText)),
        detectedClaims: JSON.parse(JSON.stringify(result.detectedClaims)),
        suggestedFindings: JSON.parse(JSON.stringify(result.findings)),
        discardedSuggestions: result.discardedSuggestions ?? 0,
        executionTimeMs: result.executionTimeMs ?? null,
        rulesChecked: { create: ctx.rulesChecked },
      },
      select: { id: true, createdAt: true },
    });
    return { ...result, scanId: run.id, scannedAt: run.createdAt.toISOString() };
  } catch (err) {
    console.error("AI scan history write failed", err instanceof Error ? err.name : "unknown error");
    return result;
  }
}

/**
 * Orchestrates AI compliance review with strict Policy Library grounding.
 * Guarantees:
 * 1. Only TEAM accounts may invoke it, and only on submissions they can see.
 * 2. Only the submitted version and its submitted details are analysed.
 * 3. Only ACTIVE, VERIFIED, in-effect rules with verified sources that match
 *    the submission's markets, platforms and industry are given to the model.
 * 4. With no such rule the model is never called and the result is
 *    "Insufficient policy coverage — manual review required."
 * 5. Every returned finding must cite one of those rules; its citation is
 *    rebuilt from the database (the model can't invent a section or link),
 *    and anything else is discarded and counted.
 * 6. A provider failure is an ERROR result, never an empty "no findings" one.
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

  // 1. Access: the same scope as the review pages (client drafts are invisible).
  const accessible = await findAccessibleCreative(user, params.creativeId);
  if (!accessible) {
    throw new Error("This submission is not available.");
  }
  if (accessible.workflow !== "SUBMISSION_REVIEW") {
    throw new Error("AI scans are only available for compliance review submissions.");
  }

  // 2. What the team actually received.
  const snapshot = await submittedSnapshot(accessible.id, params.versionId);
  if (!snapshot) {
    throw new Error(params.versionId ? "That version was never submitted for review." : "This submission hasn't been submitted for review yet.");
  }

  // 3. Grounding: only applicable, approved, verified rules.
  const scope = await applicableRulesFor(accessible.id, snapshot.submittedIndustry);
  if (!scope) throw new Error("This submission is not available.");
  const { creative, markets, platforms, rules: applicableRules, industry, coverage } = scope;
  const provider = params.provider ?? defaultProvider;
  const scanContext: ScanContext = {
    creativeId: accessible.id,
    versionId: snapshot.version.id,
    cycleId: snapshot.cycleId,
    roundId: snapshot.id,
    initiatedById: user.id,
    rulesChecked: applicableRules.map((r) => ({ ruleVersionId: r.currentVersion.id, ruleCode: r.code, ruleVersionNumber: r.currentVersion.versionNumber })),
    promptVersion: provider.promptVersion,
  };

  if (applicableRules.length === 0) {
    // Never cached: a policy approved a minute later must be used at once.
    // Recorded, so the review record shows that no verified rule covered this.
    return recordScan(scanContext, emptyResult("INSUFFICIENT_COVERAGE", INSUFFICIENT_POLICY_COVERAGE, { rulesChecked: [], industry, coverage }));
  }

  const rulesChecked = applicableRules.map((r) => ({
    code: r.code,
    title: r.title,
    versionNumber: r.currentVersion.versionNumber,
  }));
  const cacheKey = `${snapshot.version.id}:${applicableRules.map((r) => r.currentVersion.id).sort().join(",")}`;
  if (!params.forceRefresh) {
    const cached = analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.result, industry, coverage };
    }
  }

  // 4. The submitted file (images only; the model can't read video here).
  let imageBuffer: Buffer | undefined;
  let imageMimeType: string | undefined;
  const file = snapshot.version;
  if (file.fileUrl && file.mimeType?.startsWith("image/") && isPrivateBlobUrl(file.fileUrl)) {
    try {
      const blobResp = await readBlob(file.fileUrl, {});
      if (blobResp && blobResp.statusCode === 200 && blobResp.stream) {
        imageBuffer = await streamToBuffer(blobResp.stream);
        imageMimeType = file.mimeType;
      }
    } catch {
      // Without the image the scan still covers the submitted text.
    }
  }

  // 5. Rule context for the model.
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
      restrictionLevel: ver.restrictionLevel ?? null,
      restrictedClaims: ver.restrictedClaims ?? [],
      substantiationRequirements: ver.substantiationRequirements ?? [],
      sources: ver.sources.map((s) => ({
        sourceName: s.sourceName,
        sectionReference: s.sectionReference,
        officialUrl: s.directUrl,
        excerpt: s.excerpt,
      })),
    };
  });

  const input: CreativeAnalysisInput = {
    creativeId: creative.id,
    versionId: file.id,
    versionNumber: file.versionNumber,
    title: snapshot.submittedName ?? creative.name,
    description: (snapshot.submittedName !== null ? snapshot.submittedDescription : creative.description) ?? undefined,
    context: (snapshot.submittedName !== null ? snapshot.submittedContext : creative.context) ?? undefined,
    format: creative.format,
    industry,
    markets,
    platforms,
    imageBuffer,
    imageMimeType,
    groundedRules: groundedRulesContext,
  };

  // 6. Invoke the provider. Any failure is reported as such (and recorded).
  let rawResult: AIAnalysisResult;
  try {
    rawResult = await provider.analyzeCreative(input);
  } catch (err) {
    console.error("AI scan failed", err instanceof Error ? err.name : "unknown error");
    return recordScan(
      scanContext,
      emptyResult("ERROR", "The AI scan failed. No findings were produced; review this creative manually.", {
        error: err instanceof Error ? err.name : "Provider error", // never the provider's message: it can echo request details
        rulesChecked,
        industry,
        coverage,
      }),
    );
  }

  if (rawResult.status !== "SUCCESS") {
    // ERROR / RATE_LIMITED / INSUFFICIENT_COVERAGE from the provider: never
    // pass through findings from an incomplete scan.
    const summary =
      rawResult.status === "INSUFFICIENT_COVERAGE" ? INSUFFICIENT_POLICY_COVERAGE : rawResult.summary || "The AI scan did not complete.";
    return recordScan(scanContext, emptyResult(rawResult.status, summary, { error: rawResult.error, modelUsed: rawResult.modelUsed, rulesChecked, industry, coverage }));
  }

  // 7. Server-side validation: every finding must cite an applicable rule, and
  // its citation is rebuilt from the Policy Library record.
  const byCode = new Map(applicableRules.map((r) => [r.code.toUpperCase(), r]));
  const validatedFindings: AISuggestedFinding[] = [];
  let discarded = 0;
  for (const f of rawResult.findings ?? []) {
    const rule = byCode.get(String(f.policyCitation?.ruleCode ?? "").trim().toUpperCase());
    if (!rule) {
      discarded++;
      continue;
    }
    validatedFindings.push({ ...f, policyCitation: citationFor(rule) });
  }

  const finalResult: AIAnalysisResult = {
    ...rawResult,
    findings: validatedFindings,
    summary: validatedFindings.length === 0 ? NO_SUGGESTIONS_SUMMARY : rawResult.summary,
    rulesChecked,
    discardedSuggestions: discarded,
    industry,
    coverage,
  };

  const recorded = await recordScan(scanContext, finalResult);
  analysisCache.set(cacheKey, { result: recorded, timestamp: Date.now() });
  return recorded;
}

/** The citation for a rule's current version, taken only from the database. */
export function citationFor(rule: PolicyRule): AISuggestedFinding["policyCitation"] {
  const primary = rule.currentVersion.sources[0];
  return {
    ruleId: rule.id,
    ruleVersionId: rule.currentVersion.id,
    ruleVersionNumber: rule.currentVersion.versionNumber,
    ruleCode: rule.code,
    ruleTitle: rule.title,
    authorityType: rule.authorityType,
    jurisdictionCode: rule.jurisdictionCode,
    platformCode: rule.platformCode ?? null,
    sourceName: primary?.sourceName,
    sectionReference: primary?.sectionReference ?? "",
    officialUrl: primary?.directUrl,
    excerpt: primary?.excerpt || undefined,
  };
}

/**
 * Re-checks, at the moment a reviewer accepts an AI suggestion, that the cited
 * rule is still active, verified and applicable to this submission, and
 * returns it. Never trusts the citation sent back by the browser.
 */
export async function applicableRuleForAcceptance(user: CurrentUser, creativeId: string, ruleCode: string): Promise<PolicyRule | null> {
  if (user.role !== "TEAM") return null;
  const accessible = await findAccessibleCreative(user, creativeId);
  if (!accessible || accessible.workflow !== "SUBMISSION_REVIEW") return null;
  const snapshot = await submittedSnapshot(accessible.id);
  if (!snapshot) return null;
  const scope = await applicableRulesFor(accessible.id, snapshot.submittedIndustry);
  if (!scope) return null;
  const code = String(ruleCode ?? "").trim().toUpperCase();
  return scope.rules.find((r) => r.code.toUpperCase() === code) ?? null;
}

/**
 * Policy rules a TEAM reviewer may cite on a finding or on Clyntique evidence
 * for this submission: the same verified, approved and applicable set the AI
 * uses (markets, platforms and the submitted industry). Empty for anyone else.
 */
export async function citableRulesForSubmission(user: CurrentUser, creativeId: string): Promise<PolicyRule[]> {
  if (user.role !== "TEAM") return [];
  const accessible = await findAccessibleCreative(user, creativeId);
  if (!accessible || accessible.workflow !== "SUBMISSION_REVIEW") return [];
  const snapshot = await submittedSnapshot(accessible.id);
  if (!snapshot) return [];
  const scope = await applicableRulesFor(accessible.id, snapshot.submittedIndustry);
  return scope?.rules ?? [];
}

/** The citable rule whose CURRENT approved version is this id, or null (never trusts the browser). */
export async function citableRuleVersion(user: CurrentUser, creativeId: string, ruleVersionId: string): Promise<PolicyRule | null> {
  if (!ruleVersionId) return null;
  const rules = await citableRulesForSubmission(user, creativeId);
  return rules.find((r) => r.currentVersion.id === ruleVersionId) ?? null;
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
