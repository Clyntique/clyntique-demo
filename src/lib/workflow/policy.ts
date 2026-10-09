import type { CreativeStatus, CreativeWorkflow, Role } from "@/generated/prisma/enums";

/*
 * Authorization for the submission-review workflow. Pure functions: callers
 * load the facts from the database, and every server-side command asks here
 * before it writes. Nothing in this file trusts the browser.
 *
 * - CLIENT: only submissions in projects assigned to them (Project.clientId),
 *   including their own drafts. Never records internal review decisions.
 * - TEAM: only submitted work (client drafts are private). Reviews, findings
 *   and decisions. Never acts as the client: there is no TEAM action that
 *   creates, edits, submits or resubmits a client's submission. Creation on a
 *   client's behalf (D6) is deferred; the MVP uses client-owned submissions.
 * - Legacy records (workflow LEGACY_CLIENT_APPROVAL) are never touched by any
 *   new-workflow action; they stay with the existing Phase 4 code.
 */

export type Actor = { id: string; role: Role };

export type SubmissionFacts = {
  id: string;
  workflow: CreativeWorkflow;
  status: CreativeStatus;
  /** Project.clientId of the submission's project. */
  projectClientId: string;
};

export const CLIENT_ACTIONS = ["EDIT_DRAFT", "UPLOAD_VERSION", "MANAGE_EVIDENCE", "SUBMIT", "RESUBMIT", "RESPOND_TO_FINDING"] as const;
export const TEAM_ACTIONS = [
  "START_REVIEW",
  "RECORD_FINDING",
  "PUBLISH_FINDING",
  "REQUEST_CHANGES",
  "RESOLVE_FINDING",
  "REOPEN_FINDING",
  "DISMISS_FINDING",
  "COMPLETE_REVIEW",
  "ADD_REVIEWER_EVIDENCE",
] as const;

export type ClientAction = (typeof CLIENT_ACTIONS)[number];
export type TeamAction = (typeof TEAM_ACTIONS)[number];
export type SubmissionAction = "VIEW" | ClientAction | TeamAction;

export type Denial = "NOT_FOUND" | "FORBIDDEN" | "LEGACY" | "INVALID_STATE";
export type Decision = { ok: true } | { ok: false; reason: Denial };

const ALLOW: Decision = { ok: true };
const deny = (reason: Denial): Decision => ({ ok: false, reason });

// Status in which each action is allowed (the transition engine then checks
// the exact transition and its guards).
const ALLOWED_IN: Record<Exclude<SubmissionAction, "VIEW">, readonly CreativeStatus[]> = {
  EDIT_DRAFT: ["DRAFT", "CHANGES_REQUESTED"],
  UPLOAD_VERSION: ["DRAFT", "CHANGES_REQUESTED"],
  MANAGE_EVIDENCE: ["DRAFT", "CHANGES_REQUESTED"],
  SUBMIT: ["DRAFT"],
  RESUBMIT: ["CHANGES_REQUESTED"],
  RESPOND_TO_FINDING: ["CHANGES_REQUESTED"],
  START_REVIEW: ["SUBMITTED"],
  RECORD_FINDING: ["IN_REVIEW"],
  PUBLISH_FINDING: ["IN_REVIEW"],
  REQUEST_CHANGES: ["IN_REVIEW"],
  RESOLVE_FINDING: ["IN_REVIEW"],
  REOPEN_FINDING: ["IN_REVIEW"],
  DISMISS_FINDING: ["IN_REVIEW"],
  COMPLETE_REVIEW: ["IN_REVIEW"],
  ADD_REVIEWER_EVIDENCE: ["IN_REVIEW"],
};

/** Whether the actor may see this submission at all. */
export function canView(actor: Actor, s: SubmissionFacts): boolean {
  if (s.workflow !== "SUBMISSION_REVIEW") return false;
  if (actor.role === "CLIENT") return s.projectClientId === actor.id;
  return s.status !== "DRAFT"; // client drafts are private to the client
}

export function authorize(actor: Actor, action: SubmissionAction, s: SubmissionFacts): Decision {
  // Visibility first, so a forbidden submission looks the same as a missing one.
  // Drafts are private to their author side: a client never learns of a legacy
  // team draft, and the team never sees a client's draft.
  const legacy = s.workflow !== "SUBMISSION_REVIEW";
  const visible =
    actor.role === "CLIENT"
      ? s.projectClientId === actor.id && !(legacy && s.status === "DRAFT")
      : !(!legacy && s.status === "DRAFT");
  if (!visible) return deny("NOT_FOUND");
  if (legacy) return deny("LEGACY");
  if (action === "VIEW") return ALLOW;

  const roleOk =
    actor.role === "CLIENT"
      ? (CLIENT_ACTIONS as readonly string[]).includes(action)
      : (TEAM_ACTIONS as readonly string[]).includes(action);
  if (!roleOk) return deny("FORBIDDEN");

  return ALLOWED_IN[action].includes(s.status) ? ALLOW : deny("INVALID_STATE");
}

/** Only the client a project is assigned to may create submissions in it. */
export function canCreateSubmission(actor: Actor, project: { clientId: string }): Decision {
  if (actor.role !== "CLIENT") return deny("FORBIDDEN");
  return project.clientId === actor.id ? ALLOW : deny("NOT_FOUND");
}

export const DENIAL_MESSAGE: Record<Denial, string> = {
  NOT_FOUND: "This submission is no longer available.",
  FORBIDDEN: "You don't have permission to do that.",
  LEGACY: "This creative was created before the compliance review workflow and can't be changed here.",
  INVALID_STATE: "This submission isn't in a state that allows that. Refresh to see its current status.",
};
