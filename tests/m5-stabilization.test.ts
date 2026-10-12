import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, form, installCreativeStore, type PrismaMock } from "./helpers";

// M5 stabilization (12 Oct): client work stays private to the client until
// resubmission; B1–B5 data; orphan selection. Prisma and Blob are mocked.

const h = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  prisma: null as unknown as PrismaMock,
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
  isPrivateBlobUrl: () => true,
  headBlob: vi.fn(),
  contentMatches: vi.fn(),
  deleteUnreferencedBlob: vi.fn(),
  readBlob: (...a: unknown[]) => h.readBlob(...a),
}));

const findings = await import("@/lib/workflow/findings");
const reviewData = await import("@/lib/data/submission-review");
const cmd = await import("@/lib/workflow/commands");
const clientActions = await import("@/app/dashboard/submissions/actions");
const evidenceMedia = await import("@/app/api/media/evidence/[evidenceId]/route");
const { selectOrphans } = await import("@/lib/review/orphans");

const at = (t: string) => new Date(`2026-10-12T${t}:00Z`);
const BLOB = (p: string) => `https://x.private.blob.vercel-storage.com/${p}`;

// Timeline used throughout: round 1 submitted 09:00, changes requested 10:00,
// client prepares work from 11:00 (not yet resubmitted).
const ROUND1 = at("09:00");
const DECISION1 = at("10:00");

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.user = null;
  h.readBlob = vi.fn(async () => ({ statusCode: 200, stream: new ReadableStream(), headers: new Headers() }));
});

describe("pure rules", () => {
  const ev = (toStatus: "OPEN" | "RESPONDED" | "RESOLVED", t: string, byClient: boolean, fromStatus: "DRAFT" | "OPEN" | "RESPONDED" | null = null) => ({
    fromStatus,
    toStatus,
    createdAt: at(t),
    byClient,
  });

  it("client work reaches the team only once it was part of a submission", () => {
    expect(findings.submittedToTeam(at("08:00"), ROUND1)).toBe(true);
    expect(findings.submittedToTeam(at("11:00"), ROUND1)).toBe(false);
    expect(findings.submittedToTeam(at("08:00"), null)).toBe(false);
  });

  it("the team sees a finding as Open while the client's response is unsubmitted, then Responded after resubmission", () => {
    const events = [ev("OPEN", "10:00", false, "DRAFT"), ev("RESPONDED", "11:00", true, "OPEN")];
    expect(findings.teamFindingView(events, ROUND1).status).toBe("OPEN");
    expect(findings.teamFindingView(events, ROUND1).events).toHaveLength(1);
    expect(findings.teamFindingView(events, at("12:00")).status).toBe("RESPONDED");
  });

  it("evidence is labelled with the round it was submitted with (B4)", () => {
    const rounds = [
      { number: 1, submittedAt: ROUND1 },
      { number: 2, submittedAt: at("12:00") },
    ];
    expect(findings.submittedWithRound(at("08:30"), rounds)).toBe(1);
    expect(findings.submittedWithRound(at("11:00"), rounds)).toBe(2);
    expect(findings.submittedWithRound(at("13:00"), rounds)).toBeNull();
  });

  it("abandoned uploads: only old, unreferenced files under the app's prefixes", () => {
    const now = at("12:00").getTime();
    const old = new Date(now - 25 * 3600_000);
    const blobs = [
      { url: BLOB("evidence/s1/a.pdf"), pathname: "evidence/s1/a.pdf", size: 1, uploadedAt: old }, // orphan
      { url: BLOB("evidence/s1/withdrawn.png"), pathname: "evidence/s1/withdrawn.png", size: 1, uploadedAt: old }, // referenced by withdrawn evidence
      { url: BLOB("creatives/s1/v1.png"), pathname: "creatives/s1/v1.png", size: 1, uploadedAt: old }, // referenced by a version
      { url: BLOB("evidence/s1/fresh.pdf"), pathname: "evidence/s1/fresh.pdf", size: 1, uploadedAt: new Date(now - 3600_000) }, // too new
      { url: BLOB("other/x.pdf"), pathname: "other/x.pdf", size: 1, uploadedAt: old }, // not ours
    ];
    const referenced = new Set([BLOB("evidence/s1/withdrawn.png"), BLOB("creatives/s1/v1.png")]);
    expect(selectOrphans(blobs, referenced, now).map((b) => b.pathname)).toEqual(["evidence/s1/a.pdf"]);
  });
});

