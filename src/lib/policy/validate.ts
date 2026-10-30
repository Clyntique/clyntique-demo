import type { PolicyAuthorityType, PolicyCategory, PolicyRestrictionLevel, PolicySourceKind } from "./types";

/*
 * Input rules for the Policy Library (P0, Oct 27). Pure functions: the server
 * actions call these before anything is written, and the editor reuses the
 * constants to fail fast. Nothing here trusts the browser.
 *
 * Content rules from the approved plan (decision D8):
 * - summaries are Clyntique's own words; a citation may carry a SHORT
 *   quotation only (MAX_QUOTATION characters), never the source text;
 * - official URLs are https; a host outside the known official domains is
 *   accepted but flagged, so a reviewer looks twice;
 * - dates the source doesn't state stay empty: nothing defaults to "today".
 */

export const RULE_INDUSTRIES = ["GENERAL", "HEALTHCARE", "MEDICAL_AESTHETICS"] as const;
export type RuleIndustry = (typeof RULE_INDUSTRIES)[number];

export const AUTHORITY_TYPES: readonly PolicyAuthorityType[] = ["REGULATION", "PLATFORM_POLICY", "INTERNAL_RISK"];

export const POLICY_CATEGORIES: readonly PolicyCategory[] = [
  "EFFICACY_CLAIM",
  "BEFORE_AFTER",
  "DISCLOSURE",
  "PRICING_PROMO",
  "SUBSTANTIATION",
  "RESTRICTED_PROCEDURES",
  "MANDATORY_LABELING",
  "TARGETING_RESTRICTION",
  "PRESCRIPTION_MEDICINE",
  "CREDENTIALS_LICENSING",
  "TESTIMONIAL_ENDORSEMENT",
  "PERSONAL_HEALTH_ATTRIBUTES",
];

export const RESTRICTION_LEVELS: readonly PolicyRestrictionLevel[] = ["PROHIBITED", "RESTRICTED", "CONDITIONAL", "DISCLOSURE_REQUIRED"];

export const SOURCE_KINDS: readonly PolicySourceKind[] = [
  "PLATFORM_POLICY_PAGE",
  "PLATFORM_HELP_ARTICLE",
  "STATUTE_OR_REGULATION",
  "REGULATOR_GUIDANCE",
  "OTHER_OFFICIAL",
];

/** Hosts of the official publishers in the P0 scope (and their subdomains). */
export const OFFICIAL_DOMAINS = [
  "facebook.com",
  "meta.com",
  "instagram.com",
  "google.com",
  "tiktok.com",
  "ftc.gov",
  "fda.gov",
  "ecfr.gov",
  "govinfo.gov",
  "federalregister.gov",
  "mohap.gov.ae",
  "dha.gov.ae",
  "doh.gov.ae",
  "u.ae",
  "uaemc.gov.ae",
] as const;

export const LIMITS = {
  code: 40,
  title: 160,
  name: 200,
  summary: 2000,
  text: 4000,
  listItem: 300,
  listItems: 20,
  quotation: 300,
  section: 200,
  note: 1000,
  citations: 8,
} as const;

export const MAX_QUOTATION = LIMITS.quotation;

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Check<T> => ({ ok: true, value });
const bad = <T = never>(error: string): Check<T> => ({ ok: false, error });

function text(value: unknown, max: number): string | null {
  const s = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  return s.length > max ? null : s;
}

/** An https URL, normalised, or an error. */
export function officialUrl(value: unknown, label = "Official URL"): Check<{ url: string; officialDomain: boolean }> {
  const raw = text(value, 2000);
  if (!raw) return bad(`${label} is required.`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return bad(`${label} must be a full web address starting with https://.`);
  }
  if (url.protocol !== "https:") return bad(`${label} must start with https://.`);
  if (url.username || url.password) return bad(`${label} must not contain a user name or password.`);
  const host = url.hostname.toLowerCase();
  const officialDomain = OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  return ok({ url: url.toString(), officialDomain });
}

