import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, CREATIVES, TEAM, createPrismaMock, form, installCreativeStore, type PrismaMock } from "./helpers";

// M5: client responses, evidence, resubmission and round-2 review.
// Prisma and Blob are mocked; nothing connects to a database or storage.

const h = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  prisma: null as unknown as PrismaMock,
  head: null as unknown as Mock,
  matches: null as unknown as Mock,
  del: null as unknown as Mock,
  readBlob: null as unknown as Mock,
}));
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
vi.mock("@/lib/review/blob", () => ({
  uploadsConfigured: () => true,
  isPrivateBlobUrl: (u: string) => u.startsWith("https://x.private.blob.vercel-storage.com/"),
  headBlob: (...a: unknown[]) => h.head(...a),
  contentMatches: (...a: unknown[]) => h.matches(...a),
  deleteUnreferencedBlob: (...a: unknown[]) => h.del(...a),
  readBlob: (...a: unknown[]) => h.readBlob(...a),
}));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(
    async ({ body, onBeforeGenerateToken }: { body: { payload: { pathname: string; clientPayload: string } }; onBeforeGenerateToken: (p: string, c: string) => Promise<unknown> }) => {
      const options = await onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload);
      return { type: "blob.generate-client-token", clientToken: "test-token", options };
    },
  ),
}));

const cmd = await import("@/lib/workflow/commands");
const findings = await import("@/lib/workflow/findings");
const reviewData = await import("@/lib/data/submission-review");
const clientActions = await import("@/app/dashboard/submissions/actions");
const evidenceUpload = await import("@/app/api/evidence/upload/route");
const evidenceMedia = await import("@/app/api/media/evidence/[evidenceId]/route");

const KEY = "00000000-0000-4000-8000-000000000000";
const BLOB = (path: string) => `https://x.private.blob.vercel-storage.com/${path}`;
const MB = 1024 * 1024;

// A submission with changes requested, for the in-memory store used by the routes.
if (!CREATIVES.some((c) => c.id === "sub-a-changes")) {
  CREATIVES.push({ id: "sub-a-changes", name: "A changes requested", status: "CHANGES_REQUESTED", workflow: "SUBMISSION_REVIEW", projectId: "p-a", clientId: CLIENT_A.id });
}

function setSubmission(status: string, workflow = "SUBMISSION_REVIEW", clientId = CLIENT_A.id) {
  h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "Spring promo", workflow, status, projectId: "p-a", project: { clientId } });
}

function setRound({ number = 1, closed = false, latest = 2 } = {}) {
  h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: closed ? new Date() : null });
  h.prisma.submissionRound.findFirst.mockResolvedValue({ id: `r${number}`, number, versionId: `v${latest}`, decisions: [], submittedAt: new Date("2026-10-10T10:00:00Z") });
  h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: `v${latest}`, versionNumber: latest });
}

const TEXT_EVIDENCE = { creativeId: "s1", title: "Price history", type: "STATISTIC", description: "Regular price was $50 from March to May." };

function evidenceWrites(p: PrismaMock) {
  return p.evidence.create.mock.calls.length + p.evidence.updateMany.mock.calls.length + p.findingEvidence.createMany.mock.calls.length;
}

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.user = null;
  h.head = vi.fn(async () => null);
  h.matches = vi.fn(async () => true);
  h.del = vi.fn(async () => true);
  h.readBlob = vi.fn(async () => ({ statusCode: 200, stream: new ReadableStream(), headers: new Headers() }));
});

// ---------------------------------------------------------------------------

