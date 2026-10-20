import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeStatus, CreativeWorkflow } from "@/generated/prisma/enums";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// Lifecycle commands (Oct 19 sprint) with Prisma mocked: re-review cycles,
// external submission and outcome records. Checks authorization, client
// isolation, state transitions, historical integrity and failure cases.

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

function setSubmission(status: CreativeStatus, workflow: CreativeWorkflow = "SUBMISSION_REVIEW", clientId = CLIENT_A.id) {
  h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "Spring promo", workflow, status, projectId: "p-a", updatedAt: new Date(), project: { clientId } });
  h.prisma.creative.findUniqueOrThrow.mockResolvedValue({ name: "Spring promo", description: null, context: null });
}

/** Cycle 1 closed (review complete), its last round on V2, newest version V2. */
function setClosedCycle({ closed = true, latest = { id: "v2", versionNumber: 2 } } = {}) {
  h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: closed ? new Date("2026-10-10T00:00:00Z") : null });
  h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v2", decisions: [{ id: "d1" }], cycleId: "c1" });
  h.prisma.creativeVersion.findFirst.mockResolvedValue(latest);
}

function writeCount(p: PrismaMock) {
  return [
    p.creative.updateMany,
    p.reviewCycle.create,
    p.submissionRound.create,
    p.finding.create,
    p.finding.updateMany,
    p.findingEvent.create,
    p.reviewDecision.create,
    p.reviewDecision.updateMany,
    p.externalSubmission.create,
    p.externalOutcome.create,
    p.externalSubmission.updateMany,
    p.externalOutcome.updateMany,
    p.externalSubmission.deleteMany,
    p.externalOutcome.deleteMany,
    p.activity.create,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);
}

beforeEach(() => {
  h.prisma = createPrismaMock();
});

const NOTE = "The claims policy for this market changed; the approved version needs re-checking.";