// ---------------------------------------------------------------------------

describe("the team doesn't see client work prepared since the last submission", () => {
  beforeEach(() => installCreativeStore(h.prisma));

  function setData({ resubmittedAt }: { resubmittedAt?: Date } = {}) {
    const rounds = [
      ...(resubmittedAt ? [{ number: 2, submittedAt: resubmittedAt }] : []),
      { number: 1, submittedAt: ROUND1 },
    ].map((r) => ({
      id: `r${r.number}`,
      number: r.number,
      note: null,
      submittedAt: r.submittedAt,
      submittedBy: { name: "Client A" },
      versionId: "v1",
      version: { id: "v1", versionNumber: 1, mediaType: "IMAGE", fileName: null, changeNotes: null },
      decisions: [],
    }));
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: null, rounds });
    h.prisma.reviewDecision.findMany.mockResolvedValue([
      { id: "d1", kind: "CHANGES_REQUESTED", outcome: null, summary: "s", scopeNote: null, createdAt: DECISION1, version: { versionNumber: 1 }, round: { number: 1 }, cycle: { number: 1 }, reviewer: { name: "Reviewer" } },
    ]);
    h.prisma.finding.findMany.mockResolvedValue([
      {
        id: "f1",
        issue: "Unsupported claim",
        explanation: "e",
        severity: "HIGH",
        requiredAction: "PROVIDE_EVIDENCE",
        actionDetails: "a",
        status: "RESPONDED",
        createdAt: at("09:30"),
        publishedAt: DECISION1,
        resolutionNote: null,
        resolvedInVersion: null,
        version: { versionNumber: 1 },
        cycle: { number: 1 },
        createdBy: { name: "Reviewer" },
        markets: [],
        platforms: [],
        events: [
          { id: "e1", fromStatus: "DRAFT", toStatus: "OPEN", note: null, createdAt: DECISION1, actor: { name: "Reviewer", role: "TEAM" } },
          { id: "e2", fromStatus: "OPEN", toStatus: "RESPONDED", note: null, createdAt: at("11:00"), actor: { name: "Client A", role: "CLIENT" } },
        ],
        responses: [{ id: "resp1", message: "DRAFT RESPONSE TEXT", createdAt: at("11:00"), author: { name: "Client A", role: "CLIENT" }, version: null, round: { number: 1 } }],
        evidence: [
          { evidenceId: "ev-old", linkedAt: at("08:30") },
          { evidenceId: "ev-new", linkedAt: at("11:05") },
        ],
      },
    ]);
    const evidence = (id: string, title: string, createdAt: Date, extra: Record<string, unknown> = {}) => ({
      id,
      title,
      type: "RESEARCH",
      description: null,
      source: null,
      url: null,
      origin: "CLIENT_SUBMITTED",
      visibility: "SHARED",
      withdrawnAt: null,
      withdrawnBy: null,
      createdAt,
      addedById: CLIENT_A.id,
      fileName: "study.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      fileUrl: BLOB(`evidence/${id}.pdf`),
      addedBy: { name: "Client A" },
      findings: [{ findingId: "f1", linkedAt: createdAt }],
      ...extra,
    });
    h.prisma.evidence.findMany.mockResolvedValue([
      evidence("ev-old", "SUBMITTED EVIDENCE", at("08:30")),
      evidence("ev-new", "DRAFT EVIDENCE TITLE", at("11:05")),
      evidence("ev-wd", "WITHDRAWN DRAFT EVIDENCE", at("11:10"), { withdrawnAt: at("11:20"), withdrawnBy: { name: "Client A" } }),
    ]);
  }

  it("while changes are requested: no draft responses, evidence, links or status changes reach the team", async () => {
    setData();
    const team = await reviewData.getSubmissionReview(TEAM, "sub-a-review");
    const json = JSON.stringify(team);
    expect(json).not.toContain("DRAFT RESPONSE TEXT");
    expect(json).not.toContain("DRAFT EVIDENCE TITLE");
    expect(json).not.toContain("WITHDRAWN DRAFT EVIDENCE");
    expect(team?.evidence.map((e) => e.id)).toEqual(["ev-old"]);
    expect(team?.findings[0].status).toBe("OPEN"); // the client's response hasn't been submitted
    expect(team?.findings[0].entries).toEqual([]);
    expect(team?.findings[0].evidenceIds).toEqual(["ev-old"]);
  });

  it("the client still sees all of their own prepared work", async () => {
    setData();
    const client = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
    expect(client?.findings[0].status).toBe("RESPONDED");
    expect(client?.findings[0].entries.map((e) => e.id)).toEqual(["resp1"]);
    expect(client?.evidence.map((e) => e.id)).toEqual(["ev-old", "ev-new", "ev-wd"]);
    expect(client?.evidence.find((e) => e.id === "ev-new")?.submittedWithRound).toBeNull(); // "Not yet submitted"
  });

  it("after resubmission, the team sees the submitted work but never evidence withdrawn before submitting", async () => {
    setData({ resubmittedAt: at("12:00") });
    const team = await reviewData.getSubmissionReview(TEAM, "sub-a-review");
    expect(team?.findings[0].status).toBe("RESPONDED");
    expect(team?.findings[0].entries.map((e) => e.id)).toEqual(["resp1"]);
    expect(team?.evidence.map((e) => e.id)).toEqual(["ev-old", "ev-new"]);
    expect(JSON.stringify(team)).not.toContain("WITHDRAWN DRAFT EVIDENCE");
    // B5: the client sees who withdrew it and when.
    const client = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
    expect(client?.evidence.find((e) => e.id === "ev-wd")?.withdrawal).toEqual({ byName: "Client A", at: at("11:20") });
    // B4: the round each item came with.
    expect(team?.evidence.find((e) => e.id === "ev-new")?.submittedWithRound).toBe(2);
    expect(team?.evidence.find((e) => e.id === "ev-old")?.submittedWithRound).toBe(1);
  });

  it("another client gets nothing at all", async () => {
    setData();
    expect(await reviewData.getSubmissionReview(CLIENT_B, "sub-a-review")).toBeNull();
  });
});

