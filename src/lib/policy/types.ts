// Clyntique Compliance Policy Library Domain Types
// Strictly separates government regulations, platform policies, and internal risk guidance.

export type PolicyAuthorityType = "REGULATION" | "PLATFORM_POLICY" | "INTERNAL_RISK";

export type PolicyVerificationStatus = "VERIFIED" | "UNVERIFIED" | "REJECTED" | "REQUIRES_REVIEW";

export type PolicyRuleStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "DEPRECATED";

export type PolicyRestrictionLevel = "PROHIBITED" | "RESTRICTED" | "CONDITIONAL" | "DISCLOSURE_REQUIRED";

export type PolicySourceKind =
  | "PLATFORM_POLICY_PAGE"
  | "PLATFORM_HELP_ARTICLE"
  | "STATUTE_OR_REGULATION"
  | "REGULATOR_GUIDANCE"
  | "OTHER_OFFICIAL";

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
  // P0 (Oct 27): provenance and human verification.
  sourceKind?: PolicySourceKind | null;
  accessNote?: string | null;
  verifiedById?: string | null;
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  verificationNote?: string | null;
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
  /** Official page of the cited source (PolicySource.officialUrl). */
  sourceOfficialUrl?: string;
  /** "Last updated" date the source page shows, only if it shows one. */
  sourceUpdatedAt?: string | null;
  /** When Clyntique read the source for this version. */
  retrievedAt?: string | null;
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
  // P0 (Oct 27): structured content and human verification.
  restrictionLevel?: PolicyRestrictionLevel | null;
  restrictedClaims?: string[];
  substantiationRequirements?: string[];
  /** Date the source says the policy took effect; null = not stated. */
  officialEffectiveDate?: string | null;
  verifiedById?: string | null;
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  verificationNote?: string | null;
  reviewNote?: string | null;
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