describe("openReviewCycle (re-review)", () => {
  it("TEAM opens cycle N+1 with round 1 on the latest version; nothing from cycle N is touched or copied", async () => {
    setSubmission("REVIEW_COMPLETE");
    setClosedCycle();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.create.mockResolvedValue({ id: "c2", number: 2 });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r2-1" });

    const result = await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "TEAM_REQUEST", note: NOTE });
    expect(result).toEqual({ ok: true, cycleId: "c2", cycleNumber: 2, roundId: "r2-1" });

    // Guarded transition REVIEW_COMPLETE -> SUBMITTED (only from REVIEW_COMPLETE).
    expect(h.prisma.creative.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "s1", workflow: "SUBMISSION_REVIEW", status: "REVIEW_COMPLETE" }, data: { status: "SUBMITTED" } });
    expect(h.prisma.reviewCycle.create.mock.calls[0][0].data).toMatchObject({ creativeId: "s1", number: 2, openedById: TEAM.id, reasonKind: "TEAM_REQUEST", openedReason: NOTE, triggerRuleVersionId: null });
    expect(h.prisma.submissionRound.create.mock.calls[0][0].data).toMatchObject({ creativeId: "s1", cycleId: "c2", number: 1, versionId: "v2", submittedById: TEAM.id, submittedName: "Spring promo" });
    expect(h.prisma.activity.create.mock.calls[0][0].data).toMatchObject({ type: "REVIEW_STARTED", creativeId: "s1", userId: TEAM.id });

    // Historical integrity: the old cycle, its decisions and findings are never written to.
    expect(h.prisma.reviewCycle.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.reviewCycle.update).not.toHaveBeenCalled();
    expect(h.prisma.reviewDecision.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.finding.create).not.toHaveBeenCalled();
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.finding.update).not.toHaveBeenCalled();
  });

  it("refuses CLIENT users and other states, with no write", async () => {
    setSubmission("REVIEW_COMPLETE");
    setClosedCycle();
    expect(await cmd.openReviewCycle(CLIENT_A, { creativeId: "s1", reason: "CLIENT_UPDATE", note: NOTE })).toMatchObject({ ok: false });
    for (const status of ["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"] as const) {
      setSubmission(status);
      expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "TEAM_REQUEST", note: NOTE })).toMatchObject({ ok: false });
    }
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("refuses a second active cycle: the current cycle must be closed, and a concurrent reopen loses the guarded update", async () => {
    setSubmission("REVIEW_COMPLETE");
    setClosedCycle({ closed: false });
    expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "TEAM_REQUEST", note: NOTE })).toMatchObject({ ok: false, error: expect.stringMatching(/still open/) });
    expect(writeCount(h.prisma)).toBe(0);

    setClosedCycle();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 0 }); // someone else reopened first
    expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "TEAM_REQUEST", note: NOTE })).toMatchObject({ ok: false, error: expect.stringMatching(/changed meanwhile/) });
    expect(h.prisma.reviewCycle.create).not.toHaveBeenCalled();
  });

  it("validates the reason and the note, and never touches a legacy record", async () => {
    setSubmission("REVIEW_COMPLETE");
    setClosedCycle();
    expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "BECAUSE", note: NOTE })).toMatchObject({ ok: false, error: expect.stringMatching(/why/) });
    expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "TEAM_REQUEST", note: "short" })).toMatchObject({ ok: false });
    setSubmission("REVIEW_COMPLETE", "LEGACY_CLIENT_APPROVAL");
    expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "TEAM_REQUEST", note: NOTE })).toMatchObject({ ok: false });
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("ties a policy-change re-review to a real rule version, and only to a policy change", async () => {
    setSubmission("REVIEW_COMPLETE");
    setClosedCycle();
    h.prisma.policyRuleVersion.findUnique.mockResolvedValue(null);
    expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "POLICY_CHANGE", note: NOTE, triggerRuleVersionId: "ver-x" })).toMatchObject({ ok: false, error: expect.stringMatching(/doesn't exist/) });
    expect(await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "TEAM_REQUEST", note: NOTE, triggerRuleVersionId: "ver-x" })).toMatchObject({ ok: false, error: expect.stringMatching(/policy-change/) });
    expect(writeCount(h.prisma)).toBe(0);

    h.prisma.policyRuleVersion.findUnique.mockResolvedValue({ id: "ver-2", versionNumber: 2, rule: { code: "SYN-01" } });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.create.mockResolvedValue({ id: "c2", number: 2 });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r2-1" });
    expect((await cmd.openReviewCycle(TEAM, { creativeId: "s1", reason: "POLICY_CHANGE", note: NOTE, triggerRuleVersionId: "ver-2" })).ok).toBe(true);
    expect(h.prisma.reviewCycle.create.mock.calls[0][0].data).toMatchObject({ reasonKind: "POLICY_CHANGE", triggerRuleVersionId: "ver-2" });
  });
});