describe("evidence file URLs follow the same boundary", () => {
  const get = (id: string) =>
    evidenceMedia.GET(new Request(`http://localhost/api/media/evidence/${id}`), { params: Promise.resolve({ evidenceId: id }) } as Parameters<typeof evidenceMedia.GET>[1]);
  const row = (createdAt: Date) => ({
    id: "ev",
    creativeId: "s1",
    origin: "CLIENT_SUBMITTED",
    createdAt,
    withdrawnAt: null as Date | null,
    fileUrl: BLOB("evidence/s1/a.pdf"),
    fileName: "study.pdf",
    mimeType: "application/pdf",
  });

  it("the team gets 404 for a file the client hasn't submitted yet, by direct URL", async () => {
    h.user = TEAM;
    h.prisma.evidence.findFirst.mockResolvedValue(row(at("11:00")));
    h.prisma.submissionRound.findFirst.mockResolvedValue({ submittedAt: ROUND1 });
    expect((await get("ev")).status).toBe(404);
    expect(h.readBlob).not.toHaveBeenCalled();
  });

  it("the team never gets a file the client withdrew before submitting", async () => {
    h.user = TEAM;
    h.prisma.evidence.findFirst.mockResolvedValue({ ...row(at("08:00")), withdrawnAt: at("08:30") });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ submittedAt: ROUND1 });
    expect((await get("ev")).status).toBe(404);
  });

  it("the team gets the file once it was submitted", async () => {
    h.user = TEAM;
    h.prisma.evidence.findFirst.mockResolvedValue(row(at("08:00")));
    h.prisma.submissionRound.findFirst.mockResolvedValue({ submittedAt: ROUND1 });
    expect((await get("ev")).status).toBe(200);
  });

  it("the owning client can open their own unsubmitted file; another client can't", async () => {
    h.user = CLIENT_A;
    h.prisma.evidence.findFirst.mockResolvedValue(row(at("11:00")));
    expect((await get("ev")).status).toBe(200);
    h.user = CLIENT_B;
    h.prisma.evidence.findFirst.mockResolvedValue(null); // the scoped query matches nothing
    expect((await get("ev")).status).toBe(404);
    expect(JSON.stringify(h.prisma.evidence.findFirst.mock.calls.at(-1)?.[0].where)).toContain(CLIENT_B.id);
  });
});

