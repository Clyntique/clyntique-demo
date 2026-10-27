// Clyntique Compliance Policy Library Domain Types
// Strictly separates government regulations, platform policies, and internal risk guidance.

export type PolicyAuthorityType = "REGULATION" | "PLATFORM_POLICY" | "INTERNAL_RISK";

export type PolicyVerificationStatus = "VERIFIED" | "UNVERIFIED" | "REJECTED" | "REQUIRES_REVIEW";

export type PolicyRuleStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "DEPRECATED";

export type PolicyCategory =
  | "EFFICACY_CLAIM"
  | "BEFORE_AFTER"
  | "DISCLOSURE"
  | "PRICING_PROMO"
  | "SUBSTANTIATION"
  | "RESTRICTED_PROCEDURES"
  | "MANDATORY_LABELING"
  | "TARGETING_RESTRICTION"
  | "PRESCRIPTION_MEDICINE"
  | "CREDENTIALS_LICENSING"
  | "TESTIMONIAL_ENDORSEMENT"
  | "PERSONAL_HEALTH_ATTRIBUTES";

export interface PolicySource {
  id: string;
  name: string;
  authorityName: string;
  authorityType: PolicyAuthorityType;
  jurisdictionCode: string; // "US", "AE", "GLOBAL", etc.
  officialUrl: string;
  publishedAt?: string;
  lastAuditedAt: string;
  verificationStatus: PolicyVerificationStatus;
}

export interface PolicySourceSection {
  id: string;
  sourceId: string;
  sourceName: string;
  authorityName: string;
  sectionReference: string; // e.g., "16 CFR § 255.5", "Cabinet Resolution No. 23 of 2020 Art. 4"
  sectionTitle: string;
  directUrl: string;
  excerpt: string;
  /** Verification status of the cited PolicySource (independent source check). */
  sourceVerificationStatus?: PolicyVerificationStatus;
}

export interface PolicyRuleVersion {
  id: string;
  ruleId: string;
  versionNumber: number;
  title: string;
  summary: string;
  legalExplanation: string;
  remediationAction: string;
  applicabilityConditions: string[];
  exceptions?: string[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: PolicyRuleStatus;
  verificationStatus: PolicyVerificationStatus;
  sources: PolicySourceSection[];
  changeSummary: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

export interface PolicyRule {
  id: string;
  code: string; // e.g., "US-FTC-DISC-01", "AE-MOH-LIC-01", "TIKTOK-HLT-01"
  title: string;
  authorityType: PolicyAuthorityType;
  jurisdictionCode: string; // "US", "AE", "GLOBAL"
  subJurisdiction?: string | null;
  platformCode?: string | null; // "TIKTOK", "META", "GOOGLE", null for platform-agnostic
  industry: string; // "HEALTHCARE", "AESTHETICS", "GENERAL"
  category: PolicyCategory;
  currentVersionNumber: number;
  currentVersion: PolicyRuleVersion;
  versions: PolicyRuleVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicyFilterCriteria {
  query?: string;
  authorityType?: PolicyAuthorityType | "ALL";
  jurisdiction?: string | "ALL";
  platform?: string | "ALL";
  status?: PolicyRuleStatus | "ALL";
  category?: PolicyCategory | "ALL";
}

export interface AIGroundingMatch {
  ruleId: string;
  ruleCode: string;
  ruleTitle: string;
  versionNumber: number;
  authorityType: PolicyAuthorityType;
  authorityName: string;
  sourceSection: string;
  sourceUrl: string;
  suggestedSeverity: "HIGH" | "MEDIUM" | "LOW" | "ADVISORY";
  issue: string;
  legalExplanation: string;
  remediationAction: string;
  confidenceScore: number;
  matchedConditions: string[];
}

export interface AIGroundingResult {
  hasCoverage: boolean;
  insufficientCoverageReason?: string;
  matches: AIGroundingMatch[];
  groundedRulesCount: number;
  checkedJurisdictions: string[];
  checkedPlatforms: string[];
  disclaimer: string;
}
