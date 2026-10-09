import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, CREATIVES, TEAM, createPrismaMock, form, installCreativeStore, matchesCreative, type PrismaMock } from "./helpers";

// M3: client-owned submissions wired into the app. Prisma and Blob are mocked;
// nothing here connects to a database or a storage service.

const h = vi.hoisted(() => ({ user: null as CurrentUser | null, prisma: null as unknown as PrismaMock }));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: vi.fn(async () => h.user) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));
// A stored blob that passes every check: path, size, type and leading bytes.
vi.mock("@/lib/review/blob", () => ({
  isPrivateBlobUrl: () => true,
  headBlob: vi.fn(async (url: string) => ({ pathname: new URL(url).pathname.slice(1), size: 1024, contentType: "image/png" })),
  contentMatches: vi.fn(async () => true),
  deleteUnreferencedBlob: vi.fn(),
}));

const review = await import("@/lib/review/actions");
const submissions = await import("@/app/dashboard/submissions/actions");
const data = await import("@/lib/data/submission");

const KEY = "11111111-1111-4111-8111-111111111111";
const upload = (creativeId: string) => ({
  creativeId,
  uploadKey: KEY,
  url: `https://store.private.blob.vercel-storage.com/creatives/${creativeId}/${KEY}-abc123.png`,
  fileName: "ad.png",
});

function setCurrent(status: string, workflow = "SUBMISSION_REVIEW") {
  h.prisma.creative.findUniqueOrThrow.mockResolvedValue({ status, workflow });
}

beforeEach(() => {
  h.prisma = createPrismaMock();
  installCreativeStore(h.prisma);
  h.user = null;
});

describe("client uploads (finalizeVersion)", () => {
  it("records the next version on the owner's draft without changing its status or writing activity", async () => {
    h.user = CLIENT_A;
    setCurrent("DRAFT");
    // The new draft fixture already has V1; this upload becomes V2.
    const result = await review.finalizeVersion(upload("sub-a-draft"));
    expect(result).toEqual({ ok: true, versionNumber: 2 });
    expect(h.prisma.creativeVersion.create.mock.calls[0][0].data).toMatchObject({ creativeId: "sub-a-draft", createdById: CLIENT_A.id, versionNumber: 2 });
    expect(h.prisma.creative.update.mock.calls[0][0].data).not.toHaveProperty("status");
    expect(h.prisma.activity.create).not.toHaveBeenCalled(); // private draft
  });

  it("refuses another client's submission, a submitted (locked) one, and TEAM uploads into submissions", async () => {
    h.user = CLIENT_B;
    expect((await review.finalizeVersion(upload("sub-a-draft"))).ok).toBe(false);
    h.user = CLIENT_A;
    expect(await review.finalizeVersion(upload("sub-a-submitted"))).toMatchObject({ ok: false, error: expect.stringMatching(/state/) });
    h.user = TEAM;
    expect((await review.finalizeVersion(upload("sub-a-submitted"))).ok).toBe(false);
    expect(h.prisma.creativeVersion.create).not.toHaveBeenCalled();
  });

  it("refuses if the submission was submitted while the file was uploading", async () => {
    h.user = CLIENT_A;
    setCurrent("SUBMITTED");
    expect(await review.finalizeVersion(upload("sub-a-draft"))).toMatchObject({ ok: false, error: expect.stringMatching(/uploads are closed/) });
  });

  it("keeps TEAM uploads working for legacy creatives", async () => {
    h.user = TEAM;
    setCurrent("IN_REVIEW", "LEGACY_CLIENT_APPROVAL");
    expect(await review.finalizeVersion(upload("cr-a-review"))).toMatchObject({ ok: true });
  });
});

describe("legacy-only actions refuse client submissions", () => {
  it("client approval can't be used on a new-workflow submission under review", async () => {
    h.user = CLIENT_A;
    const result = await review.submitDecision(undefined, form({ creativeId: "sub-a-review", versionId: "x", decision: "APPROVED" }));
    expect(result?.error).toMatch(/compliance review workflow/);
    expect(h.prisma.creative.updateMany).not.toHaveBeenCalled();
  });

  it("the legacy decision guard itself also requires the legacy workflow", async () => {
    h.user = CLIENT_A;
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    await review.submitDecision(undefined, form({ creativeId: "cr-a-review", versionId: "v-a-1", decision: "APPROVED" }));
    expect(h.prisma.creative.updateMany.mock.calls[0][0].where).toMatchObject({ workflow: "LEGACY_CLIENT_APPROVAL" });
  });

  it("team share, details, evidence and comments refuse new-workflow submissions", async () => {
    h.user = TEAM;
    const data = form({ creativeId: "sub-a-submitted", name: "X", format: "FEED", title: "Evidence", type: "OTHER", content: "hi", versionId: "v-sub-a-submitted-1", evidenceId: "e1" });
    for (const action of [review.shareForReview, review.updateCreativeDetails, review.saveEvidence, review.deleteEvidence, review.addComment]) {
      expect((await action(undefined, data))?.error).toMatch(/compliance review workflow/);
    }
    expect(h.prisma.comment.create).not.toHaveBeenCalled();
    expect(h.prisma.evidence.create).not.toHaveBeenCalled();
  });
});