describe("activity", () => {
  function setSubmission(status: string) {
    h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "Spring promo", workflow: "SUBMISSION_REVIEW", status, projectId: "p-a", project: { clientId: CLIENT_A.id } });
  }

  it("withdrawing unsubmitted evidence writes no activity the team could read", async () => {
    setSubmission("CHANGES_REQUESTED");
    h.prisma.evidence.findUnique.mockResolvedValue({ id: "e1", creativeId: "s1", title: "Draft", origin: "CLIENT_SUBMITTED", addedById: CLIENT_A.id, withdrawnAt: null, createdAt: at("11:00") });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ submittedAt: ROUND1 });
    h.prisma.evidence.updateMany.mockResolvedValue({ count: 1 });
    expect(await cmd.withdrawEvidence(CLIENT_A, "e1")).toEqual({ ok: true });
    expect(h.prisma.activity.create).not.toHaveBeenCalled();
  });

  it("the resubmission summarises the prepared work once it becomes visible", async () => {
    setSubmission("CHANGES_REQUESTED");
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: null });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v1", decisions: [{ id: "d1" }] });
    h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v2", versionNumber: 2 });
    h.prisma.reviewDecision.findFirst.mockResolvedValue({ createdAt: DECISION1, version: { versionNumber: 1 } });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r2" });
    h.prisma.findingResponse.count.mockResolvedValue(2);
    h.prisma.evidence.count.mockResolvedValue(1);
    expect(await cmd.resubmit(CLIENT_A, "s1")).toEqual({ ok: true, roundId: "r2" });
    expect(h.prisma.activity.create.mock.calls[0][0].data.message).toBe("Resubmitted “Spring promo” (V2, round 2) with 2 responses and 1 evidence item");
    expect(h.prisma.evidence.count.mock.calls[0][0].where).toMatchObject({ withdrawnAt: null, createdAt: { gt: DECISION1 } });
  });
});

describe("B2: resubmission errors belong to the checklist state they were raised for", () => {
  it("the action echoes the readiness signature with the error", async () => {
    h.user = CLIENT_A;
    h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "P", workflow: "SUBMISSION_REVIEW", status: "IN_REVIEW", projectId: "p", project: { clientId: CLIENT_A.id } });
    const r = await clientActions.resubmitSubmission(undefined, form({ creativeId: "s1", readiness: "f1:0,f2:1", note: "n" }));
    expect(r).toMatchObject({ error: expect.any(String), values: { readiness: "f1:0,f2:1", note: "n" } });
  });
});

describe("revised versions stay private to the client until resubmission (decision 8)", () => {
  const v = (n: number, t: string) => ({ id: `v${n}`, versionNumber: n, createdAt: at(t) });

  it("the team sees versions up to the latest submission only; legacy creatives are unaffected", () => {
    const versions = [v(3, "11:00"), v(2, "08:50"), v(1, "08:00")];
    expect(findings.teamVisibleVersions(versions, { workflow: "SUBMISSION_REVIEW", lastSubmittedAt: ROUND1 }).map((x) => x.id)).toEqual(["v2", "v1"]);
    expect(findings.teamVisibleVersions(versions, { workflow: "SUBMISSION_REVIEW", lastSubmittedAt: at("12:00") })).toHaveLength(3);
    expect(findings.teamVisibleVersions(versions, { workflow: "LEGACY_CLIENT_APPROVAL", lastSubmittedAt: null })).toHaveLength(3);
  });

  it("the submissions list shows the team the last submitted thumbnail and count, the client their newest", async () => {
    const row = {
      id: "s1",
      name: "Promo",
      description: null,
      format: "STORY",
      status: "CHANGES_REQUESTED",
      workflow: "SUBMISSION_REVIEW",
      updatedAt: at("11:00"),
      project: { id: "p", name: "P", client: { name: "Client A" } },
      versions: [
        { id: "v2", versionNumber: 2, mediaType: "IMAGE", createdAt: at("11:00") },
        { id: "v1", versionNumber: 1, mediaType: "IMAGE", createdAt: at("08:00") },
      ],
      rounds: [{ submittedAt: ROUND1 }],
      decisions: [{ createdAt: DECISION1 }],
    };
    h.prisma.creative.findMany.mockResolvedValue([row]);
    const { getCreatives } = await import("@/lib/data/workspace");
    const [team] = await getCreatives(TEAM);
    expect(team.latestVersion?.id).toBe("v1");
    expect(team.versionCount).toBe(1);
    // The team's "updated" time is the last decision, not the row timestamp the client's private upload moved.
    expect(team.updatedAt).toEqual(DECISION1);
    const [client] = await getCreatives(CLIENT_A);
    expect(client.latestVersion?.id).toBe("v2");
    expect(client.versionCount).toBe(2);
    expect(client.updatedAt).toEqual(at("11:00"));
  });
});

