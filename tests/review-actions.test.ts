import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, form, installCreativeStore, type PrismaMock } from "./helpers";

// Pins the CURRENT (Phase 4) permission behaviour of the review actions, so
// later milestones change it deliberately rather than by accident.

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
vi.mock("@/lib/review/blob", () => ({
  headBlob: vi.fn(),
  contentMatches: vi.fn(),
  deleteUnreferencedBlob: vi.fn(),
  isPrivateBlobUrl: vi.fn(() => true),
}));

const actions = await import("@/lib/review/actions");
const NO_PERMISSION = "You don't have permission to do that.";
const NOT_FOUND = "This creative is no longer available.";

function writes(prisma: PrismaMock) {
  return [
    prisma.creative.update,
    prisma.creative.updateMany,
    prisma.creativeVersion.create,
    prisma.evidence.create,
    prisma.evidence.updateMany,
    prisma.evidence.deleteMany,
    prisma.comment.create,
    prisma.approval.create,
    prisma.activity.create,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);
}

beforeEach(() => {
  h.prisma = createPrismaMock();
  installCreativeStore(h.prisma);
  h.user = null;
});

describe("signed-out users", () => {
  it("cannot run any review action", async () => {
    const data = form({ creativeId: "cr-a-review", versionId: "v-a-1", content: "hi", decision: "APPROVED", title: "Evidence", type: "OTHER" });
    const formActions = [
      actions.shareForReview,
      actions.updateCreativeDetails,
      actions.saveEvidence,
      actions.deleteEvidence,
      actions.addComment,
      actions.submitDecision,
    ];
    for (const action of formActions) {
      expect((await action(undefined, data))?.error).toMatch(/sign in/i);
    }
    const finalize = await actions.finalizeVersion({ creativeId: "cr-a-review", uploadKey: "x", url: "x", fileName: "a.png" });
    expect(finalize).toMatchObject({ ok: false });
    expect(writes(h.prisma)).toBe(0);
  });
});

describe("TEAM-only actions refuse CLIENT users", () => {
  beforeEach(() => {
    h.user = CLIENT_A;
  });

  it("finalizeVersion (unauthorized upload)", async () => {
    const result = await actions.finalizeVersion({
      creativeId: "cr-a-review",
      uploadKey: "00000000-0000-0000-0000-000000000000",
      url: "https://x.private.blob.vercel-storage.com/creatives/cr-a-review/k.png",
      fileName: "a.png",
    });
    expect(result).toEqual({ ok: false, error: NO_PERMISSION, retryable: false });
    expect(writes(h.prisma)).toBe(0);
  });

  it("share, edit details, add and delete evidence", async () => {
    const data = form({ creativeId: "cr-a-review", name: "New", format: "FEED", title: "Evidence", type: "OTHER", evidenceId: "e1" });
    for (const action of [actions.shareForReview, actions.updateCreativeDetails, actions.saveEvidence, actions.deleteEvidence]) {
      expect((await action(undefined, data))?.error).toBe(NO_PERMISSION);
    }
    expect(writes(h.prisma)).toBe(0);
  });
});

describe("client decisions", () => {
  it("are refused for TEAM users", async () => {
    h.user = TEAM;
    const result = await actions.submitDecision(undefined, form({ creativeId: "cr-a-review", versionId: "v-a-1", decision: "APPROVED" }));
    expect(result?.error).toBe(NO_PERMISSION);
    expect(writes(h.prisma)).toBe(0);
  });

  it("cannot reach another client's creative (cross-client denial)", async () => {
    h.user = CLIENT_B;
    const result = await actions.submitDecision(undefined, form({ creativeId: "cr-a-review", versionId: "v-a-1", decision: "APPROVED" }));
    expect(result?.error).toBe(NOT_FOUND);
    expect(writes(h.prisma)).toBe(0);
  });

  it("cannot reach a draft, even in the client's own project (draft privacy)", async () => {
    h.user = CLIENT_A;
    const result = await actions.submitDecision(undefined, form({ creativeId: "cr-a-draft", versionId: "v-a-draft-1", decision: "APPROVED" }));
    expect(result?.error).toBe(NOT_FOUND);
    expect(writes(h.prisma)).toBe(0);
  });

  it("require a reason when requesting changes", async () => {
    h.user = CLIENT_A;
    const result = await actions.submitDecision(
      undefined,
      form({ creativeId: "cr-a-review", versionId: "v-a-1", decision: "CHANGES_REQUESTED", reason: "short" }),
    );
    expect(result?.fieldErrors?.reason).toBeDefined();
    expect(writes(h.prisma)).toBe(0);
  });

  it("are tied to the reviewed version and guarded against newer versions", async () => {
    h.user = CLIENT_A;
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    const result = await actions.submitDecision(undefined, form({ creativeId: "cr-a-review", versionId: "v-a-1", decision: "APPROVED" }));
    expect(result?.ok).toBeDefined();

    expect(h.prisma.creative.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "cr-a-review",
      status: "IN_REVIEW",
      project: { clientId: CLIENT_A.id },
      versions: { none: { versionNumber: { gt: 1 } } },
    });
    expect(h.prisma.approval.create.mock.calls[0][0].data).toMatchObject({
      versionId: "v-a-1",
      userId: CLIENT_A.id,
      status: "APPROVED",
    });
  });

  it("are rejected without writing history when the guard matches nothing (stale page)", async () => {
    h.user = CLIENT_A;
    h.prisma.creative.updateMany.mockResolvedValue({ count: 0 });
    const result = await actions.submitDecision(undefined, form({ creativeId: "cr-a-review", versionId: "v-a-1", decision: "APPROVED" }));
    expect(result?.error).toBeDefined();
    expect(h.prisma.approval.create).not.toHaveBeenCalled();
    expect(h.prisma.activity.create).not.toHaveBeenCalled();
  });
});

describe("comments", () => {
  it("cannot be posted on another client's creative", async () => {
    h.user = CLIENT_B;
    const result = await actions.addComment(undefined, form({ creativeId: "cr-a-review", versionId: "v-a-1", content: "hello" }));
    expect(result?.error).toBe(NOT_FOUND);
    expect(h.prisma.comment.create).not.toHaveBeenCalled();
  });

  it("cannot target a version that belongs to a different creative", async () => {
    h.user = CLIENT_A;
    const result = await actions.addComment(undefined, form({ creativeId: "cr-a-review", versionId: "v-b-1", content: "hello" }));
    expect(result?.error).toMatch(/version is no longer available/);
    expect(h.prisma.comment.create).not.toHaveBeenCalled();
  });
});