describe("recordExternalSubmission", () => {
  const input = { creativeId: "s1", versionId: "v2", destinationType: "AD_PLATFORM", destinationName: "Meta Ads Manager", submittedOn: "2026-10-15", platformCode: "META", marketCode: "US" };

  function completed() {
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1" }); // a closed cycle exists
    h.prisma.submissionRound.findFirst.mockResolvedValue({ versionId: "v2", cycleId: "c1" });
    h.prisma.market.findMany.mockResolvedValue([{ code: "US" }]);
    h.prisma.adPlatform.findMany.mockResolvedValue([{ code: "META" }]);
    h.prisma.externalSubmission.create.mockResolvedValue({ id: "x1" });
  }

  it("the owning client records it, always as CLIENT_REPORTED, with an activity entry", async () => {
    setSubmission("REVIEW_COMPLETE");
    completed();
    expect(await cmd.recordExternalSubmission(CLIENT_A, { ...input, basis: "TEAM_VERIFIED" })).toEqual({ ok: true, submissionId: "x1" });
    const data = h.prisma.externalSubmission.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ creativeId: "s1", versionId: "v2", cycleId: "c1", destinationType: "AD_PLATFORM", destinationName: "Meta Ads Manager", platformCode: "META", marketCode: "US", basis: "CLIENT_REPORTED", recordedById: CLIENT_A.id });
    expect(data.submittedOn.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(h.prisma.activity.create.mock.calls[0][0].data).toMatchObject({ type: "OTHER", creativeId: "s1" });
    // Only the version actually submitted for review is looked up, scoped to this creative.
    expect(h.prisma.submissionRound.findFirst.mock.calls[0][0].where).toEqual({ creativeId: "s1", versionId: "v2" });
  });

  it("TEAM records it with an explicit basis", async () => {
    setSubmission("REVIEW_COMPLETE");
    completed();
    expect(await cmd.recordExternalSubmission(TEAM, input)).toMatchObject({ ok: false, error: expect.stringMatching(/reported by the client or checked by the team/) });
    expect(await cmd.recordExternalSubmission(TEAM, { ...input, basis: "TEAM_VERIFIED" })).toEqual({ ok: true, submissionId: "x1" });
    expect(h.prisma.externalSubmission.create.mock.calls[0][0].data).toMatchObject({ basis: "TEAM_VERIFIED", recordedById: TEAM.id });
  });

  it("another client gets 'not found', and nothing is written", async () => {
    setSubmission("REVIEW_COMPLETE");
    completed();
    expect(await cmd.recordExternalSubmission(CLIENT_B, input)).toMatchObject({ ok: false });
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("needs a completed internal review first (a draft or first-time review can't be 'submitted externally')", async () => {
    setSubmission("DRAFT");
    expect(await cmd.recordExternalSubmission(CLIENT_A, input)).toMatchObject({ ok: false });
    setSubmission("IN_REVIEW");
    h.prisma.reviewCycle.findFirst.mockResolvedValue(null); // no closed cycle
    expect(await cmd.recordExternalSubmission(TEAM, { ...input, basis: "TEAM_VERIFIED" })).toMatchObject({ ok: false, error: expect.stringMatching(/internal review is complete/) });
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("allows a later record while a re-review is in progress (a closed cycle exists), on a reviewed version only", async () => {
    setSubmission("SUBMITTED");
    completed();
    h.prisma.submissionRound.findFirst.mockResolvedValue(null); // V3 was never submitted
    expect(await cmd.recordExternalSubmission(CLIENT_A, { ...input, versionId: "v3" })).toMatchObject({ ok: false, error: expect.stringMatching(/submitted for review/) });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ versionId: "v2", cycleId: "c1" });
    expect((await cmd.recordExternalSubmission(CLIENT_A, input)).ok).toBe(true);
  });

  it("validates destination, name, date and codes", async () => {
    setSubmission("REVIEW_COMPLETE");
    completed();
    expect(await cmd.recordExternalSubmission(CLIENT_A, { ...input, destinationType: "EMAIL" })).toMatchObject({ ok: false });
    expect(await cmd.recordExternalSubmission(CLIENT_A, { ...input, destinationName: "M" })).toMatchObject({ ok: false });
    expect(await cmd.recordExternalSubmission(CLIENT_A, { ...input, submittedOn: "2999-01-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/not in the future/) });
    expect(await cmd.recordExternalSubmission(CLIENT_A, { ...input, submittedOn: "15/10/2026" })).toMatchObject({ ok: false });
    h.prisma.adPlatform.findMany.mockResolvedValue([]); // "ZZ" is not an active platform
    expect(await cmd.recordExternalSubmission(CLIENT_A, { ...input, platformCode: "ZZ" })).toMatchObject({ ok: false, error: expect.stringMatching(/from the list/) });
    expect(h.prisma.adPlatform.findMany.mock.calls.at(-1)?.[0].where).toMatchObject({ code: { in: ["ZZ"] } });
    expect(writeCount(h.prisma)).toBe(0);
  });
});

describe("recordExternalOutcome", () => {
  function setExternal(creativeId = "s1") {
    h.prisma.externalSubmission.findUnique.mockResolvedValue({ id: "x1", creativeId, destinationName: "Meta Ads Manager" });
    h.prisma.externalOutcome.create.mockResolvedValue({ id: "o1" });
  }

  it("the client reports an approval; it is stored as reported, never as a Clyntique decision", async () => {
    setSubmission("REVIEW_COMPLETE");
    setExternal();
    expect(await cmd.recordExternalOutcome(CLIENT_A, { submissionId: "x1", kind: "APPROVED", outcomeOn: "2026-10-16", basis: "TEAM_VERIFIED" })).toEqual({ ok: true, outcomeId: "o1" });
    expect(h.prisma.externalOutcome.create.mock.calls[0][0].data).toMatchObject({ submissionId: "x1", kind: "APPROVED", basis: "CLIENT_REPORTED", recordedById: CLIENT_A.id, evidenceId: null });
    expect(h.prisma.reviewDecision.create).not.toHaveBeenCalled();
    expect(h.prisma.creative.updateMany).not.toHaveBeenCalled(); // the internal status never changes
  });

  it("a rejection or change request needs the reason given", async () => {
    setSubmission("REVIEW_COMPLETE");
    setExternal();
    expect(await cmd.recordExternalOutcome(CLIENT_A, { submissionId: "x1", kind: "REJECTED", outcomeOn: "2026-10-16" })).toMatchObject({ ok: false, error: expect.stringMatching(/asked for or objected to/) });
    expect(await cmd.recordExternalOutcome(CLIENT_A, { submissionId: "x1", kind: "CHANGES_REQUESTED", outcomeOn: "2026-10-16", note: "Add the licence number." })).toMatchObject({ ok: true });
  });

  it("is append-only: a second outcome is a new row, nothing is updated or deleted", async () => {
    setSubmission("REVIEW_COMPLETE");
    setExternal();
    await cmd.recordExternalOutcome(TEAM, { submissionId: "x1", kind: "CHANGES_REQUESTED", outcomeOn: "2026-10-16", note: "Add the licence number.", basis: "TEAM_VERIFIED" });
    await cmd.recordExternalOutcome(TEAM, { submissionId: "x1", kind: "APPROVED", outcomeOn: "2026-10-18", basis: "TEAM_VERIFIED" });
    expect(h.prisma.externalOutcome.create).toHaveBeenCalledTimes(2);
    expect(h.prisma.externalOutcome.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.externalOutcome.update).not.toHaveBeenCalled();
    expect(h.prisma.externalOutcome.deleteMany).not.toHaveBeenCalled();
    expect(h.prisma.externalSubmission.update).not.toHaveBeenCalled();
  });

  it("another client can't record on this submission, and an unknown submission fails cleanly", async () => {
    setSubmission("REVIEW_COMPLETE");
    setExternal();
    expect(await cmd.recordExternalOutcome(CLIENT_B, { submissionId: "x1", kind: "APPROVED", outcomeOn: "2026-10-16" })).toMatchObject({ ok: false });
    h.prisma.externalSubmission.findUnique.mockResolvedValue(null);
    expect(await cmd.recordExternalOutcome(CLIENT_A, { submissionId: "nope", kind: "APPROVED", outcomeOn: "2026-10-16" })).toMatchObject({ ok: false, error: expect.stringMatching(/no longer available/) });
    expect(writeCount(h.prisma)).toBe(0);
  });

  it("a supporting document must be this submission's own, active evidence; a client may only cite shared evidence", async () => {
    setSubmission("REVIEW_COMPLETE");
    setExternal();
    h.prisma.evidence.findFirst.mockResolvedValue(null);
    expect(await cmd.recordExternalOutcome(CLIENT_A, { submissionId: "x1", kind: "APPROVED", outcomeOn: "2026-10-16", evidenceId: "e-other" })).toMatchObject({ ok: false, error: expect.stringMatching(/supporting document/) });
    expect(h.prisma.evidence.findFirst.mock.calls[0][0].where).toEqual({ id: "e-other", creativeId: "s1", withdrawnAt: null, visibility: "SHARED" });
    h.prisma.evidence.findFirst.mockResolvedValue({ id: "e1" });
    expect(await cmd.recordExternalOutcome(TEAM, { submissionId: "x1", kind: "APPROVED", outcomeOn: "2026-10-16", evidenceId: "e1", basis: "TEAM_VERIFIED" })).toMatchObject({ ok: true });
    expect(h.prisma.evidence.findFirst.mock.calls[1][0].where).toEqual({ id: "e1", creativeId: "s1", withdrawnAt: null });
    expect(h.prisma.externalOutcome.create.mock.calls[0][0].data).toMatchObject({ evidenceId: "e1", basis: "TEAM_VERIFIED" });
  });
});
