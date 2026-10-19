import type { ExternalDestinationType, ExternalOutcomeKind, ExternalRecordBasis } from "@/generated/prisma/enums";

/*
 * External submission status (Oct 19 sprint). Pure: derived from the
 * append-only ExternalSubmission / ExternalOutcome records, so the same label
 * appears on the review record, the submission page and the overview.
 *
 * An outcome is never a Clyntique decision. "Approved" is always qualified by
 * its basis: reported by the client, or the document was checked by the team.
 */

export type ExternalStatusKey =
  | "NOT_SUBMITTED"
  | "AWAITING_OUTCOME"
  | "APPROVED_REPORTED"
  | "APPROVED_VERIFIED"
  | "CHANGES_REQUESTED"
  | "REJECTED";

export const EXTERNAL_STATUS_LABEL: Record<ExternalStatusKey, string> = {
  NOT_SUBMITTED: "Not submitted",
  AWAITING_OUTCOME: "Submitted externally · awaiting outcome",
  APPROVED_REPORTED: "Approved by external authority/platform (reported, not independently verified)",
  APPROVED_VERIFIED: "Approved by external authority/platform (document checked by Clyntique team)",
  CHANGES_REQUESTED: "Changes requested externally",
  REJECTED: "Rejected externally",
};

export type OutcomeFact = { kind: ExternalOutcomeKind; basis: ExternalRecordBasis; outcomeOn: Date; createdAt: Date };
export type SubmissionFact = { destinationType: ExternalDestinationType; outcomes: OutcomeFact[] };

/** The latest recorded outcome: by outcome date, then by when it was recorded. */
export function latestOutcome<T extends OutcomeFact>(outcomes: T[]): T | null {
  let latest: T | null = null;
  for (const o of outcomes) {
    if (!latest) latest = o;
    else if (o.outcomeOn > latest.outcomeOn || (o.outcomeOn.getTime() === latest.outcomeOn.getTime() && o.createdAt > latest.createdAt)) latest = o;
  }
  return latest;
}

export function submissionStatus(submission: SubmissionFact): ExternalStatusKey {
  const latest = latestOutcome(submission.outcomes);
  if (!latest) return "AWAITING_OUTCOME";
  if (latest.kind === "REJECTED") return "REJECTED";
  if (latest.kind === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  return latest.basis === "TEAM_VERIFIED" ? "APPROVED_VERIFIED" : "APPROVED_REPORTED";
}

/**
 * One line for the whole creative: the most demanding state wins (a rejection
 * anywhere outranks an approval elsewhere), so nobody reads "approved" while a
 * regulator has said no.
 */
export function overallExternalStatus(submissions: SubmissionFact[]): ExternalStatusKey {
  if (submissions.length === 0) return "NOT_SUBMITTED";
  const order: ExternalStatusKey[] = ["REJECTED", "CHANGES_REQUESTED", "AWAITING_OUTCOME", "APPROVED_REPORTED", "APPROVED_VERIFIED"];
  const statuses = submissions.map(submissionStatus);
  return order.find((s) => statuses.includes(s)) ?? "NOT_SUBMITTED";
}

/** Platform and regulator outcomes are different things; never merge them into one "approved". */
export function statusByDestination(submissions: SubmissionFact[]): Record<ExternalDestinationType, ExternalStatusKey> {
  return {
    AD_PLATFORM: overallExternalStatus(submissions.filter((s) => s.destinationType === "AD_PLATFORM")),
    REGULATOR: overallExternalStatus(submissions.filter((s) => s.destinationType === "REGULATOR")),
  };
}
