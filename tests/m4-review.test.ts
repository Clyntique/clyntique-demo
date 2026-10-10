import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, form, installCreativeStore, type PrismaMock } from "./helpers";

// M4: internal review wired into the app. Prisma is mocked; nothing connects.

const h = vi.hoisted(() => ({ user: null as CurrentUser | null, prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: vi.fn(async () => h.user) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

const cmd = await import("@/lib/workflow/commands");
const queue = await import("@/lib/data/review-queue");
const reviewData = await import("@/lib/data/submission-review");
const actions = await import("@/app/admin/review/actions");

const SUMMARY = "Two claims need substantiation before this can run.";
const FINDING = {
  issue: "Unsupported “clinically proven” claim",
  explanation: "The headline states a clinical result without a cited study.",
  severity: "HIGH",
  requiredAction: "PROVIDE_EVIDENCE",
  actionDetails: "Provide the study, or remove the claim.",
};

function setSubmission(status: string, workflow = "SUBMISSION_REVIEW", clientId = CLIENT_A.id) {
  h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "Spring promo", workflow, status, projectId: "p-a", project: { clientId } });
}

function setRound() {
  h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: null });
  h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v1", decisions: [] });
  h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v1", versionNumber: 1 });
}

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.user = null;
});

describe("review queue", () => {
  it("is TEAM-only and never includes drafts or legacy records", async () => {
    expect(await queue.getReviewQueue(CLIENT_A)).toEqual([]);
    expect(h.prisma.creative.findMany).not.toHaveBeenCalled();
    await queue.getReviewQueue(TEAM);
    expect(h.prisma.creative.findMany.mock.calls[0][0].where).toEqual({ workflow: "SUBMISSION_REVIEW", status: { in: ["SUBMITTED", "IN_REVIEW"] } });
  });

  it("orders by the current round's submission time, oldest first", async () => {
    const row = (id: string, at: string) => ({
      id,
      name: id,
      status: "SUBMITTED",
      format: "FEED",
      project: { id: "p", name: "P", client: { name: "Client" } },
      markets: [],
      platforms: [],
      rounds: [{ number: 1, submittedAt: new Date(at), submittedBy: { name: "Client" }, version: { versionNumber: 1 } }],
      versions: [],
      _count: { findings: 0 },
    });
    h.prisma.creative.findMany.mockResolvedValue([row("newer", "2026-10-10T12:00:00Z"), row("older", "2026-10-09T12:00:00Z")]);
    expect((await queue.getReviewQueue(TEAM)).map((q) => q.id)).toEqual(["older", "newer"]);
  });

  it("summary counts are TEAM-only", async () => {
    expect(await queue.getReviewSummary(CLIENT_A)).toEqual({ waiting: 0, inReview: 0, changesRequested: 0, completedThisWeek: 0 });
    expect(h.prisma.creative.groupBy).not.toHaveBeenCalled();
  });
});

describe("finding visibility in the data layer", () => {
  beforeEach(() => installCreativeStore(h.prisma));

  it("a CLIENT's query never asks for draft or unpublished findings, or internal evidence", async () => {
    await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
    expect(h.prisma.finding.findMany.mock.calls[0][0].where).toEqual({ creativeId: "sub-a-review", status: { not: "DRAFT" }, publishedAt: { not: null } });
    expect(h.prisma.evidence.findMany.mock.calls[0][0].where).toEqual({ creativeId: "sub-a-review", visibility: "SHARED" });
  });

  it("a CLIENT gets no findings at all while their submission is still a draft", async () => {
    const r = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-draft");
    expect(r?.findings).toEqual([]);
    expect(h.prisma.finding.findMany).not.toHaveBeenCalled();
  });

  it("another client gets nothing, and TEAM never gets a client draft", async () => {
    expect(await reviewData.getSubmissionReview(CLIENT_B, "sub-a-review")).toBeNull();
    expect(await reviewData.getSubmissionReview(TEAM, "sub-a-draft")).toBeNull();
    expect(h.prisma.finding.findMany).not.toHaveBeenCalled();
  });

  it("TEAM gets all findings plus outcome availability; a CLIENT gets no outcome data", async () => {
    h.prisma.reviewCycle.findFirst.mockResolvedValue({
      id: "c1",
      number: 1,
      closedAt: null,
      rounds: [{ id: "r1", number: 1, versionId: "v1", version: { versionNumber: 1 }, decisions: [] }],
    });
    h.prisma.finding.findMany.mockResolvedValue([
      {
        id: "f1",
        issue: "i",
        explanation: "e",
        severity: "HIGH",
        requiredAction: "CLARIFY",
        actionDetails: "a",
        status: "DRAFT",
        createdAt: new Date(),
        publishedAt: null,
        resolutionNote: null,
        version: { versionNumber: 1 },
        cycle: { number: 1 },
        createdBy: { name: "Reviewer" },
        markets: [],
        platforms: [],
      },
    ]);
    const team = await reviewData.getSubmissionReview(TEAM, "sub-a-review");
    expect(h.prisma.finding.findMany.mock.calls[0][0].where).toEqual({ creativeId: "sub-a-review" });
    // With one draft left, nothing can be completed until it is dismissed or shared.
    expect(team?.outcomes?.asIs.NO_ISSUES_IDENTIFIED.ok).toBe(false);
    expect(team?.outcomes?.withDrafts.COMPLETED_WITH_OPEN_ISSUES.ok).toBe(true);
    const client = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
    expect(client?.outcomes).toBeNull();
  });
});

