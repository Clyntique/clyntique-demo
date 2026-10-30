/*
 * What a client submission must contain before it can be submitted for
 * review. Drafts may be incomplete; these rules apply only at submit time.
 * Pure function, used by submitForReview (commands.ts).
 */

export type SubmissionContents = {
  versionCount: number;
  /** Active target markets selected (e.g. US, CA, AE). */
  marketCount: number;
  /** Active advertising platforms selected. */
  platformCount: number;
  /** Whether the client chose the industry (decision D2, P0 Oct 27). */
  hasIndustry: boolean;
};

export type SubmitGap = "FILE" | "MARKET" | "PLATFORM" | "INDUSTRY";

export const SUBMIT_GAP_MESSAGE: Record<SubmitGap, string> = {
  FILE: "Upload the creative file.",
  MARKET: "Choose at least one target market.",
  PLATFORM: "Choose at least one advertising platform.",
  INDUSTRY: "Choose the industry (Healthcare, Medical aesthetics or Other).",
};

/**
 * Industries a client declares on a submission (decision D2). It decides
 * which industry-specific policy rules the AI may use (ai/applicability.ts).
 */
export const INDUSTRY_LABEL: Record<"HEALTHCARE" | "MEDICAL_AESTHETICS" | "OTHER", string> = {
  HEALTHCARE: "Healthcare",
  MEDICAL_AESTHETICS: "Medical aesthetics",
  OTHER: "Other",
};

export function industryLabel(value: string | null | undefined): string | null {
  return value && value in INDUSTRY_LABEL ? INDUSTRY_LABEL[value as keyof typeof INDUSTRY_LABEL] : null;
}

export function submitGaps(c: SubmissionContents): SubmitGap[] {
  const gaps: SubmitGap[] = [];
  if (c.versionCount < 1) gaps.push("FILE");
  if (c.marketCount < 1) gaps.push("MARKET");
  if (c.platformCount < 1) gaps.push("PLATFORM");
  if (!c.hasIndustry) gaps.push("INDUSTRY");
  return gaps;
}
