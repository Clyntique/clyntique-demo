import { describe, expect, it } from "vitest";
import {
  canRequestChanges,
  checkOutcome,
  evidenceVisibleTo,
  findingVisibleTo,
  moveFinding,
  resubmissionGaps,
  type FindingForReadiness,
} from "@/lib/workflow/findings";
import { FINDING_STATUS_LABEL, REQUIRED_ACTION_LABEL, REVIEW_DISCLAIMER, REVIEW_OUTCOME_LABEL, SEVERITY_LABEL } from "@/lib/workflow/labels";

const SUMMARY = "Reviewed the creative and its evidence.";

describe("finding transitions", () => {
  it("allows the remediation loop", () => {
    expect(moveFinding("PUBLISH", "DRAFT", "TEAM")).toEqual({ ok: true, to: "OPEN" });
    expect(moveFinding("RESPOND", "OPEN", "CLIENT", "Fixed in V2")).toEqual({ ok: true, to: "RESPONDED" });
    expect(moveFinding("RESPOND", "RESPONDED", "CLIENT", "More detail")).toEqual({ ok: true, to: "RESPONDED" });
    expect(moveFinding("REOPEN", "RESPONDED", "TEAM", "Still unclear")).toEqual({ ok: true, to: "OPEN" });
    expect(moveFinding("RESOLVE", "RESPONDED", "TEAM", "Evidence accepted")).toEqual({ ok: true, to: "RESOLVED" });
    expect(moveFinding("DISMISS", "OPEN", "TEAM", "Not applicable")).toEqual({ ok: true, to: "DISMISSED" });
  });

  it("rejects wrong roles, wrong states and missing notes", () => {
    expect(moveFinding("RESOLVE", "RESPONDED", "CLIENT", "x").ok).toBe(false);
    expect(moveFinding("RESPOND", "OPEN", "TEAM", "x").ok).toBe(false);
    expect(moveFinding("RESPOND", "DRAFT", "CLIENT", "x").ok).toBe(false);
    expect(moveFinding("RESOLVE", "OPEN", "TEAM", "x").ok).toBe(false);
    expect(moveFinding("PUBLISH", "OPEN", "TEAM").ok).toBe(false);
    expect(moveFinding("RESOLVE", "RESOLVED", "TEAM", "x").ok).toBe(false);
    expect(moveFinding("DISMISS", "OPEN", "TEAM", "  ").ok).toBe(false);
    expect(moveFinding("RESPOND", "OPEN", "CLIENT", "").ok).toBe(false);
  });
});

describe("visibility", () => {
  it("clients never see draft or never-published findings", () => {
    expect(findingVisibleTo("CLIENT", { status: "DRAFT", publishedAt: null })).toBe(false);
    expect(findingVisibleTo("CLIENT", { status: "DISMISSED", publishedAt: null })).toBe(false);
    expect(findingVisibleTo("CLIENT", { status: "OPEN", publishedAt: new Date() })).toBe(true);
    expect(findingVisibleTo("CLIENT", { status: "DISMISSED", publishedAt: new Date() })).toBe(true);
    expect(findingVisibleTo("TEAM", { status: "DRAFT", publishedAt: null })).toBe(true);
  });

  it("internal evidence is team-only", () => {
    expect(evidenceVisibleTo("CLIENT", { visibility: "INTERNAL" })).toBe(false);
    expect(evidenceVisibleTo("CLIENT", { visibility: "SHARED" })).toBe(true);
    expect(evidenceVisibleTo("TEAM", { visibility: "INTERNAL" })).toBe(true);
  });
});

