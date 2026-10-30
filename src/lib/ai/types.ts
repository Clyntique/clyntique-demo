import type { CoveragePair } from "./applicability";

export type AISeverity = "CRITICAL" | "MAJOR" | "MODERATE" | "MINOR";

export type AIRequiredAction = "REVISE_CONTENT" | "PROVIDE_EVIDENCE" | "CLARIFY" | "ACKNOWLEDGE";

export interface ExtractedVisualText {
  text: string;
  location?: string;
}

export interface DetectedClaim {
  claimText: string;
  category: "EFFICACY" | "SAFETY" | "INGREDIENT" | "PRICING" | "CREDENTIAL" | "DISCLOSURE" | "OTHER";
  context?: string;
}

export interface GroundedPolicyCitation {
  ruleId: string;
  /** The exact approved rule version cited (set by the server, from the database). */
  ruleVersionId?: string;
  ruleVersionNumber?: number;
  ruleCode: string;
  ruleTitle: string;
  authorityType: "REGULATION" | "PLATFORM_POLICY" | "INTERNAL_RISK";
  jurisdictionCode: string;
  platformCode?: string | null;
  sourceName?: string;
  sectionReference: string;
  officialUrl?: string;
  excerpt?: string;
}

export interface AISuggestedFinding {
  id: string;
  issue: string;
  severity: AISeverity;
  requiredAction: AIRequiredAction;
  explanation: string;
  actionDetails: string;
  confidenceScore: number; // 0.0 to 1.0
  policyCitation: GroundedPolicyCitation;
}

export interface AIAnalysisResult {
  status: "SUCCESS" | "INSUFFICIENT_COVERAGE" | "RATE_LIMITED" | "ERROR";
  modelUsed?: string;
  executionTimeMs?: number;
  extractedVisualText: ExtractedVisualText[];
  detectedClaims: DetectedClaim[];
  findings: AISuggestedFinding[];
  summary: string;
  error?: string;
  /** The approved rules this scan was checked against (empty when coverage is insufficient). */
  rulesChecked?: Array<{ code: string; title: string; versionNumber: number }>;
  /** Model suggestions dropped because they cited no applicable approved rule. */
  discardedSuggestions?: number;
  /** The persisted scan record (AIScanRun), set once the scan was written to history. */
  scanId?: string;
  scannedAt?: string;
  /** The industry the rules were selected for (decision D2), null when unknown. */
  industry?: string | null;
  /**
   * Coverage per market × platform. An uncovered pair shows "Insufficient
   * policy coverage — manual review required." even when other pairs ran.
   * Computed at scan time; not stored with the scan history.
   */
  coverage?: CoveragePair[];
}

export interface GroundedPolicyRuleContext {
  id: string;
  code: string;
  title: string;
  authorityType: string;
  jurisdictionCode: string;
  platformCode: string | null;
  category: string;
  summary: string;
  legalExplanation: string;
  remediationAction: string;
  applicabilityConditions: string[];
  exceptions: string[];
  /** Structured content (P0): how strict the rule is and what it restricts. */
  restrictionLevel: string | null;
  restrictedClaims: string[];
  substantiationRequirements: string[];
  sources: Array<{
    sourceName: string;
    sectionReference: string;
    officialUrl: string;
    excerpt: string;
  }>;
}

export interface CreativeAnalysisInput {
  creativeId: string;
  versionId?: string;
  versionNumber?: number;
  title: string;
  description?: string;
  context?: string;
  format: string;
  industry?: string | null;
  markets: Array<{ code: string; name: string }>;
  platforms: Array<{ code: string; name: string }>;
  imageBuffer?: Buffer;
  imageMimeType?: string;
  groundedRules: GroundedPolicyRuleContext[];
}

export interface AIComplianceProvider {
  name: string;
  /** Identifies the prompt the provider uses, recorded with each scan. */
  promptVersion?: string;
  analyzeCreative(input: CreativeAnalysisInput): Promise<AIAnalysisResult>;
}
