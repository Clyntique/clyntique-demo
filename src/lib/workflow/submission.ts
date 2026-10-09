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
};

export type SubmitGap = "FILE" | "MARKET" | "PLATFORM";

export const SUBMIT_GAP_MESSAGE: Record<SubmitGap, string> = {
  FILE: "Upload the creative file.",
  MARKET: "Choose at least one target market.",
  PLATFORM: "Choose at least one advertising platform.",
};

export function submitGaps(c: SubmissionContents): SubmitGap[] {
  const gaps: SubmitGap[] = [];
  if (c.versionCount < 1) gaps.push("FILE");
  if (c.marketCount < 1) gaps.push("MARKET");
  if (c.platformCount < 1) gaps.push("PLATFORM");
  return gaps;
}