describe("adding evidence", () => {
  it("the owning client adds shared, client-submitted evidence while changes are requested", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.evidence.create.mockResolvedValue({ id: "e1" });
    expect(await cmd.addEvidence(CLIENT_A, TEXT_EVIDENCE)).toEqual({ ok: true, evidenceId: "e1" });
    expect(h.prisma.evidence.create.mock.calls[0][0].data).toMatchObject({
      creativeId: "s1",
      origin: "CLIENT_SUBMITTED",
      visibility: "SHARED",
      addedById: CLIENT_A.id,
      versionId: "v2",
      fileUrl: null,
    });
    expect(h.prisma.activity.create.mock.calls[0][0].data).toMatchObject({ type: "EVIDENCE_SUBMITTED", userId: CLIENT_A.id });
  });

  it("is refused for another client, for TEAM, for legacy records and once submitted", async () => {
    setSubmission("CHANGES_REQUESTED");
    expect((await cmd.addEvidence(CLIENT_B, TEXT_EVIDENCE)).ok).toBe(false);
    expect((await cmd.addEvidence(TEAM, TEXT_EVIDENCE)).ok).toBe(false);
    for (const status of ["SUBMITTED", "IN_REVIEW", "REVIEW_COMPLETE"]) {
      setSubmission(status);
      expect((await cmd.addEvidence(CLIENT_A, TEXT_EVIDENCE)).ok).toBe(false);
    }
    setSubmission("CHANGES_REQUESTED", "LEGACY_CLIENT_APPROVAL");
    expect((await cmd.addEvidence(CLIENT_A, TEXT_EVIDENCE)).ok).toBe(false);
    expect(evidenceWrites(h.prisma)).toBe(0);
  });

  it("needs a file, a link or a description, and only accepts web links", async () => {
    setSubmission("CHANGES_REQUESTED");
    expect(await cmd.addEvidence(CLIENT_A, { creativeId: "s1", title: "Empty", type: "OTHER" })).toMatchObject({ ok: false, error: expect.stringMatching(/Attach a file/) });
    expect((await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, url: "javascript:alert(1)" })).ok).toBe(false);
    expect((await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, type: "MADE_UP" })).ok).toBe(false);
    expect(evidenceWrites(h.prisma)).toBe(0);
  });

  it("links only to published findings of the open cycle that still await a response or decision", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.finding.count.mockResolvedValue(1);
    const r = await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, findingIds: ["f1", "f-other"] });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/aren't open/) });
    expect(h.prisma.finding.count.mock.calls[0][0].where).toMatchObject({
      creativeId: "s1",
      cycleId: "c1",
      status: { in: ["OPEN", "RESPONDED"] },
      publishedAt: { not: null },
    });
    expect(evidenceWrites(h.prisma)).toBe(0);
  });

  describe("with a file", () => {
    const file = (name = "study.pdf", path = `evidence/s1/${KEY}-abc.pdf`) => ({ uploadKey: KEY, url: BLOB(path), fileName: name });

    it("records a verified PDF in private storage", async () => {
      setSubmission("CHANGES_REQUESTED");
      setRound();
      h.head.mockResolvedValue({ pathname: `evidence/s1/${KEY}-abc.pdf`, size: 2 * MB, contentType: "application/pdf" });
      h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
      h.prisma.evidence.create.mockResolvedValue({ id: "e1" });
      expect((await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, file: file() })).ok).toBe(true);
      expect(h.matches).toHaveBeenCalledWith(BLOB(`evidence/s1/${KEY}-abc.pdf`), "application/pdf");
      expect(h.prisma.evidence.create.mock.calls[0][0].data).toMatchObject({ fileName: "study.pdf", mimeType: "application/pdf", fileSize: 2 * MB });
    });

    it("rejects a file stored under another path or another submission", async () => {
      setSubmission("CHANGES_REQUESTED");
      h.head.mockResolvedValue({ pathname: `evidence/other/${KEY}-abc.pdf`, size: 1000, contentType: "application/pdf" });
      expect((await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, file: file("study.pdf", `evidence/other/${KEY}-abc.pdf`) })).ok).toBe(false);
      h.head.mockResolvedValue({ pathname: `creatives/s1/${KEY}-abc.pdf`, size: 1000, contentType: "application/pdf" });
      expect((await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, file: file("study.pdf", `creatives/s1/${KEY}-abc.pdf`) })).ok).toBe(false);
      expect(evidenceWrites(h.prisma)).toBe(0);
    });

    it("rejects and deletes files over 10 MB, or whose bytes don't match the type", async () => {
      setSubmission("CHANGES_REQUESTED");
      h.head.mockResolvedValue({ pathname: `evidence/s1/${KEY}-abc.pdf`, size: 10 * MB + 1, contentType: "application/pdf" });
      expect(await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, file: file() })).toMatchObject({ ok: false, error: expect.stringMatching(/10 MB/) });
      h.head.mockResolvedValue({ pathname: `evidence/s1/${KEY}-abc.pdf`, size: 1000, contentType: "application/pdf" });
      h.matches.mockResolvedValue(false);
      expect(await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, file: file() })).toMatchObject({ ok: false, error: expect.stringMatching(/valid PDF/) });
      expect(h.del).toHaveBeenCalledTimes(2);
      expect(evidenceWrites(h.prisma)).toBe(0);
    });

    it("rejects unsupported types and public or foreign URLs before touching storage", async () => {
      setSubmission("CHANGES_REQUESTED");
      expect((await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, file: file("clip.mp4", `evidence/s1/${KEY}.mp4`) })).ok).toBe(false);
      expect((await cmd.addEvidence(CLIENT_A, { ...TEXT_EVIDENCE, file: { uploadKey: KEY, url: "https://example.com/x.pdf", fileName: "x.pdf" } })).ok).toBe(false);
      expect(h.head).not.toHaveBeenCalled();
    });
  });
});

