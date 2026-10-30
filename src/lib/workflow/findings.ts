import type { FindingAction, FindingSeverity, FindingStatus, ReviewOutcome, Role } from "@/generated/prisma/enums";
import { pluralize } from "@/lib/format";

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

export type FindingEventFact = { fromStatus: FindingStatus | null; toStatus: FindingStatus; createdAt: Date; byClient: boolean };

/**
 * What a client may know about a published finding. The reviewer's moves
 * (resolve, reopen, dismiss) reach the client only once a decision has been
 * recorded after them, so work in progress during a review stays internal,
 * just like draft findings. The client's own responses are always theirs.
 * Returns the status as the client should see it, and the events they may see.
 */
export function clientFindingView<T extends FindingEventFact>(events: T[], lastDecisionAt: Date | null): { status: FindingStatus | null; events: T[] } {
  const visible = events
    .filter((e) => e.byClient || (lastDecisionAt !== null && e.createdAt <= lastDecisionAt))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const status = visible.length ? visible[visible.length - 1].toStatus : null;
  return { status: status === "DRAFT" ? null : status, events: visible };
}

/**
 * Client work becomes visible to the team only once it has been formally
 * submitted: anything the client wrote after the latest submission (responses,
 * evidence, evidence links) is still being prepared while changes are
 * requested, and stays private to the client until they resubmit.
 */
export function submittedToTeam(createdAt: Date, lastSubmittedAt: Date | null): boolean {
  return lastSubmittedAt !== null && createdAt <= lastSubmittedAt;
}

/**
 * What the team may know about a finding: every reviewer move, but the
 * client's own moves (responding) only once they were part of a submission.
 * The mirror image of clientFindingView.
 */
export function teamFindingView<T extends FindingEventFact>(events: T[], lastSubmittedAt: Date | null): { status: FindingStatus | null; events: T[] } {
  const visible = events
    .filter((e) => !e.byClient || submittedToTeam(e.createdAt, lastSubmittedAt))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { status: visible.length ? visible[visible.length - 1].toStatus : null, events: visible };
}

/**
 * Creative versions follow the same rule for the team: a revision uploaded
 * while changes are requested stays private to the client until they
 * resubmit. Legacy (team-owned) creatives are not affected.
 */
export function teamVisibleVersions<T extends { createdAt: Date }>(
  versions: T[],
  creative: { workflow: string; lastSubmittedAt: Date | null },
): T[] {
  if (creative.workflow !== "SUBMISSION_REVIEW") return versions;
  return versions.filter((v) => submittedToTeam(v.createdAt, creative.lastSubmittedAt));
}

/**
 * Title, description and campaign context as the team may see them: what the
 * client submitted with the latest round. The client always sees the live
 * values (their own edits). Without a round (legacy, or a draft the team
 * can't see anyway) the live values are used.
 */
export function teamVisibleDetails<T extends { name: string; description: string | null; context: string | null }>(
  live: T,
  latestRound: { submittedName: string | null; submittedDescription: string | null; submittedContext: string | null } | null | undefined,
): T {
  if (!latestRound || latestRound.submittedName === null) return live;
  return { ...live, name: latestRound.submittedName, description: latestRound.submittedDescription, context: latestRound.submittedContext };
}

/** The round an item was submitted with: the first round submitted at or after it was created (null: not yet submitted). */
export function submittedWithRound(createdAt: Date, rounds: { number: number; submittedAt: Date }[]): number | null {
  const sorted = [...rounds].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  return sorted.find((r) => r.submittedAt >= createdAt)?.number ?? null;
}

/**
 * Team work a client sees only once a review decision (request changes or a
 * final outcome) was published after it, like draft findings: assessments of
 * their evidence (decision D5) and evidence the reviewer added.
 */
export function publishedWithDecision(at: Date, decisionTimes: Date[]): boolean {
  return decisionTimes.some((d) => d >= at);
}