describe("draft findings", () => {
  it("TEAM can edit a draft finding; the edit is recorded in its history", async () => {
    setSubmission("IN_REVIEW");
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "DRAFT" });
    h.prisma.finding.updateMany.mockResolvedValue({ count: 1 });
    expect(await cmd.updateDraftFinding(TEAM, { findingId: "f1", ...FINDING, severity: "MEDIUM" })).toEqual({ ok: true });
    expect(h.prisma.finding.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "f1", status: "DRAFT" }, data: { severity: "MEDIUM" } });
    expect(h.prisma.findingEvent.create.mock.calls[0][0].data).toMatchObject({ fromStatus: "DRAFT", toStatus: "DRAFT", actorId: TEAM.id, note: "Edited" });
  });

  it("published findings can't be edited, and clients can't edit findings", async () => {
    setSubmission("IN_REVIEW");
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "OPEN" });
    expect((await cmd.updateDraftFinding(TEAM, { findingId: "f1", ...FINDING })).ok).toBe(false);
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "DRAFT" });
    expect((await cmd.updateDraftFinding(CLIENT_A, { findingId: "f1", ...FINDING })).ok).toBe(false);
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it("findings are never published one by one (only via request changes or completion)", async () => {
    setSubmission("IN_REVIEW");
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "DRAFT" });
    const result = await cmd.reviewFinding(TEAM, { findingId: "f1", move: "PUBLISH" as never });
    expect(result.ok).toBe(false);
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it("dismissing a draft finding needs a reason and is recorded", async () => {
    setSubmission("IN_REVIEW");
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "DRAFT" });
    expect((await cmd.reviewFinding(TEAM, { findingId: "f1", move: "DISMISS", note: "" })).ok).toBe(false);
    h.prisma.finding.updateMany.mockResolvedValue({ count: 1 });
    expect(await cmd.reviewFinding(TEAM, { findingId: "f1", move: "DISMISS", note: "Not applicable" })).toEqual({ ok: true });
    expect(h.prisma.findingEvent.create.mock.calls[0][0].data).toMatchObject({ fromStatus: "DRAFT", toStatus: "DISMISSED", note: "Not applicable" });
  });
});

describe("completing a review with draft findings", () => {
  beforeEach(() => {
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.finding.findMany.mockResolvedValue([{ id: "f1", status: "DRAFT", severity: "HIGH" }]);
  });

  it("is refused while drafts are neither dismissed nor explicitly shared", async () => {
    const result = await cmd.completeReview(TEAM, { creativeId: "s1", roundId: "r1", versionId: "v1", outcome: "COMPLETED_WITH_OPEN_ISSUES", summary: SUMMARY });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/draft findings/) });
    expect(h.prisma.reviewDecision.create).not.toHaveBeenCalled();
  });

  it("shares the drafts with the outcome when explicitly asked, and records a FINAL decision", async () => {
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.finding.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.updateMany.mockResolvedValue({ count: 1 });
    const result = await cmd.completeReview(TEAM, {
      creativeId: "s1",
      roundId: "r1",
      versionId: "v1",
      outcome: "COMPLETED_WITH_OPEN_ISSUES",
      summary: SUMMARY,
      publishDrafts: true,
    });
    expect(result).toEqual({ ok: true });
    expect(h.prisma.finding.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["f1"] }, status: "DRAFT" }, data: { status: "OPEN" } });
    expect(h.prisma.reviewDecision.create.mock.calls[0][0].data).toMatchObject({ kind: "FINAL", outcome: "COMPLETED_WITH_OPEN_ISSUES", versionId: "v1", roundId: "r1", reviewerId: TEAM.id });
    const types = h.prisma.activity.create.mock.calls.map((c) => c[0].data.type);
    expect(types).toEqual(["FINDING_RECORDED", "REVIEW_COMPLETED"]);
  });

  it("can't claim “No issues identified” by sharing drafts", async () => {
    const result = await cmd.completeReview(TEAM, { creativeId: "s1", roundId: "r1", versionId: "v1", outcome: "NO_ISSUES_IDENTIFIED", summary: SUMMARY, publishDrafts: true });
    expect(result.ok).toBe(false);
  });

  it("“No issues identified” works after the draft is dismissed", async () => {
    h.prisma.finding.findMany.mockResolvedValue([{ id: "f1", status: "DISMISSED", severity: "HIGH" }]);
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.updateMany.mockResolvedValue({ count: 1 });
    expect(await cmd.completeReview(TEAM, { creativeId: "s1", roundId: "r1", versionId: "v1", outcome: "NO_ISSUES_IDENTIFIED", summary: SUMMARY })).toEqual({ ok: true });
  });
});