/**
 * A date the source states, or null when it states none. Accepts YYYY-MM-DD
 * (or a full ISO timestamp); anything else is an error, never "today".
 */
export function optionalDate(value: unknown, label: string): Check<Date | null> {
  const raw = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!raw) return ok(null);
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(raw)) return bad(`${label} must be a date (YYYY-MM-DD).`);
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
  if (Number.isNaN(d.getTime())) return bad(`${label} is not a valid date.`);
  if (raw.length === 10 && d.toISOString().slice(0, 10) !== raw) return bad(`${label} is not a valid date.`);
  return ok(d);
}

/** A list of short items in our own words: trimmed, de-duplicated, bounded. */
export function shortList(value: unknown, label: string): Check<string[]> {
  const items = (Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [])
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  const unique = [...new Set(items)];
  if (unique.length > LIMITS.listItems) return bad(`${label}: at most ${LIMITS.listItems} items.`);
  const tooLong = unique.find((v) => v.length > LIMITS.listItem);
  if (tooLong) return bad(`${label}: keep each item under ${LIMITS.listItem} characters.`);
  return ok(unique);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): Check<T> {
  const v = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (allowed as readonly string[]).includes(v) ? ok(v as T) : bad(`Choose a valid ${label}.`);
}

function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): Check<T | null> {
  if (value == null || value === "") return ok(null);
  return oneOf(value, allowed, label);
}

// ---------------------------------------------------------------------------
// Sources

export type SourceInput = {
  name: unknown;
  authorityName: unknown;
  authorityType: unknown;
  jurisdictionCode: unknown;
  officialUrl: unknown;
  sourceKind?: unknown;
  publishedAt?: unknown;
  accessNote?: unknown;
};

export type ValidSource = {
  name: string;
  authorityName: string;
  authorityType: PolicyAuthorityType;
  jurisdictionCode: string;
  officialUrl: string;
  sourceKind: PolicySourceKind | null;
  publishedAt: Date | null;
  accessNote: string | null;
  warnings: string[];
};

/** `jurisdictions` = valid market codes (Market.code); GLOBAL is always allowed. */
export function validateSource(input: SourceInput, jurisdictions: readonly string[]): Check<ValidSource> {
  const name = text(input.name, LIMITS.name);
  const authorityName = text(input.authorityName, LIMITS.name);
  if (!name || name.length < 3) return bad("Give the source a name (3–200 characters).");
  if (!authorityName || authorityName.length < 2) return bad("Name the publisher of the source (2–200 characters).");
  const authorityType = oneOf(input.authorityType, AUTHORITY_TYPES, "authority type");
  if (!authorityType.ok) return authorityType;
  const jurisdiction = jurisdictionCode(input.jurisdictionCode, jurisdictions);
  if (!jurisdiction.ok) return jurisdiction;
  const url = officialUrl(input.officialUrl);
  if (!url.ok) return url;
  const kind = optionalOneOf(input.sourceKind, SOURCE_KINDS, "source kind");
  if (!kind.ok) return kind;
  const published = optionalDate(input.publishedAt, "Publication date");
  if (!published.ok) return published;
  const accessNote = text(input.accessNote, LIMITS.note);
  if (accessNote === null) return bad(`Keep the access note under ${LIMITS.note} characters.`);
  return ok({
    name,
    authorityName,
    authorityType: authorityType.value,
    jurisdictionCode: jurisdiction.value,
    officialUrl: url.value.url,
    sourceKind: kind.value,
    publishedAt: published.value,
    accessNote: accessNote || null,
    warnings: url.value.officialDomain ? [] : ["The URL is not on a known official domain. Check that it is the publisher's own page."],
  });
}

export function jurisdictionCode(value: unknown, jurisdictions: readonly string[]): Check<string> {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (code === "GLOBAL" || jurisdictions.map((j) => j.toUpperCase()).includes(code)) return ok(code);
  return bad("Choose a market from the list, or GLOBAL.");
}

// ---------------------------------------------------------------------------
// Rules and versions