/** The cycle and round a piece of client evidence was first submitted with (rounds of every cycle). */
export function submittedIn(
  createdAt: Date,
  rounds: { number: number; cycleNumber: number; submittedAt: Date }[],
): { cycleNumber: number; roundNumber: number } | null {
  const sorted = [...rounds].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const r = sorted.find((x) => x.submittedAt >= createdAt);
  return r ? { cycleNumber: r.cycleNumber, roundNumber: r.number } : null;
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
  /**
   * Version number the latest change request was made on (or the version the
   * finding was identified on, if later). A revision must be newer than this.
   */
  requestedOnVersion: number | null;
  /** Client responses written since the latest change request. */
  clientResponses: number;
  /** Active (not withdrawn), shared evidence linked to the finding since the latest change request. */
  linkedEvidence: number;
};

export type Unmet = { findingId: string; missing: "RESPONSE" | "NEW_VERSION" | "EVIDENCE" };

/**
 * Every open finding (any severity) must meet its required action before the
 * client can resubmit, counting only what was done since the latest change
 * request (so a reopened finding needs a fresh response):
 * - every action: a response
 * - REVISE_CONTENT: also a version newer than the one the changes were requested on
 * - PROVIDE_EVIDENCE: also at least one evidence item linked to it
 * Meeting the action never resolves a finding; only the reviewer does that.
 */
export function resubmissionGaps(findings: FindingForReadiness[], latestVersion: number): Unmet[] {
  const gaps: Unmet[] = [];
  for (const f of findings) {
    if (f.status !== "OPEN" && f.status !== "RESPONDED") continue;
    if (f.clientResponses < 1) gaps.push({ findingId: f.id, missing: "RESPONSE" });
    if (f.requiredAction === "REVISE_CONTENT" && !(latestVersion > (f.requestedOnVersion ?? 0))) {
      gaps.push({ findingId: f.id, missing: "NEW_VERSION" });
    }
    if (f.requiredAction === "PROVIDE_EVIDENCE" && f.linkedEvidence < 1) gaps.push({ findingId: f.id, missing: "EVIDENCE" });
  }
  return gaps;
}

/**
 * Evidence becomes part of the record once it has been included in a
 * submitted round. Only evidence added after the latest submission (or while
 * still a draft) may be withdrawn, and only by the client who added it.
 */
export function evidenceIsFinal(evidence: { createdAt: Date }, lastSubmittedAt: Date | null): boolean {
  return lastSubmittedAt !== null && evidence.createdAt <= lastSubmittedAt;
}

// ---------------------------------------------------------------------------
// Request changes and final outcomes

export type FindingForOutcome = { status: FindingStatus; severity: FindingSeverity };

/** Request changes needs at least one finding that will be OPEN once drafts are published. */
export function canRequestChanges(findings: FindingForOutcome[]): { ok: true } | { ok: false; error: string } {
  // In a resubmitted round, every client response needs the reviewer's judgement first.
  const awaiting = findings.filter((f) => f.status === "RESPONDED").length;
  if (awaiting) {
    return {
      ok: false,
      error: `Resolve or reopen the ${awaiting} finding${awaiting === 1 ? "" : "s"} the client responded to before requesting changes.`,
    };
  }
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
    return { ok: false, error: "Publish or withdraw draft findings before completing the review." };
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

// ---------------------------------------------------------------------------
// TEAM overview

/**
 * TEAM only: one-line summary of where an in-review submission's findings
 * stand in the current review cycle. Drafts come first (they block an
 * outcome), then responses awaiting the reviewer's decision, then findings
 * still open. Resolved and withdrawn findings are settled, so a cycle with
 * only those has "no open findings" rather than "no findings yet".
 */
export function inReviewFindingsLabel(statuses: FindingStatus[]): string {
  const count = (s: FindingStatus) => statuses.filter((x) => x === s).length;
  const drafts = count("DRAFT");
  const awaiting = count("RESPONDED");
  const open = count("OPEN");
  if (drafts) return pluralize(drafts, "draft finding");
  if (awaiting) return `${pluralize(awaiting, "finding")} awaiting your decision`;
  if (open) return pluralize(open, "open finding");
  return statuses.length ? "no open findings" : "no findings yet";
}
