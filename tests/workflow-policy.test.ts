import { describe, expect, it } from "vitest";
import type { CreativeStatus } from "@/generated/prisma/enums";
import {
  CLIENT_ACTIONS,
  TEAM_ACTIONS,
  authorize,
  canCreateSubmission,
  canView,
  type Actor,
  type SubmissionAction,
  type SubmissionFacts,
} from "@/lib/workflow/policy";

const clientA: Actor = { id: "client-a", role: "CLIENT" };
const clientB: Actor = { id: "client-b", role: "CLIENT" };
const team: Actor = { id: "team-1", role: "TEAM" };

const sub = (status: CreativeStatus, over: Partial<SubmissionFacts> = {}): SubmissionFacts => ({
  id: "s1",
  workflow: "SUBMISSION_REVIEW",
  status,
  projectClientId: clientA.id,
  ...over,
});

describe("visibility", () => {
  it("clients see only submissions in their own projects, including their drafts", () => {
    expect(canView(clientA, sub("DRAFT"))).toBe(true);
    expect(canView(clientA, sub("IN_REVIEW"))).toBe(true);
    expect(canView(clientB, sub("IN_REVIEW"))).toBe(false);
  });

  it("the team never sees client drafts (draft privacy) but sees everything submitted", () => {
    expect(canView(team, sub("DRAFT"))).toBe(false);
    for (const s of ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "REVIEW_COMPLETE"] as const) expect(canView(team, sub(s))).toBe(true);
  });

  it("another client's submission and a client draft both look missing", () => {
    expect(authorize(clientB, "VIEW", sub("IN_REVIEW"))).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(authorize(team, "VIEW", sub("DRAFT"))).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(authorize(team, "START_REVIEW", sub("DRAFT"))).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("legacy isolation", () => {
  const legacy = (status: CreativeStatus) => sub(status, { workflow: "LEGACY_CLIENT_APPROVAL" });

  it("rejects every new-workflow action on legacy records", () => {
    for (const action of [...CLIENT_ACTIONS]) expect(authorize(clientA, action, legacy("IN_REVIEW"))).toEqual({ ok: false, reason: "LEGACY" });
    for (const action of [...TEAM_ACTIONS]) expect(authorize(team, action, legacy("APPROVED"))).toEqual({ ok: false, reason: "LEGACY" });
    expect(canView(team, legacy("APPROVED"))).toBe(false);
  });

  it("never reveals a legacy team draft to the client", () => {
    expect(authorize(clientA, "VIEW", legacy("DRAFT"))).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("role permissions", () => {
  it("clients never perform review actions or record decisions", () => {
    for (const action of TEAM_ACTIONS) {
      expect(authorize(clientA, action, sub("IN_REVIEW"))).toEqual({ ok: false, reason: "FORBIDDEN" });
    }
  });

  it("the team never acts as the client on a submission", () => {
    for (const action of CLIENT_ACTIONS) {
      const status: CreativeStatus = action === "SUBMIT" ? "SUBMITTED" : "CHANGES_REQUESTED";
      expect(authorize(team, action, sub(status))).toEqual({ ok: false, reason: "FORBIDDEN" });
    }
  });

  it("only the assigned client can create a submission in a project", () => {
    expect(canCreateSubmission(clientA, { clientId: clientA.id })).toEqual({ ok: true });
    expect(canCreateSubmission(clientB, { clientId: clientA.id })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(canCreateSubmission(team, { clientId: clientA.id })).toEqual({ ok: false, reason: "FORBIDDEN" });
  });
});

describe("status gates", () => {
  const cases: [Actor, SubmissionAction, CreativeStatus[]][] = [
    [clientA, "EDIT_DRAFT", ["DRAFT", "CHANGES_REQUESTED"]],
    [clientA, "UPLOAD_VERSION", ["DRAFT", "CHANGES_REQUESTED"]],
    [clientA, "MANAGE_EVIDENCE", ["DRAFT", "CHANGES_REQUESTED"]],
    [clientA, "SUBMIT", ["DRAFT"]],
    [clientA, "RESUBMIT", ["CHANGES_REQUESTED"]],
    [clientA, "RESPOND_TO_FINDING", ["CHANGES_REQUESTED"]],
    [team, "START_REVIEW", ["SUBMITTED"]],
    [team, "RECORD_FINDING", ["IN_REVIEW"]],
    [team, "REQUEST_CHANGES", ["IN_REVIEW"]],
    [team, "COMPLETE_REVIEW", ["IN_REVIEW"]],
    [team, "RESOLVE_FINDING", ["IN_REVIEW"]],
  ];
  const all: CreativeStatus[] = ["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "REVIEW_COMPLETE", "APPROVED", "ARCHIVED"];

  it.each(cases)("%s may %s only in the allowed statuses", (actor, action, allowed) => {
    for (const status of all) {
      const result = authorize(actor, action, sub(status));
      if (allowed.includes(status)) expect(result).toEqual({ ok: true });
      else expect(result.ok).toBe(false);
    }
  });

  it("nobody can upload or edit while a submission is under review or complete", () => {
    for (const status of ["SUBMITTED", "IN_REVIEW", "REVIEW_COMPLETE"] as const) {
      expect(authorize(clientA, "UPLOAD_VERSION", sub(status))).toEqual({ ok: false, reason: "INVALID_STATE" });
      expect(authorize(clientA, "EDIT_DRAFT", sub(status))).toEqual({ ok: false, reason: "INVALID_STATE" });
    }
  });
});