describe("Stage C dashboards", () => {
  const thumbV = (id: string, n: number, t: string) => ({ id, versionNumber: n, mediaType: "IMAGE", createdAt: at(t) });

  it("TEAM overview: role-gated, longest wait first, last *submitted* thumbnail only", async () => {
    const { getTeamOverview } = await import("@/lib/data/overview");
    expect(await getTeamOverview(CLIENT_A)).toEqual({ needsReview: [], inReview: [], waitingOnClients: [], completed: [] });
    expect(h.prisma.creative.findMany).not.toHaveBeenCalled();

    h.prisma.creative.findMany.mockImplementation(async ({ where }: { where: { status: unknown } }) =>
      where.status === "CHANGES_REQUESTED"
        ? [
            { id: "newer", name: "B", format: "STORY", project: { name: "P", client: { name: "Client A" } }, versions: [thumbV("b1", 1, "08:00")], rounds: [{ number: 1, submittedAt: ROUND1 }], decisions: [{ createdAt: at("10:30") }], _count: { findings: 1 } },
            {
              id: "older",
              name: "A",
              format: "STORY",
              project: { name: "P", client: { name: "Client A" } },
              versions: [thumbV("a2-private", 2, "11:00"), thumbV("a1", 1, "08:00")],
              rounds: [{ number: 1, submittedAt: ROUND1 }],
              decisions: [{ createdAt: DECISION1 }],
              _count: { findings: 2 },
            },
          ]
        : [],
    );
    const team = await getTeamOverview(TEAM);
    expect(team.waitingOnClients.map((w) => w.id)).toEqual(["older", "newer"]);
    expect(team.waitingOnClients[0].latestVersion?.id).toBe("a1"); // the private revision never surfaces
    expect(team.waitingOnClients[0].sharedFindings).toBe(2);
    expect(h.prisma.reviewDecision.findMany.mock.calls[0][0].where).toMatchObject({ kind: "FINAL", creative: { workflow: "SUBMISSION_REVIEW" } });
  });

  it("CLIENT overview: only the client's own submissions, grouped by what they need to do", async () => {
    const { getClientOverview } = await import("@/lib/data/overview");
    expect(await getClientOverview(TEAM)).toEqual({ actionNeeded: [], withClyntique: [], done: [], earlierWork: 0 });

    const row = (id: string, status: string, open = 0) => ({
      id,
      name: id,
      format: "STORY",
      status,
      updatedAt: at("12:00"),
      project: { name: "P" },
      versions: [],
      rounds: [],
      decisions: [],
      _count: { findings: open },
    });
    h.prisma.creative.findMany.mockResolvedValue([row("draft", "DRAFT"), row("changes", "CHANGES_REQUESTED", 3), row("sub", "SUBMITTED"), row("done", "REVIEW_COMPLETE"), row("rev", "IN_REVIEW", 5)]);
    h.prisma.creative.count.mockResolvedValue(1);
    const client = await getClientOverview(CLIENT_A);
    expect(h.prisma.creative.findMany.mock.calls[0][0].where).toEqual({ workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    expect(client.actionNeeded.map((i) => i.id)).toEqual(["changes", "draft"]);
    expect(client.actionNeeded[0].findingsToAnswer).toBe(3);
    expect(client.withClyntique.map((i) => i.id)).toEqual(["sub", "rev"]);
    expect(client.withClyntique[1].findingsToAnswer).toBe(0); // counts only while changes are requested
    expect(client.done.map((i) => i.id)).toEqual(["done"]);
    expect(client.earlierWork).toBe(1);
  });

  it("activity: clients see reviewers as \"Clyntique reviewer\"; the team sees names", async () => {
    const { getActivity } = await import("@/lib/data/workspace");
    h.prisma.activity.findMany.mockResolvedValue([
      { id: "a1", type: "REVIEW_COMPLETED", message: "m", createdAt: at("12:00"), project: { id: "p", name: "P" }, user: { name: "Riley Reviewer", role: "TEAM" } },
      { id: "a2", type: "RESUBMITTED", message: "m", createdAt: at("11:00"), project: { id: "p", name: "P" }, user: { name: "Client A", role: "CLIENT" } },
    ]);
    expect((await getActivity(CLIENT_A)).map((a) => a.actorName)).toEqual(["Clyntique reviewer", "Client A"]);
    expect((await getActivity(TEAM)).map((a) => a.actorName)).toEqual(["Riley Reviewer", "Client A"]);
  });
});

describe("Stage D: private client work doesn't move the submission's updated time", () => {
  it("adding evidence locks the status check but writes the existing updatedAt back", async () => {
    const was = at("09:00");
    h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "P", workflow: "SUBMISSION_REVIEW", status: "CHANGES_REQUESTED", projectId: "p", updatedAt: was, project: { clientId: CLIENT_A.id } });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.evidence.create.mockResolvedValue({ id: "e1" });
    expect((await cmd.addEvidence(CLIENT_A, { creativeId: "s1", title: "Price history", type: "STATISTIC", description: "d" })).ok).toBe(true);
    const call = h.prisma.creative.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "s1", status: "CHANGES_REQUESTED" });
    expect(call.data).toEqual({ updatedAt: was });
  });
});