describe("resubmission rules", () => {
  const f = (over: Partial<FindingForReadiness>): FindingForReadiness => ({
    id: "f1",
    status: "OPEN",
    severity: "HIGH",
    requiredAction: "CLARIFY",
    identifiedInVersion: 1,
    clientResponses: 0,
    linkedEvidence: 0,
    ...over,
  });

  it("requires a response for every open, non-advisory finding", () => {
    expect(resubmissionGaps([f({})], 1)).toEqual([{ findingId: "f1", missing: "RESPONSE" }]);
    expect(resubmissionGaps([f({ clientResponses: 1, status: "RESPONDED" })], 1)).toEqual([]);
  });

  it("REVISE_CONTENT needs a newer version than the one the finding was raised on", () => {
    const finding = f({ requiredAction: "REVISE_CONTENT", clientResponses: 1, status: "RESPONDED" });
    expect(resubmissionGaps([finding], 1)).toEqual([{ findingId: "f1", missing: "NEW_VERSION" }]);
    expect(resubmissionGaps([finding], 2)).toEqual([]);
  });

  it("PROVIDE_EVIDENCE needs linked evidence", () => {
    const finding = f({ requiredAction: "PROVIDE_EVIDENCE", clientResponses: 1, status: "RESPONDED" });
    expect(resubmissionGaps([finding], 1)).toEqual([{ findingId: "f1", missing: "EVIDENCE" }]);
    expect(resubmissionGaps([{ ...finding, linkedEvidence: 1 }], 1)).toEqual([]);
  });

  it("ignores advisory, resolved and dismissed findings", () => {
    expect(resubmissionGaps([f({ severity: "ADVISORY" }), f({ status: "RESOLVED" }), f({ status: "DISMISSED" })], 1)).toEqual([]);
  });
});

describe("request changes and outcome guards", () => {
  it("request changes needs at least one finding to publish or already open", () => {
    expect(canRequestChanges([]).ok).toBe(false);
    expect(canRequestChanges([{ status: "RESOLVED", severity: "HIGH" }]).ok).toBe(false);
    expect(canRequestChanges([{ status: "DRAFT", severity: "LOW" }]).ok).toBe(true);
  });

  it("every outcome needs a summary and no draft findings", () => {
    expect(checkOutcome("NOT_REVIEWABLE", [], "short").ok).toBe(false);
    expect(checkOutcome("COMPLETED_WITH_OPEN_ISSUES", [{ status: "DRAFT", severity: "HIGH" }, { status: "OPEN", severity: "HIGH" }], SUMMARY).ok).toBe(false);
  });

  it("NO_ISSUES_IDENTIFIED only when nothing but dismissed findings exist", () => {
    expect(checkOutcome("NO_ISSUES_IDENTIFIED", [], SUMMARY).ok).toBe(true);
    expect(checkOutcome("NO_ISSUES_IDENTIFIED", [{ status: "DISMISSED", severity: "HIGH" }], SUMMARY).ok).toBe(true);
    expect(checkOutcome("NO_ISSUES_IDENTIFIED", [{ status: "RESOLVED", severity: "LOW" }], SUMMARY).ok).toBe(false);
  });

  it("ISSUES_RESOLVED needs resolved findings and nothing non-advisory left open", () => {
    expect(checkOutcome("ISSUES_RESOLVED", [{ status: "RESOLVED", severity: "HIGH" }], SUMMARY).ok).toBe(true);
    expect(checkOutcome("ISSUES_RESOLVED", [{ status: "RESOLVED", severity: "HIGH" }, { status: "OPEN", severity: "ADVISORY" }], SUMMARY).ok).toBe(true);
    expect(checkOutcome("ISSUES_RESOLVED", [{ status: "RESOLVED", severity: "HIGH" }, { status: "RESPONDED", severity: "LOW" }], SUMMARY).ok).toBe(false);
    expect(checkOutcome("ISSUES_RESOLVED", [{ status: "DISMISSED", severity: "HIGH" }], SUMMARY).ok).toBe(false);
  });

  it("COMPLETED_WITH_OPEN_ISSUES needs an unresolved finding; NOT_REVIEWABLE is always possible", () => {
    expect(checkOutcome("COMPLETED_WITH_OPEN_ISSUES", [{ status: "OPEN", severity: "MEDIUM" }], SUMMARY).ok).toBe(true);
    expect(checkOutcome("COMPLETED_WITH_OPEN_ISSUES", [{ status: "RESOLVED", severity: "MEDIUM" }], SUMMARY).ok).toBe(false);
    expect(checkOutcome("NOT_REVIEWABLE", [{ status: "OPEN", severity: "HIGH" }], SUMMARY).ok).toBe(true);
  });
});

describe("display labels", () => {
  it("are separate from enum values and never claim approval or compliance", () => {
    const labels = [
      ...Object.values(REVIEW_OUTCOME_LABEL),
      ...Object.values(SEVERITY_LABEL),
      ...Object.values(REQUIRED_ACTION_LABEL),
      ...Object.values(FINDING_STATUS_LABEL),
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/^[A-Z_]+$/);
      expect(label).not.toMatch(/approv|complian|certif|violation/i);
    }
    expect(REVIEW_DISCLAIMER).toMatch(/not legal advice/i);
  });
});
