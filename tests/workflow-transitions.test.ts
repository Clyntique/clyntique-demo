import { describe, expect, it } from "vitest";
import type { CreativeStatus } from "@/generated/prisma/enums";
import { TRANSITIONS, checkDecisionTarget, nextStatuses, transition, type WorkflowAction } from "@/lib/workflow/transitions";

describe("status transition engine", () => {
  it("supports the full cycle with one resubmission", () => {
    const path: [WorkflowAction, "CLIENT" | "TEAM"][] = [
      ["SUBMIT", "CLIENT"],
      ["START_REVIEW", "TEAM"],
      ["REQUEST_CHANGES", "TEAM"],
      ["RESUBMIT", "CLIENT"],
      ["START_REVIEW", "TEAM"],
      ["COMPLETE_REVIEW", "TEAM"],
    ];
    let status: CreativeStatus = "DRAFT";
    const seen: CreativeStatus[] = [status];
    for (const [action, role] of path) {
      const r = transition(action, status, role);
      expect(r.ok).toBe(true);
      if (r.ok) status = r.transition.to;
      seen.push(status);
    }
    expect(seen).toEqual(["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "SUBMITTED", "IN_REVIEW", "REVIEW_COMPLETE"]);
  });

  it("supports IN_REVIEW straight to REVIEW_COMPLETE", () => {
    expect(transition("COMPLETE_REVIEW", "IN_REVIEW", "TEAM")).toMatchObject({ ok: true, transition: { to: "REVIEW_COMPLETE" } });
  });

  it("rejects every transition from the wrong status", () => {
    const statuses: CreativeStatus[] = ["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "REVIEW_COMPLETE", "APPROVED", "ARCHIVED"];
    for (const [action, t] of Object.entries(TRANSITIONS) as [WorkflowAction, (typeof TRANSITIONS)[WorkflowAction]][]) {
      for (const status of statuses.filter((s) => s !== t.from)) expect(transition(action, status, t.role).ok).toBe(false);
    }
  });

  it("rejects every transition for the wrong role", () => {
    for (const [action, t] of Object.entries(TRANSITIONS) as [WorkflowAction, (typeof TRANSITIONS)[WorkflowAction]][]) {
      expect(transition(action, t.from, t.role === "TEAM" ? "CLIENT" : "TEAM").ok).toBe(false);
    }
  });

  it("has no way out of REVIEW_COMPLETE, no skipping review, and no legacy statuses", () => {
    expect(nextStatuses("REVIEW_COMPLETE")).toEqual([]);
    expect(nextStatuses("DRAFT")).toEqual(["SUBMITTED"]);
    expect(nextStatuses("SUBMITTED")).toEqual(["IN_REVIEW"]);
    expect(nextStatuses("CHANGES_REQUESTED")).toEqual(["SUBMITTED"]);
    const used = Object.values(TRANSITIONS).flatMap((t) => [t.from, t.to]);
    expect(used).not.toContain("APPROVED");
    expect(used).not.toContain("ARCHIVED");
  });
});

describe("decision targets (stale and conflicting decisions)", () => {
  const target = {
    cycle: { id: "c1", closedAt: null },
    latestRound: { id: "r2", versionId: "v2" },
    latestVersionId: "v2",
    roundHasDecision: false,
  };

  it("accepts a decision on the newest round's exact version", () => {
    expect(checkDecisionTarget(target, { roundId: "r2", versionId: "v2" })).toEqual({ ok: true });
  });

  it("rejects an older round, a different version, a newer upload, a decided round or a closed cycle", () => {
    expect(checkDecisionTarget(target, { roundId: "r1", versionId: "v1" }).ok).toBe(false);
    expect(checkDecisionTarget(target, { roundId: "r2", versionId: "v1" }).ok).toBe(false);
    expect(checkDecisionTarget({ ...target, latestVersionId: "v3" }, { roundId: "r2", versionId: "v2" }).ok).toBe(false);
    expect(checkDecisionTarget({ ...target, roundHasDecision: true }, { roundId: "r2", versionId: "v2" }).ok).toBe(false);
    expect(checkDecisionTarget({ ...target, cycle: { id: "c1", closedAt: new Date() } }, { roundId: "r2", versionId: "v2" }).ok).toBe(false);
    expect(checkDecisionTarget({ ...target, latestRound: null }, { roundId: "r2", versionId: "v2" }).ok).toBe(false);
  });
});