describe("Stage E: client detail edits while changes are requested don't move the updated time", () => {
  it("updateDraft writes the existing updatedAt back outside drafts", async () => {
    const was = at("09:30");
    h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "P", workflow: "SUBMISSION_REVIEW", status: "CHANGES_REQUESTED", projectId: "p", updatedAt: was, project: { clientId: CLIENT_A.id } });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    expect((await cmd.updateDraft(CLIENT_A, "s1", { name: "Promo v2", format: "STORY" })).ok).toBe(true);
    expect(h.prisma.creative.updateMany.mock.calls[0][0].data).toMatchObject({ name: "Promo v2", updatedAt: was });
  });
});

describe("Stage E: title, description and context stay as submitted for the team", () => {
  it("submit and resubmit store what the client submitted on the round", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "Promo", workflow: "SUBMISSION_REVIEW", status: "CHANGES_REQUESTED", projectId: "p", updatedAt: at("09:00"), project: { clientId: CLIENT_A.id } });
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: null });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v1", decisions: [{ id: "d1" }] });
    h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v2", versionNumber: 2 });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.creative.findUniqueOrThrow.mockResolvedValue({ name: "Promo (edited)", description: "New description", context: "New context" });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r2" });
    expect(await cmd.resubmit(CLIENT_A, "s1")).toEqual({ ok: true, roundId: "r2" });
    expect(h.prisma.submissionRound.create.mock.calls[0][0].data).toMatchObject({
      submittedName: "Promo (edited)",
      submittedDescription: "New description",
      submittedContext: "New context",
    });
  });

  it("the team sees the submitted details; the client sees their own edits", () => {
    const live = { name: "Promo (private edit)", description: "Draft copy", context: "Draft context", extra: 1 };
    const round = { submittedName: "Promo", submittedDescription: "As submitted", submittedContext: "Submitted context" };
    expect(findings.teamVisibleDetails(live, round)).toEqual({ name: "Promo", description: "As submitted", context: "Submitted context", extra: 1 });
    // No snapshot (legacy, or no round): the live values.
    expect(findings.teamVisibleDetails(live, null)).toEqual(live);
    expect(findings.teamVisibleDetails(live, { submittedName: null, submittedDescription: null, submittedContext: null })).toEqual(live);
  });

  it("the team's submission page and lists read the snapshot", async () => {
    const { getSubmission } = await import("@/lib/data/submission");
    const row = {
      id: "s1",
      name: "Promo (private edit)",
      description: "Draft copy",
      context: "Draft context",
      format: "STORY",
      status: "CHANGES_REQUESTED",
      createdAt: at("08:00"),
      updatedAt: at("08:00"),
      submittedAt: ROUND1,
      createdBy: { name: "Client A" },
      project: { id: "p", name: "P", client: { name: "Client A" } },
      markets: [],
      platforms: [],
      versions: [],
      rounds: [{ number: 1, note: null, submittedAt: ROUND1, submittedName: "Promo", submittedDescription: "As submitted", submittedContext: "Submitted context", submittedBy: { name: "Client A" }, version: { versionNumber: 1 } }],
    };
    h.prisma.creative.findFirst.mockResolvedValue(row);
    const team = await getSubmission(TEAM, "s1");
    expect(team).toMatchObject({ name: "Promo", description: "As submitted", context: "Submitted context" });
    expect(JSON.stringify(team)).not.toContain("private edit");
    const client = await getSubmission(CLIENT_A, "s1");
    expect(client).toMatchObject({ name: "Promo (private edit)", description: "Draft copy", context: "Draft context" });
  });
});
