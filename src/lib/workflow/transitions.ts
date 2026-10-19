import type { CreativeStatus, Role } from "@/generated/prisma/enums";

/*
 * Status transition engine for SUBMISSION_REVIEW creatives.
 *
 *   DRAFT --SUBMIT--> SUBMITTED --START_REVIEW--> IN_REVIEW
 *   IN_REVIEW --REQUEST_CHANGES--> CHANGES_REQUESTED --RESUBMIT--> SUBMITTED
 *   IN_REVIEW --COMPLETE_REVIEW--> REVIEW_COMPLETE   (outcome guards in findings.ts)
 *   REVIEW_COMPLETE --REOPEN_REVIEW--> SUBMITTED     (TEAM opens the next review cycle; Oct 19 sprint)
 *
 * This is the only place status transitions are defined. Commands apply them
 * with a conditional update (`where: { status: from }`), so a stale page or a
 * double submit matches zero rows instead of skipping a step. APPROVED and
 * ARCHIVED never appear here: they belong to the legacy workflow.
 */

export type WorkflowAction = "SUBMIT" | "START_REVIEW" | "REQUEST_CHANGES" | "RESUBMIT" | "COMPLETE_REVIEW" | "REOPEN_REVIEW";

export type Transition = { from: CreativeStatus; to: CreativeStatus; role: Role };

export const TRANSITIONS: Record<WorkflowAction, Transition> = {
  SUBMIT: { from: "DRAFT", to: "SUBMITTED", role: "CLIENT" },
  START_REVIEW: { from: "SUBMITTED", to: "IN_REVIEW", role: "TEAM" },
  REQUEST_CHANGES: { from: "IN_REVIEW", to: "CHANGES_REQUESTED", role: "TEAM" },
  RESUBMIT: { from: "CHANGES_REQUESTED", to: "SUBMITTED", role: "CLIENT" },
  COMPLETE_REVIEW: { from: "IN_REVIEW", to: "REVIEW_COMPLETE", role: "TEAM" },
  // Re-review: a completed submission goes back to the queue in a NEW cycle.
  // The previous cycle, its findings and its decisions are never changed.
  REOPEN_REVIEW: { from: "REVIEW_COMPLETE", to: "SUBMITTED", role: "TEAM" },
};

export type TransitionResult = { ok: true; transition: Transition } | { ok: false; error: string };

/** Validates one transition for a role. Guards beyond status/role live with each command. */
export function transition(action: WorkflowAction, current: CreativeStatus, role: Role): TransitionResult {
  const t = TRANSITIONS[action];
  if (t.role !== role) return { ok: false, error: "This action isn't available to your role." };
  if (t.from !== current) return { ok: false, error: "This submission isn't in a state that allows that." };
  return { ok: true, transition: t };
}

/** Every status reachable from `status` in one step, for any role. */
export function nextStatuses(status: CreativeStatus): CreativeStatus[] {
  return Object.values(TRANSITIONS)
    .filter((t) => t.from === status)
    .map((t) => t.to);
}

// ---------------------------------------------------------------------------
// Decision staleness: a decision is valid only for the newest round of the
// open cycle, for that round's exact version, when no newer version exists
// and the round has no decision yet.

export type DecisionTarget = {
  cycle: { id: string; closedAt: Date | null };
  latestRound: { id: string; versionId: string } | null;
  latestVersionId: string | null;
  roundHasDecision: boolean;
};

export function checkDecisionTarget(
  target: DecisionTarget,
  requested: { roundId: string; versionId: string },
): { ok: true } | { ok: false; error: string } {
  if (target.cycle.closedAt) return { ok: false, error: "This review cycle is already closed." };
  if (!target.latestRound || target.latestRound.id !== requested.roundId) {
    return { ok: false, error: "A newer submission round exists. Refresh and review the latest round." };
  }
  if (target.latestRound.versionId !== requested.versionId || target.latestVersionId !== requested.versionId) {
    return { ok: false, error: "This decision must be about the version submitted in this round. Refresh and try again." };
  }
  if (target.roundHasDecision) return { ok: false, error: "A decision has already been recorded for this round." };
  return { ok: true };
}