export type CitationInput = {
  sourceId: unknown;
  sectionReference: unknown;
  sectionTitle: unknown;
  directUrl: unknown;
  excerpt?: unknown;
  sourceUpdatedAt?: unknown;
  retrievedAt?: unknown;
};

export type ValidCitation = {
  sourceId: string;
  sectionReference: string;
  sectionTitle: string;
  directUrl: string;
  excerpt: string;
  sourceUpdatedAt: Date | null;
  retrievedAt: Date | null;
};

export function validateCitations(value: unknown, { required }: { required: boolean }): Check<{ citations: ValidCitation[]; warnings: string[] }> {
  const list = Array.isArray(value) ? (value as CitationInput[]) : [];
  if (required && list.length === 0) return bad("Cite at least one official source section.");
  if (list.length > LIMITS.citations) return bad(`At most ${LIMITS.citations} citations per version.`);
  const citations: ValidCitation[] = [];
  const warnings: string[] = [];
  for (const [i, c] of list.entries()) {
    const n = `Citation ${i + 1}`;
    const sourceId = text(c?.sourceId, 100);
    if (!sourceId) return bad(`${n}: choose the source.`);
    const sectionReference = text(c?.sectionReference, LIMITS.section);
    if (!sectionReference) return bad(`${n}: give the section or heading (up to ${LIMITS.section} characters).`);
    const sectionTitle = text(c?.sectionTitle, LIMITS.section);
    if (sectionTitle === null) return bad(`${n}: keep the section title under ${LIMITS.section} characters.`);
    const url = officialUrl(c?.directUrl, `${n} link`);
    if (!url.ok) return url;
    if (!url.value.officialDomain) warnings.push(`${n}: the link is not on a known official domain.`);
    const excerpt = text(c?.excerpt, MAX_QUOTATION);
    if (excerpt === null) return bad(`${n}: a quotation can be at most ${MAX_QUOTATION} characters. Summarise in your own words instead.`);
    const updated = optionalDate(c?.sourceUpdatedAt, `${n} source update date`);
    if (!updated.ok) return updated;
    const retrieved = optionalDate(c?.retrievedAt, `${n} date read`);
    if (!retrieved.ok) return retrieved;
    if (retrieved.value && retrieved.value.getTime() > Date.now() + 24 * 3600 * 1000) return bad(`${n}: the date read can't be in the future.`);
    citations.push({
      sourceId,
      sectionReference,
      sectionTitle: sectionTitle || sectionReference,
      directUrl: url.value.url,
      excerpt,
      sourceUpdatedAt: updated.value,
      retrievedAt: retrieved.value,
    });
  }
  return ok({ citations, warnings });
}

export type VersionContentInput = {
  title: unknown;
  summary: unknown;
  legalExplanation: unknown;
  remediationAction: unknown;
  applicabilityConditions?: unknown;
  exceptions?: unknown;
  restrictionLevel?: unknown;
  restrictedClaims?: unknown;
  substantiationRequirements?: unknown;
  officialEffectiveDate?: unknown;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
  reviewNote?: unknown;
};

export type ValidVersionContent = {
  title: string;
  summary: string;
  legalExplanation: string;
  remediationAction: string;
  applicabilityConditions: string[];
  exceptions: string[];
  restrictionLevel: PolicyRestrictionLevel | null;
  restrictedClaims: string[];
  substantiationRequirements: string[];
  officialEffectiveDate: Date | null;
  /** Clyntique's own "in use from" (null = from approval). */
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  reviewNote: string | null;
};