describe("submission form actions", () => {
  it("createSubmission validates, creates a client-owned draft and opens it", async () => {
    h.user = CLIENT_A;
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    h.prisma.market.findMany.mockResolvedValue([{ code: "US" }, { code: "AE" }]);
    h.prisma.adPlatform.findMany.mockResolvedValue([{ code: "TIKTOK" }]);
    h.prisma.creative.create.mockResolvedValue({ id: "sub-new" });
    const data = form({ projectId: "p-a", name: "Spring sale", format: "STORY", description: "", context: "" });
    data.append("markets", "US");
    data.append("markets", "AE");
    data.append("platforms", "TIKTOK");
    await expect(submissions.createSubmission(undefined, data)).rejects.toThrow("REDIRECT /dashboard/creatives/sub-new?created=1");
    expect(h.prisma.creative.create.mock.calls[0][0].data).toMatchObject({
      workflow: "SUBMISSION_REVIEW",
      status: "DRAFT",
      createdById: CLIENT_A.id,
      markets: { create: [{ marketCode: "US" }, { marketCode: "AE" }] },
      platforms: { create: [{ platformCode: "TIKTOK" }] },
    });
  });

  it("createSubmission keeps the typed values and writes nothing on a validation error", async () => {
    h.user = CLIENT_A;
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    const result = await submissions.createSubmission(undefined, form({ projectId: "p-a", name: "x", format: "FEED" }));
    expect(result?.error).toMatch(/title/);
    expect(result?.values).toMatchObject({ name: "x", format: "FEED" });
    expect(h.prisma.creative.create).not.toHaveBeenCalled();
  });

  it("createSubmission refuses TEAM users, other clients' projects and signed-out users", async () => {
    h.prisma.project.findUnique.mockResolvedValue({ id: "p-a", clientId: CLIENT_A.id });
    const data = form({ projectId: "p-a", name: "Spring sale", format: "FEED" });
    h.user = TEAM;
    expect((await submissions.createSubmission(undefined, data))?.error).toBeDefined();
    h.user = CLIENT_B;
    expect((await submissions.createSubmission(undefined, data))?.error).toBeDefined();
    h.user = null;
    expect((await submissions.createSubmission(undefined, data))?.error).toMatch(/sign in/);
    expect(h.prisma.creative.create).not.toHaveBeenCalled();
  });

  it("updateSubmission only replaces markets/platforms when the form includes them", async () => {
    h.user = CLIENT_A;
    h.prisma.creative.findUnique.mockResolvedValue({ id: "sub-a-draft", name: "A", workflow: "SUBMISSION_REVIEW", status: "DRAFT", projectId: "p-a", project: { clientId: CLIENT_A.id } });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    const withoutTargeting = form({ creativeId: "sub-a-draft", name: "Renamed", format: "FEED" });
    expect(await submissions.updateSubmission(undefined, withoutTargeting)).toEqual({ ok: "Draft saved." });
    expect(h.prisma.submissionMarket.deleteMany).not.toHaveBeenCalled();

    h.prisma.market.findMany.mockResolvedValue([{ code: "CA" }]);
    const withTargeting = form({ creativeId: "sub-a-draft", name: "Renamed", format: "FEED", targeting: "1" });
    withTargeting.append("markets", "CA");
    expect(await submissions.updateSubmission(undefined, withTargeting)).toEqual({ ok: "Draft saved." });
    expect(h.prisma.submissionMarket.createMany.mock.calls[0][0].data).toEqual([{ creativeId: "sub-a-draft", marketCode: "CA" }]);
  });

  it("submitSubmission refuses an incomplete draft and never lets TEAM submit", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ id: "sub-a-draft", name: "A", workflow: "SUBMISSION_REVIEW", status: "DRAFT", projectId: "p-a", project: { clientId: CLIENT_A.id } });
    h.user = CLIENT_A;
    h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v1", versionNumber: 1 });
    h.prisma.submissionMarket.count.mockResolvedValue(0);
    h.prisma.submissionPlatform.count.mockResolvedValue(1);
    expect((await submissions.submitSubmission(undefined, form({ creativeId: "sub-a-draft" })))?.error).toMatch(/target market/);
    h.user = TEAM;
    expect((await submissions.submitSubmission(undefined, form({ creativeId: "sub-a-draft" })))?.error).toBeDefined();
    expect(h.prisma.creative.updateMany).not.toHaveBeenCalled();
  });
});

describe("submission reads", () => {
  it("getSubmission only returns new-workflow submissions inside the user's scope", async () => {
    await data.getSubmission(TEAM, "sub-a-draft");
    const where = h.prisma.creative.findFirst.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ id: "sub-a-draft", workflow: "SUBMISSION_REVIEW" });
    // The scope part of the query hides client drafts from TEAM.
    expect(CREATIVES.filter((c) => matchesCreative(where.AND[1], c)).map((c) => c.id)).not.toContain("sub-a-draft");
  });

  it("only clients get project options, and only their own projects", async () => {
    expect(await data.getSubmissionProjects(TEAM)).toEqual([]);
    await data.getSubmissionProjects(CLIENT_A);
    expect(h.prisma.project.findMany.mock.calls[0][0].where).toEqual({ clientId: CLIENT_A.id });
  });

  it("targeting options are active markets (countries) and active platforms", async () => {
    await data.getTargetingOptions();
    expect(h.prisma.market.findMany.mock.calls[0][0].where).toEqual({ active: true, kind: "COUNTRY" });
    expect(h.prisma.adPlatform.findMany.mock.calls[0][0].where).toEqual({ active: true });
  });
});
