import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeStatus, CreativeWorkflow } from "@/generated/prisma/enums";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// Server-side commands with Prisma mocked. Checks authorization, guarded
// writes, reviewer identity and stale/conflicting decision handling.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

const cmd = await import("@/lib/workflow/commands");
const SUMMARY = "The claim needs substantiation before it can run.";

function setSubmission(status: CreativeStatus, workflow: CreativeWorkflow = "SUBMISSION_REVIEW", clientId = CLIENT_A.id) {
  h.prisma.creative.findUnique.mockResolvedValue({
    id: "s1",
    name: "Spring promo",
    workflow,
    status,
    projectId: "p-a",
    project: { clientId },
  });
}

/** Cycle 1, round 2 on V2, newest version V2, no decision yet. */
function setRound({ roundId = "r2", versionId = "v2", latest = { id: "v2", versionNumber: 2 }, decided = false, closed = false } = {}) {
  h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: closed ? new Date() : null });
  h.prisma.submissionRound.findFirst.mockResolvedValue({ id: roundId, number: 2, versionId, decisions: decided ? [{ id: "d0" }] : [] });
  h.prisma.creativeVersion.findFirst.mockResolvedValue(latest);
}

function writeCount(p: PrismaMock) {
  return [
    p.creative.create,
    p.creative.updateMany,
    p.reviewCycle.create,
    p.reviewCycle.updateMany,
    p.submissionRound.create,
    p.reviewDecision.create,
    p.finding.create,
    p.finding.updateMany,
    p.findingEvent.create,
    p.findingEvent.createMany,
    p.findingResponse.create,
    p.findingEvidence.upsert,
    p.activity.create,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);
}

beforeEach(() => {
  h.prisma = createPrismaMock();
});

describe("createDraft", () => {
  it("lets the assigned client create a draft, explicitly in the new workflow", async () => {
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    h.prisma.market.findMany.mockResolvedValue([{ code: "US" }, { code: "CA" }]);
    h.prisma.adPlatform.findMany.mockResolvedValue([{ code: "META" }]);
    h.prisma.creative.create.mockResolvedValue({ id: "s-new" });

    const result = await cmd.createDraft(CLIENT_A, { projectId: "p-a", name: "Spring promo", format: "FEED", marketCodes: ["US", "CA"], platformCodes: ["META"] });
    expect(result).toEqual({ ok: true, creativeId: "s-new" });
    const data = h.prisma.creative.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ workflow: "SUBMISSION_REVIEW", status: "DRAFT", createdById: CLIENT_A.id, projectId: "p-a" });
    expect(data.markets.create).toEqual([{ marketCode: "US" }, { marketCode: "CA" }]);
    expect(h.prisma.activity.create).not.toHaveBeenCalled(); // drafts are private
  });

  it("refuses another client's project and refuses TEAM users", async () => {
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    expect((await cmd.createDraft(CLIENT_B, { projectId: "p-a", name: "Mine", format: "FEED" })).ok).toBe(false);
    expect((await cmd.createDraft(TEAM, { projectId: "p-a", name: "Mine", format: "FEED" })).ok).toBe(false);
    expect(h.prisma.creative.create).not.toHaveBeenCalled();
  });

  it("rejects unknown market or platform codes", async () => {
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    h.prisma.market.findMany.mockResolvedValue([{ code: "US" }]);
    const result = await cmd.createDraft(CLIENT_A, { projectId: "p-a", name: "Promo", format: "FEED", marketCodes: ["US", "ZZ"] });
    expect(result.ok).toBe(false);
    expect(h.prisma.creative.create).not.toHaveBeenCalled();
  });
});