export function validateVersionContent(input: VersionContentInput): Check<ValidVersionContent> {
  const title = text(input.title, LIMITS.title);
  if (!title || title.length < 3) return bad(`Give the rule a title (3–${LIMITS.title} characters).`);
  const summary = text(input.summary, LIMITS.summary);
  if (!summary || summary.length < 10) return bad("Write the operational summary in your own words (at least 10 characters).");
  const legalExplanation = text(input.legalExplanation, LIMITS.text);
  if (legalExplanation === null) return bad(`Keep the explanation under ${LIMITS.text} characters.`);
  const remediationAction = text(input.remediationAction, LIMITS.text);
  if (remediationAction === null) return bad(`Keep the remediation under ${LIMITS.text} characters.`);
  const conditions = shortList(input.applicabilityConditions, "Applies when");
  if (!conditions.ok) return conditions;
  const exceptions = shortList(input.exceptions, "Exceptions");
  if (!exceptions.ok) return exceptions;
  const level = optionalOneOf(input.restrictionLevel, RESTRICTION_LEVELS, "restriction level");
  if (!level.ok) return level;
  const claims = shortList(input.restrictedClaims, "Restricted or prohibited claims");
  if (!claims.ok) return claims;
  const substantiation = shortList(input.substantiationRequirements, "Evidence requirements");
  if (!substantiation.ok) return substantiation;
  const official = optionalDate(input.officialEffectiveDate, "Official effective date");
  if (!official.ok) return official;
  const from = optionalDate(input.effectiveFrom, "In use from");
  if (!from.ok) return from;
  const to = optionalDate(input.effectiveTo, "In use until");
  if (!to.ok) return to;
  if (from.value && to.value && to.value <= from.value) return bad("'In use until' must be after 'In use from'.");
  const reviewNote = text(input.reviewNote, LIMITS.note);
  if (reviewNote === null) return bad(`Keep the review note under ${LIMITS.note} characters.`);
  return ok({
    title,
    summary,
    legalExplanation: legalExplanation ?? "",
    remediationAction: remediationAction ?? "",
    applicabilityConditions: conditions.value,
    exceptions: exceptions.value,
    restrictionLevel: level.value,
    restrictedClaims: claims.value,
    substantiationRequirements: substantiation.value,
    officialEffectiveDate: official.value,
    effectiveFrom: from.value,
    effectiveTo: to.value,
    reviewNote: reviewNote || null,
  });
}

export type RuleScopeInput = {
  authorityType: unknown;
  jurisdictionCode: unknown;
  subJurisdiction?: unknown;
  platformCode?: unknown;
  industry: unknown;
  category: unknown;
};

export type ValidRuleScope = {
  authorityType: PolicyAuthorityType;
  jurisdictionCode: string;
  subJurisdiction: string | null;
  platformCode: string | null;
  industry: RuleIndustry;
  category: PolicyCategory;
};

/** `platforms` = valid AdPlatform codes; an empty platform means platform-agnostic. */
export function validateRuleScope(input: RuleScopeInput, ref: { jurisdictions: readonly string[]; platforms: readonly string[] }): Check<ValidRuleScope> {
  const authorityType = oneOf(input.authorityType, AUTHORITY_TYPES, "authority type");
  if (!authorityType.ok) return authorityType;
  const jurisdiction = jurisdictionCode(input.jurisdictionCode, ref.jurisdictions);
  if (!jurisdiction.ok) return jurisdiction;
  const sub = text(input.subJurisdiction, 80);
  if (sub === null) return bad("Keep the sub-jurisdiction under 80 characters.");
  const platformRaw = typeof input.platformCode === "string" ? input.platformCode.trim().toUpperCase() : "";
  if (platformRaw && !ref.platforms.map((p) => p.toUpperCase()).includes(platformRaw)) return bad("Choose a platform from the list, or none for platform-agnostic rules.");
  if (authorityType.value === "PLATFORM_POLICY" && !platformRaw) return bad("A platform policy must name its platform.");
  const industry = oneOf(input.industry, RULE_INDUSTRIES, "industry");
  if (!industry.ok) return industry;
  const category = oneOf(input.category, POLICY_CATEGORIES, "policy category");
  if (!category.ok) return category;
  return ok({
    authorityType: authorityType.value,
    jurisdictionCode: jurisdiction.value,
    subJurisdiction: sub || null,
    platformCode: platformRaw || null,
    industry: industry.value,
    category: category.value,
  });
}

export function ruleCode(value: unknown): Check<string> {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)) return bad("Rule codes use letters, digits and dashes (3–40 characters), e.g. META-HLT-01.");
  return ok(code);
}
