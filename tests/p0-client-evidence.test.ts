import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_A, TEAM, createPrismaMock, installCreativeStore, type PrismaMock } from "./helpers";

// P0 (Oct 27), milestone M5: client evidence tied to a claim, tagged with its
// version and round, and the Team's assessment of it (decisions D3, D4, D5).
// Prisma is mocked; nothing connects to a database or storage.

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
const findings = await import("@/lib/workflow/findings");
const reviewData = await import("@/lib/data/submission-review");
const { EVIDENCE_ASSESSMENT_LABEL, EVIDENCE_ASSESSMENT_NOTICE } = await import("@/lib/workflow/labels");

const SUBMITTED_AT = new Date("2026-10-10T10:00:00Z");

function setSubmission(status: string) {
  h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "Spring promo", workflow: "SUBMISSION_REVIEW", status, projectId: "p-a", project: { clientId: CLIENT_A.id } });
}

function setRound({ closed = false } = {}) {
  h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: closed ? new Date() : null });
  h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v1", decisions: [], submittedAt: SUBMITTED_AT });
  h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v1", versionNumber: 1 });
}

function setEvidence(over: Record<string, unknown> = {}) {
  h.prisma.evidence.findUnique.mockResolvedValue({
    id: "e1",
    creativeId: "s1",
    origin: "CLIENT_SUBMITTED",
    withdrawnAt: null,
    createdAt: new Date("2026-10-09T10:00:00Z"),
    ...over,
  });
}

beforeEach(() => {
  h.prisma = createPrismaMock();
});

describe("client evidence for a claim (decision D3)", () => {
  const EVIDENCE = { creativeId: "s1", title: "Clinical study", type: "CLINICAL_STUDY", description: "Split-face study, 40 participants." };

  it("records the claim it supports and where the claim appears, with the version it was added with", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.evidence.create.mockResolvedValue({ id: "e1" });
    const res = await cmd.addEvidence(CLIENT_A, { ...EVIDENCE, claimText: "  Visible results in 2 weeks ", claimLocation: "Headline" });
    expect(res).toEqual({ ok: true, evidenceId: "e1" });
    expect(h.prisma.evidence.create.mock.calls[0][0].data).toMatchObject({
      claimText: "Visible results in 2 weeks",
      claimLocation: "Headline",
      versionId: "v1",
      origin: "CLIENT_SUBMITTED",
      visibility: "SHARED",
    });
  });

  it("the claim is optional; over-long claims and the reviewer-only policy reference type are refused", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.evidence.create.mockResolvedValue({ id: "e1" });
    expect((await cmd.addEvidence(CLIENT_A, EVIDENCE)).ok).toBe(true);
    expect(h.prisma.evidence.create.mock.calls[0][0].data).toMatchObject({ claimText: null, claimLocation: null });
    expect((await cmd.addEvidence(CLIENT_A, { ...EVIDENCE, claimText: "x".repeat(301) })).ok).toBe(false);
    expect((await cmd.addEvidence(CLIENT_A, { ...EVIDENCE, type: "POLICY_REFERENCE" })).ok).toBe(false);
    expect(h.prisma.evidence.create).toHaveBeenCalledTimes(1);
  });
});

describe("Team assessment of client evidence (decision D5)", () => {
  function ready() {
    setSubmission("IN_REVIEW");
    setRound();
    setEvidence();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 }); // row lock
    h.prisma.evidenceAssessment.create.mockResolvedValue({ id: "as1" });
  }

  it("a TEAM reviewer records an assessment for the open cycle, append-only", async () => {
    ready();
    expect(await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "ACCEPTED_FOR_REVIEW" })).toEqual({ ok: true, assessmentId: "as1" });
    expect(h.prisma.evidenceAssessment.create.mock.calls[0][0].data).toEqual({ evidenceId: "e1", cycleId: "c1", reviewerId: TEAM.id, result: "ACCEPTED_FOR_REVIEW", note: null });
    expect(h.prisma.creative.updateMany.mock.calls[0][0].where).toMatchObject({ id: "s1", status: "IN_REVIEW" });
    // No update or delete path exists for assessments.
    expect(h.prisma.evidenceAssessment.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.evidenceAssessment.deleteMany).not.toHaveBeenCalled();
  });

  it("anything short of accepted needs a note telling the client what is missing", async () => {
    ready();
    expect(await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "INSUFFICIENT" })).toMatchObject({ ok: false, error: expect.stringMatching(/Explain what is missing/) });
    expect((await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "INSUFFICIENT", note: "The study doesn't cover the 2-week claim." })).ok).toBe(true);
    expect((await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "VALIDATED" })).ok).toBe(false);
  });

  it("clients can't assess, and nothing is assessed outside an active review", async () => {
    ready();
    expect((await cmd.assessEvidence(CLIENT_A, { evidenceId: "e1", result: "ACCEPTED_FOR_REVIEW" })).ok).toBe(false);
    setSubmission("CHANGES_REQUESTED");
    expect((await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "ACCEPTED_FOR_REVIEW" })).ok).toBe(false);
    setSubmission("IN_REVIEW");
    setRound({ closed: true });
    expect((await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "ACCEPTED_FOR_REVIEW" })).ok).toBe(false);
    expect(h.prisma.evidenceAssessment.create).not.toHaveBeenCalled();
  });

  it("only submitted, not withdrawn client evidence can be assessed", async () => {
    ready();
    setEvidence({ origin: "REVIEWER_ADDED" });
    expect((await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "ACCEPTED_FOR_REVIEW" })).ok).toBe(false);
    setEvidence({ withdrawnAt: new Date() });
    expect((await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "ACCEPTED_FOR_REVIEW" })).ok).toBe(false);
    // Added after the last submission: the team hasn't received it, so it doesn't exist for them.
    setEvidence({ createdAt: new Date("2026-10-11T10:00:00Z") });
    expect(await cmd.assessEvidence(TEAM, { evidenceId: "e1", result: "ACCEPTED_FOR_REVIEW" })).toEqual({ ok: false, error: "This evidence is no longer available." });
    expect(h.prisma.evidenceAssessment.create).not.toHaveBeenCalled();
  });
});