describe("submitForReview", () => {
  function complete() {
    h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v1", versionNumber: 1 });
    h.prisma.submissionMarket.count.mockResolvedValue(1);
    h.prisma.submissionPlatform.count.mockResolvedValue(1);
  }

  it("opens cycle 1 and round 1 on the newest version, with a guarded status update", async () => {
    setSubmission("DRAFT");
    complete();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.create.mockResolvedValue({ id: "c1" });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r1" });

    expect(await cmd.submitForReview(CLIENT_A, "s1")).toEqual({ ok: true, roundId: "r1" });
    expect(h.prisma.creative.updateMany.mock.calls[0][0].where).toMatchObject({ status: "DRAFT", workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    expect(h.prisma.submissionRound.create.mock.calls[0][0].data).toMatchObject({ number: 1, versionId: "v1", submittedById: CLIENT_A.id });
    expect(h.prisma.activity.create.mock.calls[0][0].data).toMatchObject({ type: "SUBMISSION_SUBMITTED", creativeId: "s1", userId: CLIENT_A.id });
  });

  it("needs an uploaded file", async () => {
    setSubmission("DRAFT");
    h.prisma.submissionMarket.count.mockResolvedValue(1);
    h.prisma.submissionPlatform.count.mockResolvedValue(1);
    expect(await cmd.submitForReview(CLIENT_A, "s1")).toMatchObject({ ok: false, error: expect.stringMatching(/Upload the creative file/) });
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("needs at least one active target market and one advertising platform", async () => {
    setSubmission("DRAFT");
    complete();
    h.prisma.submissionMarket.count.mockResolvedValue(0);
    expect(await cmd.submitForReview(CLIENT_A, "s1")).toMatchObject({ ok: false, error: expect.stringMatching(/target market/) });
    h.prisma.submissionMarket.count.mockResolvedValue(1);
    h.prisma.submissionPlatform.count.mockResolvedValue(0);
    expect(await cmd.submitForReview(CLIENT_A, "s1")).toMatchObject({ ok: false, error: expect.stringMatching(/advertising platform/) });
    expect(writeCount(h.prisma)).toBe(0);
    // Only active reference rows count.
    expect(h.prisma.submissionMarket.count.mock.calls[0][0].where).toEqual({ creativeId: "s1", market: { active: true } });
    expect(h.prisma.submissionPlatform.count.mock.calls[0][0].where).toEqual({ creativeId: "s1", platform: { active: true } });
  });

  it("allows saving an incomplete draft (no markets, platforms or file)", async () => {
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    h.prisma.creative.create.mockResolvedValue({ id: "s-new" });
    expect(await cmd.createDraft(CLIENT_A, { projectId: "p-a", name: "Work in progress", format: "STORY" })).toEqual({ ok: true, creativeId: "s-new" });
  });

  it("is refused for other clients, TEAM, and legacy records", async () => {
    setSubmission("DRAFT");
    expect(await cmd.submitForReview(CLIENT_B, "s1")).toMatchObject({ ok: false, error: expect.stringMatching(/no longer available/) });
    expect(await cmd.submitForReview(TEAM, "s1")).toMatchObject({ ok: false, error: expect.stringMatching(/no longer available/) }); // team can't see drafts
    setSubmission("DRAFT", "LEGACY_CLIENT_APPROVAL");
    expect((await cmd.submitForReview(CLIENT_A, "s1")).ok).toBe(false);
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("reports a conflict when the guarded update matches nothing (double submit)", async () => {
    setSubmission("DRAFT");
    complete();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 0 });
    expect((await cmd.submitForReview(CLIENT_A, "s1")).ok).toBe(false);
    expect(h.prisma.reviewCycle.create).not.toHaveBeenCalled();
  });
});

describe("review actions are TEAM-only and record the reviewer", () => {
  it("clients can't start reviews, record findings, request changes or complete reviews", async () => {
    setSubmission("IN_REVIEW");
    setRound();
    expect((await cmd.startReview(CLIENT_A, "s1")).ok).toBe(false);
    expect((await cmd.recordFinding(CLIENT_A, { creativeId: "s1", issue: "Claim", explanation: "x", severity: "HIGH", requiredAction: "CLARIFY", actionDetails: "x" })).ok).toBe(false);
    expect((await cmd.requestChanges(CLIENT_A, { creativeId: "s1", roundId: "r2", versionId: "v2", summary: SUMMARY })).ok).toBe(false);
    expect((await cmd.completeReview(CLIENT_A, { creativeId: "s1", roundId: "r2", versionId: "v2", outcome: "NO_ISSUES_IDENTIFIED", summary: SUMMARY })).ok).toBe(false);
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("startReview is guarded against two reviewers starting at once", async () => {
    setSubmission("SUBMITTED");
    h.prisma.creative.updateMany.mockResolvedValue({ count: 0 });
    expect(await cmd.startReview(TEAM, "s1")).toMatchObject({ ok: false, error: expect.stringMatching(/already started/) });
    expect(h.prisma.activity.create).not.toHaveBeenCalled();
  });

  it("recordFinding creates a DRAFT finding on the round's version, attributed to the reviewer", async () => {
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.finding.create.mockResolvedValue({ id: "f1" });
    const result = await cmd.recordFinding(TEAM, {
      creativeId: "s1",
      issue: "Unsupported “#1” claim",
      explanation: "The ad states it is the top-rated product.",
      severity: "HIGH",
      requiredAction: "PROVIDE_EVIDENCE",
      actionDetails: "Provide the survey or ranking source.",
    });
    expect(result).toEqual({ ok: true, findingId: "f1" });
    expect(h.prisma.finding.create.mock.calls[0][0].data).toMatchObject({ status: "DRAFT", versionId: "v2", cycleId: "c1", createdById: TEAM.id });
    expect(h.prisma.findingEvent.create.mock.calls[0][0].data).toMatchObject({ toStatus: "DRAFT", actorId: TEAM.id });
    expect(h.prisma.activity.create).not.toHaveBeenCalled(); // drafts are internal
  });

  it("recordFinding rejects invalid severity or action values", async () => {
    setSubmission("IN_REVIEW");
    setRound();
    const base = { creativeId: "s1", issue: "Claim", explanation: "x", actionDetails: "x" };
    expect((await cmd.recordFinding(TEAM, { ...base, severity: "CRITICAL", requiredAction: "CLARIFY" })).ok).toBe(false);
    expect((await cmd.recordFinding(TEAM, { ...base, severity: "HIGH", requiredAction: "APPROVE" })).ok).toBe(false);
    expect(h.prisma.finding.create).not.toHaveBeenCalled();
  });
});

describe("version-specific decisions", () => {
  beforeEach(() => {
    setSubmission("IN_REVIEW");
    h.prisma.finding.findMany.mockResolvedValue([{ id: "f1", status: "DRAFT", severity: "HIGH" }]);
  });

  it("requestChanges publishes drafts and records the decision on the round's exact version", async () => {
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    const result = await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", summary: SUMMARY });
    expect(result).toEqual({ ok: true });
    expect(h.prisma.creative.updateMany.mock.calls[0][0].where).toMatchObject({ status: "IN_REVIEW", versions: { none: { versionNumber: { gt: 2 } } } });
    expect(h.prisma.finding.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["f1"] }, status: "DRAFT" }, data: { status: "OPEN" } });
    expect(h.prisma.reviewDecision.create.mock.calls[0][0].data).toMatchObject({
      kind: "CHANGES_REQUESTED",
      roundId: "r2",
      versionId: "v2",
      reviewerId: TEAM.id,
    });
  });

  it("rejects a stale round, a mismatched version, a newer upload or an already-decided round", async () => {
    setRound();
    expect((await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r1", versionId: "v1", summary: SUMMARY })).ok).toBe(false);
    expect((await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v1", summary: SUMMARY })).ok).toBe(false);
    setRound({ latest: { id: "v3", versionNumber: 3 } });
    expect((await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", summary: SUMMARY })).ok).toBe(false);
    setRound({ decided: true });
    expect((await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", summary: SUMMARY })).ok).toBe(false);
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("a conflicting concurrent decision writes nothing (guarded update matches zero rows)", async () => {
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 0 });
    expect((await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", summary: SUMMARY })).ok).toBe(false);
    expect(h.prisma.reviewDecision.create).not.toHaveBeenCalled();
  });

  it("completeReview applies outcome guards and records a FINAL decision", async () => {
    setRound();
    expect((await cmd.completeReview(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", outcome: "ISSUES_RESOLVED", summary: SUMMARY })).ok).toBe(false);

    h.prisma.finding.findMany.mockResolvedValue([{ status: "RESOLVED", severity: "HIGH" }]);
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.updateMany.mockResolvedValue({ count: 1 });
    const result = await cmd.completeReview(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", outcome: "ISSUES_RESOLVED", summary: SUMMARY, scopeNote: "US, CA; Meta" });
    expect(result).toEqual({ ok: true });
    expect(h.prisma.reviewDecision.create.mock.calls[0][0].data).toMatchObject({ kind: "FINAL", outcome: "ISSUES_RESOLVED", versionId: "v2", reviewerId: TEAM.id });
    expect(h.prisma.reviewCycle.updateMany.mock.calls[0][0].where).toEqual({ id: "c1", closedAt: null });
    expect(h.prisma.activity.create.mock.calls[0][0].data).toMatchObject({ type: "REVIEW_COMPLETED", userId: TEAM.id });
  });

  it("completeReview rejects unknown outcomes", async () => {
    setRound();
    expect((await cmd.completeReview(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", outcome: "APPROVED", summary: SUMMARY })).ok).toBe(false);
  });
});

describe("client responses and resubmission", () => {
  it("clients can't respond to a draft (unpublished) finding, or to another client's finding", async () => {
    setSubmission("CHANGES_REQUESTED");
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", cycleId: "c1", status: "DRAFT", publishedAt: null });
    expect((await cmd.respondToFinding(CLIENT_A, { findingId: "f1", message: "Done" })).ok).toBe(false);
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", cycleId: "c1", status: "OPEN", publishedAt: new Date() });
    expect((await cmd.respondToFinding(CLIENT_B, { findingId: "f1", message: "Done" })).ok).toBe(false);
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("a response moves the finding to RESPONDED and links only usable evidence", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", cycleId: "c1", status: "OPEN", publishedAt: new Date() });
    h.prisma.evidence.count.mockResolvedValue(1);
    h.prisma.finding.updateMany.mockResolvedValue({ count: 1 });
    const result = await cmd.respondToFinding(CLIENT_A, { findingId: "f1", message: "Survey attached", evidenceIds: ["e1"] });
    expect(result).toEqual({ ok: true });
    expect(h.prisma.evidence.count.mock.calls[0][0].where).toMatchObject({ creativeId: "s1", visibility: "SHARED", withdrawnAt: null });
    expect(h.prisma.findingResponse.create.mock.calls[0][0].data).toMatchObject({ authorId: CLIENT_A.id, roundId: "r2" });
    expect(h.prisma.findingEvidence.upsert.mock.calls[0][0].create).toMatchObject({ evidenceId: "e1", linkedById: CLIENT_A.id });
    expect(h.prisma.findingEvent.create.mock.calls[0][0].data).toMatchObject({ fromStatus: "OPEN", toStatus: "RESPONDED" });

    h.prisma.evidence.count.mockResolvedValue(0);
    expect((await cmd.respondToFinding(CLIENT_A, { findingId: "f1", message: "Other evidence", evidenceIds: ["internal-or-foreign"] })).ok).toBe(false);
  });

  it("resubmission is blocked until each open finding meets its required action", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound({ latest: { id: "v2", versionNumber: 2 } });
    h.prisma.finding.findMany.mockResolvedValue([
      { id: "f1", status: "OPEN", severity: "HIGH", requiredAction: "REVISE_CONTENT", version: { versionNumber: 2 }, _count: { responses: 0, evidence: 0 } },
    ]);
    expect(await cmd.resubmit(CLIENT_A, "s1")).toMatchObject({ ok: false, error: expect.stringMatching(/outstanding/) });
    expect(h.prisma.creative.updateMany).not.toHaveBeenCalled();
  });

  it("a ready resubmission opens the next round on the newest version", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound({ latest: { id: "v3", versionNumber: 3 } });
    h.prisma.finding.findMany.mockResolvedValue([
      { id: "f1", status: "RESPONDED", severity: "HIGH", requiredAction: "REVISE_CONTENT", version: { versionNumber: 2 }, _count: { responses: 1, evidence: 0 } },
    ]);
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r3" });
    expect(await cmd.resubmit(CLIENT_A, "s1", "Updated headline")).toEqual({ ok: true, roundId: "r3" });
    expect(h.prisma.submissionRound.create.mock.calls[0][0].data).toMatchObject({ cycleId: "c1", number: 3, versionId: "v3", submittedById: CLIENT_A.id });
    expect(h.prisma.activity.create.mock.calls[0][0].data).toMatchObject({ type: "RESUBMITTED" });
    // Earlier decisions and findings are not modified by a resubmission.
    expect(h.prisma.reviewDecision.create).not.toHaveBeenCalled();
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it("markets and platforms can't change after submission", async () => {
    setSubmission("CHANGES_REQUESTED");
    const result = await cmd.updateDraft(CLIENT_A, "s1", { name: "Promo", format: "FEED", marketCodes: ["AE"] });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/can't be changed after submission/) });
  });
});

describe("reviewFinding", () => {
  it("resolving records the reviewer, note and the version it was resolved in", async () => {
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "RESPONDED" });
    h.prisma.finding.updateMany.mockResolvedValue({ count: 1 });
    expect(await cmd.reviewFinding(TEAM, { findingId: "f1", move: "RESOLVE", note: "Survey accepted" })).toEqual({ ok: true });
    expect(h.prisma.finding.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "f1", status: "RESPONDED" },
      data: { status: "RESOLVED", resolvedById: TEAM.id, resolutionNote: "Survey accepted", resolvedInVersionId: "v2" },
    });
  });

  it("clients can't resolve findings", async () => {
    setSubmission("IN_REVIEW");
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "RESPONDED" });
    expect((await cmd.reviewFinding(CLIENT_A, { findingId: "f1", move: "RESOLVE", note: "ok" })).ok).toBe(false);
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled();
  });
});
