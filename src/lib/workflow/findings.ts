import type { FindingAction, FindingSeverity, FindingStatus, ReviewOutcome, Role } from "@/generated/prisma/enums";

/*
 * Rules for review findings: status transitions, who can see what, when a
 * client may resubmit, and which final outcomes a reviewer may record.
 * Pure functions. Rules marked (B3) follow plan §16.3 and are working
 * choices pending product confirmation of the blocking rules.
 */

// ---------------------------------------------------------------------------
// Finding status transitions

export type FindingMove = "PUBLISH" | "DISMISS" | "RESPOND" | "RESOLVE" | "REOPEN";

const FINDING_MOVES: Record<FindingMove, { from: readonly FindingStatus[]; to: FindingStatus; role: Role; noteRequired: boolean }> = {
  PUBLISH: { from: ["DRAFT"], to: "OPEN", role: "TEAM", noteRequired: false },
  DISMISS: { from: ["DRAFT", "OPEN", "RESPONDED"], to: "DISMISSED", role: "TEAM", noteRequired: true },
  RESPOND: { from: ["OPEN", "RESPONDED"], to: "RESPONDED", role: "CLIENT", noteRequired: true },
  RESOLVE: { from: ["RESPONDED"], to: "RESOLVED", role: "TEAM", noteRequired: true },
  REOPEN: { from: ["RESPONDED"], to: "OPEN", role: "TEAM", noteRequired: true },
};

export function moveFinding(
  move: FindingMove,
  current: FindingStatus,
  role: Role,
  note?: string | null,
): { ok: true; to: FindingStatus } | { ok: false; error: string } {
  const m = FINDING_MOVES[move];
  if (m.role !== role) return { ok: false, error: "This action isn't available to your role." };
  if (!m.from.includes(current)) return { ok: false, error: "This finding isn't in a state that allows that." };
  if (m.noteRequired && !note?.trim()) return { ok: false, error: "Add a short note explaining this." };
  return { ok: true, to: m.to };
}

// ---------------------------------------------------------------------------
// Visibility

/** A client sees a finding only once it has been published (DRAFT and never-published dismissals stay internal). */
export function findingVisibleTo(role: Role, finding: { status: FindingStatus; publishedAt: Date | null }): boolean {
  if (role === "TEAM") return true;
  return finding.status !== "DRAFT" && finding.publishedAt !== null;
}

/** A client sees SHARED evidence only; INTERNAL evidence is team-only. Withdrawn items stay visible as history. */
export function evidenceVisibleTo(role: Role, evidence: { visibility: "SHARED" | "INTERNAL" }): boolean {
  return role === "TEAM" || evidence.visibility === "SHARED";
}

// ---------------------------------------------------------------------------
// Resubmission readiness (B3)

export type FindingForReadiness = {
  id: string;
  status: FindingStatus;
  severity: FindingSeverity;
  requiredAction: FindingAction;
  /** Version number the finding was identified on (null: not tied to a version). */
  identifiedInVersion: number | null;
  /** Client responses since the finding was published. */
  clientResponses: number;
  /** Active (not withdrawn) evidence linked to the finding that the client can see. */
  linkedEvidence: number;
};

export type Unmet = { findingId: string; missing: "RESPONSE" | "NEW_VERSION" | "EVIDENCE" };

/**
 * Every open, non-advisory finding must meet its required action before the
 * client can resubmit:
 * - REVISE_CONTENT: a response and a newer version than the one it was found on
 * - PROVIDE_EVIDENCE: a response and at least one linked evidence item
 * - CLARIFY / ACKNOWLEDGE: a response
 * Meeting the action never resolves a finding; only the reviewer does that.
 */
export function resubmissionGaps(findings: FindingForReadiness[], latestVersion: number): Unmet[] {
  const gaps: Unmet[] = [];
  for (const f of findings) {
    if (f.status !== "OPEN" && f.status !== "RESPONDED") continue;
    if (f.severity === "ADVISORY") continue;
    if (f.clientResponses < 1) gaps.push({ findingId: f.id, missing: "RESPONSE" });
    if (f.requiredAction === "REVISE_CONTENT" && !(latestVersion > (f.identifiedInVersion ?? 0))) {
      gaps.push({ findingId: f.id, missing: "NEW_VERSION" });
    }
    if (f.requiredAction === "PROVIDE_EVIDENCE" && f.linkedEvidence < 1) gaps.push({ findingId: f.id, missing: "EVIDENCE" });
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Request changes and final outcomes

export type FindingForOutcome = { status: FindingStatus; severity: FindingSeverity };

/** Request changes needs at least one finding that will be OPEN once drafts are published. */
export function canRequestChanges(findings: FindingForOutcome[]): { ok: true } | { ok: false; error: string } {
  const willBeOpen = findings.some((f) => f.status === "DRAFT" || f.status === "OPEN");
  return willBeOpen ? { ok: true } : { ok: false, error: "Record at least one finding before requesting changes." };
}

export const MIN_SUMMARY = 10;

/**
 * Outcome guards for completing a review cycle:
 * - no DRAFT findings may remain (publish or dismiss them first)
 * - NO_ISSUES_IDENTIFIED: no findings other than dismissed ones
 * - ISSUES_RESOLVED: at least one resolved finding; every non-advisory finding resolved or dismissed
 * - COMPLETED_WITH_OPEN_ISSUES: at least one finding still open or awaiting the reviewer
 * - NOT_REVIEWABLE: always allowed, with a summary saying why
 * Every outcome needs a written summary.
 */
export function checkOutcome(
  outcome: ReviewOutcome,
  findings: FindingForOutcome[],
  summary: string,
): { ok: true } | { ok: false; error: string } {
  if (summary.trim().length < MIN_SUMMARY) return { ok: false, error: "Write a short summary of the review (at least a sentence)." };
  if (findings.some((f) => f.status === "DRAFT")) {
    return { ok: false, error: "Publish or dismiss draft findings before completing the review." };
  }
  const live = findings.filter((f) => f.status !== "DISMISSED");
  const unresolved = live.filter((f) => f.status === "OPEN" || f.status === "RESPONDED");

  switch (outcome) {
    case "NO_ISSUES_IDENTIFIED":
      return live.length === 0 ? { ok: true } : { ok: false, error: "Findings were recorded, so “No issues identified” doesn't apply." };
    case "ISSUES_RESOLVED":
      if (!live.some((f) => f.status === "RESOLVED")) return { ok: false, error: "No findings have been resolved." };
      return unresolved.some((f) => f.severity !== "ADVISORY")
        ? { ok: false, error: "Some findings are still unresolved." }
        : { ok: true };
    case "COMPLETED_WITH_OPEN_ISSUES":
      return unresolved.length > 0 ? { ok: true } : { ok: false, error: "There are no open findings. Choose another outcome." };
    case "NOT_REVIEWABLE":
      return { ok: true };
  }
}