describe("evidence tags and assessment visibility", () => {
  it("tags evidence with the cycle and round it was first submitted with, across cycles", () => {
    const rounds = [
      { number: 1, cycleNumber: 1, submittedAt: new Date("2026-10-01") },
      { number: 2, cycleNumber: 1, submittedAt: new Date("2026-10-05") },
      { number: 1, cycleNumber: 2, submittedAt: new Date("2026-10-20") },
    ];
    expect(findings.submittedIn(new Date("2026-10-03"), rounds)).toEqual({ cycleNumber: 1, roundNumber: 2 });
    expect(findings.submittedIn(new Date("2026-10-10"), rounds)).toEqual({ cycleNumber: 2, roundNumber: 1 });
    expect(findings.submittedIn(new Date("2026-10-21"), rounds)).toBeNull();
  });

  it("a client sees an assessment only once a decision was published after it", () => {
    const assessed = new Date("2026-10-10T12:00:00Z");
    expect(findings.publishedWithDecision(assessed, [])).toBe(false);
    expect(findings.publishedWithDecision(assessed, [new Date("2026-10-09T12:00:00Z")])).toBe(false);
    expect(findings.publishedWithDecision(assessed, [new Date("2026-10-10T13:00:00Z")])).toBe(true);
  });

  it("wording never claims scientific, legal or platform validation (C4)", () => {
    const words = Object.values(EVIDENCE_ASSESSMENT_LABEL).join(" ");
    expect(words).not.toMatch(/validat|verified|approved|cleared|compliant/i);
    expect(EVIDENCE_ASSESSMENT_NOTICE).toMatch(/not a scientific, legal, regulatory or platform validation/);
  });

  describe("review loader", () => {
    beforeEach(() => {
      installCreativeStore(h.prisma);
      h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: null, rounds: [{ id: "r1", number: 1, note: null, submittedAt: SUBMITTED_AT, submittedBy: { name: "Client A" }, versionId: "v1", version: { id: "v1", versionNumber: 1, mediaType: "IMAGE", fileName: null, changeNotes: null }, decisions: [] }] });
      h.prisma.submissionRound.findMany.mockResolvedValue([{ number: 1, submittedAt: SUBMITTED_AT, cycle: { number: 1 } }]);
      h.prisma.evidence.findMany.mockResolvedValue([
        {
          id: "e1",
          title: "Clinical study",
          type: "CLINICAL_STUDY",
          description: null,
          source: null,
          url: null,
          origin: "CLIENT_SUBMITTED",
          visibility: "SHARED",
          withdrawnAt: null,
          withdrawnBy: null,
          createdAt: new Date("2026-10-09T10:00:00Z"),
          addedById: CLIENT_A.id,
          fileName: null,
          fileSize: null,
          mimeType: null,
          fileUrl: null,
          addedBy: { name: "Client A" },
          findings: [],
          claimText: "Visible results in 2 weeks",
          claimLocation: "Headline",
          version: { versionNumber: 1 },
          assessments: [
            { id: "as1", result: "INSUFFICIENT", note: "Covers 4 weeks, not 2.", createdAt: new Date("2026-10-11T10:00:00Z"), reviewer: { name: "Dana Reviewer" }, cycle: { number: 1 } },
            { id: "as2", result: "ACCEPTED_FOR_REVIEW", note: null, createdAt: new Date("2026-10-13T10:00:00Z"), reviewer: { name: "Dana Reviewer" }, cycle: { number: 1 } },
          ],
        },
      ]);
      // One decision, published between the two assessments.
      h.prisma.reviewDecision.findMany.mockResolvedValue([
        { id: "d1", kind: "CHANGES_REQUESTED", outcome: null, summary: "s", scopeNote: null, createdAt: new Date("2026-10-12T10:00:00Z"), version: { versionNumber: 1 }, round: { number: 1 }, cycle: { number: 1 }, reviewer: { name: "Dana Reviewer" } },
      ]);
    });

    it("TEAM sees every assessment with the reviewer's name, plus the claim and tags", async () => {
      const review = await reviewData.getSubmissionReview(TEAM, "sub-a-review");
      const e = review!.evidence[0];
      expect(e).toMatchObject({ claimText: "Visible results in 2 weeks", claimLocation: "Headline", versionNumber: 1, submittedIn: { cycleNumber: 1, roundNumber: 1 } });
      expect(e.assessments.map((a) => [a.id, a.reviewerName])).toEqual([
        ["as1", "Dana Reviewer"],
        ["as2", "Dana Reviewer"],
      ]);
      expect(e.assessable).toBe(true);
    });

    it("the client sees only assessments published with a later decision, as “Clyntique reviewer”", async () => {
      const review = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
      const e = review!.evidence[0];
      expect(e.assessments).toEqual([
        { id: "as1", result: "INSUFFICIENT", note: "Covers 4 weeks, not 2.", reviewerName: "Clyntique reviewer", cycleNumber: 1, createdAt: new Date("2026-10-11T10:00:00Z") },
      ]);
      expect(JSON.stringify(review)).not.toContain("Dana Reviewer");
      expect(e.assessable).toBe(false);
    });
  });
});