describe("withdrawing evidence", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "e1",
    creativeId: "s1",
    title: "Price history",
    origin: "CLIENT_SUBMITTED",
    addedById: CLIENT_A.id,
    withdrawnAt: null,
    createdAt: new Date("2026-10-10T12:00:00Z"),
    ...over,
  });

  it("records the withdrawal (never a delete) for evidence added since the last submission", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound(); // last round submitted 10:00
    h.prisma.evidence.findUnique.mockResolvedValue(row());
    h.prisma.evidence.updateMany.mockResolvedValue({ count: 1 });
    expect(await cmd.withdrawEvidence(CLIENT_A, "e1")).toEqual({ ok: true });
    const call = h.prisma.evidence.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "e1", withdrawnAt: null, addedById: CLIENT_A.id });
    expect(call.data).toMatchObject({ withdrawnById: CLIENT_A.id });
    expect(h.prisma.evidence.deleteMany).not.toHaveBeenCalled();
    expect(h.prisma.findingEvidence.deleteMany).not.toHaveBeenCalled();
  });

  it("evidence that was part of a submitted round is final", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.evidence.findUnique.mockResolvedValue(row({ createdAt: new Date("2026-10-10T09:00:00Z") }));
    expect(await cmd.withdrawEvidence(CLIENT_A, "e1")).toMatchObject({ ok: false, error: expect.stringMatching(/stays in the record/) });
    expect(h.prisma.evidence.updateMany).not.toHaveBeenCalled();
  });

  it("only the client who added it can withdraw it, and never reviewer evidence or TEAM", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.evidence.findUnique.mockResolvedValue(row({ addedById: "someone-else" }));
    expect((await cmd.withdrawEvidence(CLIENT_A, "e1")).ok).toBe(false);
    h.prisma.evidence.findUnique.mockResolvedValue(row({ origin: "REVIEWER_ADDED" }));
    expect((await cmd.withdrawEvidence(CLIENT_A, "e1")).ok).toBe(false);
    h.prisma.evidence.findUnique.mockResolvedValue(row());
    expect((await cmd.withdrawEvidence(CLIENT_B, "e1")).ok).toBe(false);
    expect((await cmd.withdrawEvidence(TEAM, "e1")).ok).toBe(false);
    h.prisma.evidence.findUnique.mockResolvedValue(row({ withdrawnAt: new Date() }));
    expect((await cmd.withdrawEvidence(CLIENT_A, "e1")).ok).toBe(false);
    expect(h.prisma.evidence.updateMany).not.toHaveBeenCalled();
  });

  it("is closed once resubmitted", async () => {
    setSubmission("SUBMITTED");
    h.prisma.evidence.findUnique.mockResolvedValue(row());
    expect((await cmd.withdrawEvidence(CLIENT_A, "e1")).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("responses", () => {
  it("can't target a finding of an earlier, closed cycle", async () => {
    setSubmission("CHANGES_REQUESTED");
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c2", number: 2, closedAt: null });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v3", decisions: [] });
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", cycleId: "c1", status: "OPEN", publishedAt: new Date() });
    expect((await cmd.respondToFinding(CLIENT_A, { findingId: "f1", message: "Done" })).ok).toBe(false);
    expect(h.prisma.findingResponse.create).not.toHaveBeenCalled();
  });

  it("are added, never edited: the form action creates a new response each time", async () => {
    h.user = CLIENT_A;
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", cycleId: "c1", status: "RESPONDED", publishedAt: new Date() });
    expect(await clientActions.respondToFindingAction(undefined, form({ findingId: "f1", message: "Updated the headline." }))).toEqual({ ok: "Response added." });
    expect(await clientActions.respondToFindingAction(undefined, form({ findingId: "f1", message: "Also removed the claim." }))).toEqual({ ok: "Response added." });
    expect(h.prisma.findingResponse.create).toHaveBeenCalledTimes(2);
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled(); // already RESPONDED: no status change
  });
});

describe("resubmission readiness", () => {
  function request(versionNumber: number) {
    h.prisma.reviewDecision.findFirst.mockResolvedValue({ createdAt: new Date("2026-10-10T11:00:00Z"), version: { versionNumber } });
  }
  const finding = (over: Record<string, unknown> = {}) => ({
    id: "f1",
    status: "OPEN",
    severity: "LOW",
    requiredAction: "CLARIFY",
    version: { versionNumber: 1 },
    _count: { responses: 0, evidence: 0 },
    ...over,
  });

  it("counts only responses and evidence links since the latest change request", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    request(2);
    h.prisma.finding.findMany.mockResolvedValue([finding()]);
    expect((await cmd.resubmit(CLIENT_A, "s1")).ok).toBe(false);
    const counts = h.prisma.finding.findMany.mock.calls[0][0].select._count.select;
    expect(counts.responses.where).toMatchObject({ author: { role: "CLIENT" }, createdAt: { gt: new Date("2026-10-10T11:00:00Z") } });
    expect(counts.evidence.where).toMatchObject({ linkedAt: { gt: new Date("2026-10-10T11:00:00Z") }, evidence: { withdrawnAt: null, visibility: "SHARED" } });
    expect(h.prisma.creative.updateMany).not.toHaveBeenCalled();
  });

  it("an advisory finding needs a response too", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound();
    request(2);
    h.prisma.finding.findMany.mockResolvedValue([finding({ severity: "ADVISORY", requiredAction: "ACKNOWLEDGE" })]);
    expect((await cmd.resubmit(CLIENT_A, "s1")).ok).toBe(false);
  });

  it("a revise-content finding needs a version newer than the one changes were requested on", async () => {
    setSubmission("CHANGES_REQUESTED");
    setRound({ latest: 2 });
    request(2); // reopened in round 2, on V2
    h.prisma.finding.findMany.mockResolvedValue([finding({ status: "RESPONDED", requiredAction: "REVISE_CONTENT", _count: { responses: 1, evidence: 0 } })]);
    expect((await cmd.resubmit(CLIENT_A, "s1")).ok).toBe(false);

    setRound({ latest: 3 });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r2" });
    expect(await cmd.resubmit(CLIENT_A, "s1", "New headline")).toEqual({ ok: true, roundId: "r2" });
    // A resubmission never resolves findings or touches earlier decisions.
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.findingEvent.create).not.toHaveBeenCalled();
    expect(h.prisma.reviewDecision.create).not.toHaveBeenCalled();
    expect(h.prisma.submissionRound.create.mock.calls[0][0].data).toMatchObject({ number: 2, versionId: "v3", note: "New headline" });
  });

  it("only the owning client can resubmit, and only while changes are requested", async () => {
    setSubmission("CHANGES_REQUESTED");
    expect((await cmd.resubmit(CLIENT_B, "s1")).ok).toBe(false);
    expect((await cmd.resubmit(TEAM, "s1")).ok).toBe(false);
    setSubmission("IN_REVIEW");
    expect((await cmd.resubmit(CLIENT_A, "s1")).ok).toBe(false);
    expect(h.prisma.submissionRound.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("reviewing a resubmitted round", () => {
  it("request changes is blocked until every client response has a decision", async () => {
    setSubmission("IN_REVIEW");
    setRound({ number: 2 });
    h.prisma.finding.findMany.mockResolvedValue([
      { id: "f1", status: "RESPONDED", severity: "HIGH" },
      { id: "f2", status: "OPEN", severity: "LOW" },
    ]);
    const r = await cmd.requestChanges(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", summary: "Please revise again." });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Resolve or reopen the 1 finding/) });
    expect(h.prisma.reviewDecision.create).not.toHaveBeenCalled();
  });

  it("a resolved finding stays closed: it can't be reopened or withdrawn", async () => {
    setSubmission("IN_REVIEW");
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "RESOLVED" });
    expect((await cmd.reviewFinding(TEAM, { findingId: "f1", move: "REOPEN", note: "Back again" })).ok).toBe(false);
    expect((await cmd.reviewFinding(TEAM, { findingId: "f1", move: "DISMISS", note: "n/a" })).ok).toBe(false);
    expect(h.prisma.finding.updateMany).not.toHaveBeenCalled();
  });

  it("the round-2 decision is a new record on round 2; the round-1 decision is never updated", async () => {
    setSubmission("IN_REVIEW");
    setRound({ number: 2 });
    h.prisma.finding.findMany.mockResolvedValue([{ id: "f1", status: "RESOLVED", severity: "HIGH" }]);
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.updateMany.mockResolvedValue({ count: 1 });
    const r = await cmd.completeReview(TEAM, { creativeId: "s1", roundId: "r2", versionId: "v2", outcome: "ISSUES_RESOLVED", summary: "Resolved after the revision." });
    expect(r).toEqual({ ok: true });
    expect(h.prisma.reviewDecision.create.mock.calls[0][0].data).toMatchObject({ roundId: "r2", versionId: "v2", outcome: "ISSUES_RESOLVED" });
    expect(h.prisma.reviewDecision.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.reviewDecision.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("what a client sees of reviewer moves", () => {
  const at = (t: string) => new Date(`2026-10-10T${t}:00Z`);
  const events = [
    { fromStatus: null, toStatus: "DRAFT" as const, createdAt: at("09:00"), byClient: false },
    { fromStatus: "DRAFT" as const, toStatus: "OPEN" as const, createdAt: at("10:00"), byClient: false },
    { fromStatus: "OPEN" as const, toStatus: "RESPONDED" as const, createdAt: at("11:00"), byClient: true },
    { fromStatus: "RESPONDED" as const, toStatus: "RESOLVED" as const, createdAt: at("13:00"), byClient: false },
  ];

  it("a resolution made during a review stays internal until a decision is recorded", () => {
    expect(findings.clientFindingView(events, at("10:00")).status).toBe("RESPONDED");
    expect(findings.clientFindingView(events, at("13:30")).status).toBe("RESOLVED");
  });

  it("the client's own responses are always theirs", () => {
    expect(findings.clientFindingView(events, at("10:00")).events.some((e) => e.byClient)).toBe(true);
  });

  it("the loader applies it and never returns storage URLs", async () => {
    installCreativeStore(h.prisma);
    h.prisma.reviewDecision.findMany.mockResolvedValue([
      { id: "d1", kind: "CHANGES_REQUESTED", outcome: null, summary: "s", scopeNote: null, createdAt: at("10:00"), version: { versionNumber: 1 }, round: { number: 1 }, cycle: { number: 1 }, reviewer: { name: "Reviewer" } },
    ]);
    h.prisma.finding.findMany.mockResolvedValue([
      {
        id: "f1",
        issue: "i",
        explanation: "e",
        severity: "HIGH",
        requiredAction: "CLARIFY",
        actionDetails: "a",
        status: "RESOLVED",
        createdAt: at("09:00"),
        publishedAt: at("10:00"),
        resolutionNote: "Internal note while reviewing",
        resolvedInVersion: { versionNumber: 2 },
        version: { versionNumber: 1 },
        cycle: { number: 1 },
        createdBy: { name: "Reviewer" },
        markets: [],
        platforms: [],
        events: events.map((e, i) => ({ id: `ev${i}`, fromStatus: e.fromStatus, toStatus: e.toStatus, createdAt: e.createdAt, note: e.toStatus === "RESOLVED" ? "Internal note while reviewing" : null, actor: { name: e.byClient ? "Client A" : "Reviewer", role: e.byClient ? "CLIENT" : "TEAM" } })),
        responses: [{ id: "resp1", message: "Fixed", createdAt: at("11:00"), author: { name: "Client A", role: "CLIENT" }, version: null, round: { number: 1 } }],
        evidence: [],
      },
    ]);
    h.prisma.evidence.findMany.mockResolvedValue([
      {
        id: "e1",
        title: "Study",
        type: "RESEARCH",
        description: null,
        source: null,
        url: null,
        origin: "CLIENT_SUBMITTED",
        visibility: "SHARED",
        withdrawnAt: null,
        createdAt: at("09:30"),
        addedById: CLIENT_A.id,
        fileName: "study.pdf",
        fileSize: 1000,
        mimeType: "application/pdf",
        fileUrl: BLOB("evidence/sub-a-review/secret.pdf"),
        version: null,
        addedBy: { name: "Client A" },
        findings: [],
      },
    ]);
    const client = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
    expect(client?.findings[0].status).toBe("RESPONDED");
    expect(client?.findings[0].resolutionNote).toBeNull();
    expect(JSON.stringify(client)).not.toContain("Internal note while reviewing");
    expect(JSON.stringify(client)).not.toContain("blob.vercel-storage.com");
    expect(client?.evidence[0].file).toEqual({ name: "study.pdf", sizeBytes: 1000, isImage: false });
    expect(client?.evidence[0].withdrawable).toBe(false); // IN_REVIEW: evidence is locked

    const team = await reviewData.getSubmissionReview(TEAM, "sub-a-review");
    expect(team?.findings[0].status).toBe("RESOLVED");
    expect(JSON.stringify(team)).not.toContain("blob.vercel-storage.com");
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/evidence/upload", () => {
  beforeEach(() => installCreativeStore(h.prisma));

  function tokenRequest(creativeId: string, fileName = "study.pdf", ext = "pdf") {
    const clientPayload = JSON.stringify({ creativeId, uploadKey: KEY, fileName });
    return new Request("http://localhost/api/evidence/upload", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: `evidence/${creativeId}/${KEY}.${ext}`, clientPayload } }),
    });
  }

  it("issues a 10 MB, single-type token to the owning client while changes are requested", async () => {
    h.user = CLIENT_A;
    const res = await evidenceUpload.POST(tokenRequest("sub-a-changes"));
    expect(res.status).toBe(200);
    expect((await res.json()).options).toMatchObject({ allowedContentTypes: ["application/pdf"], maximumSizeInBytes: 10 * MB, allowOverwrite: false });
  });

  it("refuses signed-out users, other clients, TEAM, submitted work and legacy records", async () => {
    expect((await evidenceUpload.POST(tokenRequest("sub-a-changes"))).status).toBe(401);
    h.user = CLIENT_B;
    expect((await evidenceUpload.POST(tokenRequest("sub-a-changes"))).status).toBe(400);
    h.user = TEAM;
    expect((await evidenceUpload.POST(tokenRequest("sub-a-submitted"))).status).toBe(403);
    h.user = CLIENT_A;
    expect((await evidenceUpload.POST(tokenRequest("sub-a-submitted"))).status).toBe(403);
    expect((await evidenceUpload.POST(tokenRequest("cr-a-review"))).status).toBe(403);
  });

  it("refuses unsupported types and paths the server didn't build", async () => {
    h.user = CLIENT_A;
    expect((await evidenceUpload.POST(tokenRequest("sub-a-changes", "clip.gif", "gif"))).status).toBe(400);
    const clientPayload = JSON.stringify({ creativeId: "sub-a-changes", uploadKey: KEY, fileName: "study.pdf" });
    const sneaky = new Request("http://localhost/api/evidence/upload", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: `creatives/sub-a-changes/${KEY}.pdf`, clientPayload } }),
    });
    expect((await evidenceUpload.POST(sneaky)).status).toBe(400);
  });
});

describe("GET /api/media/evidence/[evidenceId]", () => {
  const get = (id: string) =>
    evidenceMedia.GET(new Request(`http://localhost/api/media/evidence/${id}`), { params: Promise.resolve({ evidenceId: id }) } as Parameters<typeof evidenceMedia.GET>[1]);

  it("requires a session, and scopes the lookup (clients: shared evidence in their own submissions only)", async () => {
    expect((await get("e1")).status).toBe(401);
    h.user = CLIENT_A;
    expect((await get("e1")).status).toBe(404);
    const where = h.prisma.evidence.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "e1", visibility: "SHARED" });
    expect(JSON.stringify(where.creative)).toContain(CLIENT_A.id);
    expect(h.readBlob).not.toHaveBeenCalled();
  });

  it("downloads PDFs and shows images inline, with safe headers", async () => {
    h.user = TEAM;
    h.prisma.evidence.findFirst.mockResolvedValue({ id: "e1", fileUrl: BLOB("evidence/s1/a.pdf"), fileName: "study.pdf", mimeType: "application/pdf" });
    const pdf = await get("e1");
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-disposition")).toMatch(/^attachment; filename="study.pdf"$/);
    expect(pdf.headers.get("x-content-type-options")).toBe("nosniff");
    h.prisma.evidence.findFirst.mockResolvedValue({ id: "e2", fileUrl: BLOB("evidence/s1/b.png"), fileName: "chart.png", mimeType: "image/png" });
    expect((await get("e2")).headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("refuses a stored type that doesn't match the file name, and evidence without a file", async () => {
    h.user = TEAM;
    h.prisma.evidence.findFirst.mockResolvedValue({ id: "e1", fileUrl: BLOB("evidence/s1/a.pdf"), fileName: "study.pdf", mimeType: "text/html" });
    expect((await get("e1")).status).toBe(404);
    h.prisma.evidence.findFirst.mockResolvedValue({ id: "e1", fileUrl: null, fileName: null, mimeType: null });
    expect((await get("e1")).status).toBe(404);
  });
});

describe("form actions", () => {
  it("refuse signed-out users", async () => {
    expect(await clientActions.addEvidenceAction(TEXT_EVIDENCE)).toMatchObject({ ok: false });
    expect(await clientActions.resubmitSubmission(undefined, form({ creativeId: "s1" }))).toMatchObject({ error: expect.any(String) });
    expect(await clientActions.withdrawEvidenceAction(undefined, form({ evidenceId: "e1" }))).toMatchObject({ error: expect.any(String) });
    expect(h.prisma.evidence.create).not.toHaveBeenCalled();
  });

  it("evidence form input from the browser is coerced, never trusted", async () => {
    h.user = CLIENT_A;
    setSubmission("CHANGES_REQUESTED");
    const bad = { ...TEXT_EVIDENCE, findingIds: "f1" as unknown as string[], file: "x" as unknown as null };
    expect((await clientActions.addEvidenceAction(bad)).ok).toBe(false);
    expect(h.prisma.evidence.create).not.toHaveBeenCalled();
  });
});