describe("request changes", () => {
  it("records that findings were shared in the activity log", async () => {
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.finding.findMany.mockResolvedValue([{ id: "f1", status: "DRAFT", severity: "HIGH" }, { id: "f2", status: "DRAFT", severity: "LOW" }]);
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.finding.updateMany.mockResolvedValue({ count: 2 });
    expect(await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r1", versionId: "v1", summary: SUMMARY })).toEqual({ ok: true });
    const messages = h.prisma.activity.create.mock.calls.map((c) => c[0].data);
    expect(messages[0]).toMatchObject({ type: "FINDING_RECORDED", message: expect.stringMatching(/2 findings shared/) });
    expect(messages[1]).toMatchObject({ type: "CHANGES_REQUESTED" });
  });

  it("rolls back if a draft changed meanwhile (published count mismatch)", async () => {
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.finding.findMany.mockResolvedValue([{ id: "f1", status: "DRAFT", severity: "HIGH" }]);
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.finding.updateMany.mockResolvedValue({ count: 0 });
    expect((await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r1", versionId: "v1", summary: SUMMARY })).ok).toBe(false);
    expect(h.prisma.reviewDecision.create).not.toHaveBeenCalled();
  });
});

describe("review form actions", () => {
  it("refuse signed-out users and clients", async () => {
    expect((await actions.startReviewAction(undefined, form({ creativeId: "s1" })))?.error).toMatch(/sign in/);
    h.user = CLIENT_A;
    setSubmission("SUBMITTED");
    expect((await actions.startReviewAction(undefined, form({ creativeId: "s1" })))?.error).toBeDefined();
    expect((await actions.addFindingAction(undefined, form({ creativeId: "s1", ...FINDING })))?.error).toBeDefined();
    expect(h.prisma.creative.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.finding.create).not.toHaveBeenCalled();
  });

  it("addFindingAction creates a DRAFT finding for TEAM and keeps values on error", async () => {
    h.user = TEAM;
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.finding.create.mockResolvedValue({ id: "f-new" });
    expect((await actions.addFindingAction(undefined, form({ creativeId: "s1", ...FINDING })))?.ok).toMatch(/Only the team can see it/);
    expect(h.prisma.finding.create.mock.calls[0][0].data).toMatchObject({ status: "DRAFT", createdById: TEAM.id, versionId: "v1", severity: "HIGH", requiredAction: "PROVIDE_EVIDENCE" });

    const bad = await actions.addFindingAction(undefined, form({ creativeId: "s1", ...FINDING, severity: "SEVERE" }));
    expect(bad?.error).toMatch(/severity/);
    expect(bad?.values).toMatchObject({ issue: FINDING.issue });
  });

  it("completeReviewAction passes the explicit share-drafts choice through", async () => {
    h.user = TEAM;
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.finding.findMany.mockResolvedValue([{ id: "f1", status: "DRAFT", severity: "HIGH" }]);
    const result = await actions.completeReviewAction(
      undefined,
      form({ creativeId: "s1", roundId: "r1", versionId: "v1", outcome: "COMPLETED_WITH_OPEN_ISSUES", summary: SUMMARY }),
    );
    expect(result?.error).toMatch(/draft findings/); // not shared, so refused
  });
});

describe("copy fixes", () => {
  it("names the project, not a submission, when a project isn't available", async () => {
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    expect(await cmd.createDraft(CLIENT_B, { projectId: "p-a", name: "Mine", format: "FEED" })).toEqual({ ok: false, error: "This project isn't available." });
  });
});
