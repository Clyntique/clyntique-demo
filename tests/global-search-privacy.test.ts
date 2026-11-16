import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// Regression tests for the PR C search privacy fixes (R1, R2, R3, Nov 16):
// Team search must never show client work the team has not received.

const h = vi.hoisted(() => ({
  prisma: null as unknown as PrismaMock,
  currentUser: null as CurrentUser | null,
}));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

vi.mock("@/lib/auth/dal", () => ({
  getCurrentUser: vi.fn(async () => h.currentUser),
}));

import { searchGlobal } from "@/lib/search/actions";

const SUBMITTED_AT = new Date("2026-11-10T10:00:00Z");
const BEFORE = new Date("2026-11-10T09:00:00Z");
const AFTER = new Date("2026-11-10T11:00:00Z");

function attachment(createdAt: Date, opts: { withdrawnAt?: Date | null; status?: string; submittedAt?: Date | null } = {}) {
  return {
    createdAt,
    withdrawnAt: opts.withdrawnAt ?? null,
    creative: {
      workflow: "SUBMISSION_REVIEW",
      status: opts.status ?? "CHANGES_REQUESTED",
      rounds: opts.submittedAt === null ? [] : [{ submittedAt: opts.submittedAt ?? SUBMITTED_AT }],
    },
  };
}

function record(id: string, ownerClientId: string | null, attachments: ReturnType<typeof attachment>[]) {
  return {
    id,
    title: `Record ${id} sunscreen`,
    claimText: "Clinically tested sunscreen claim",
    source: null,
    status: "SUBMITTED",
    type: "STUDY",
    ownerClientId,
    attachments,
    updatedAt: new Date(),
  };
}

function creative(
  id: string,
  name: string,
  rounds: { submittedName: string | null; submittedDescription: string | null }[],
  opts: { workflow?: string; description?: string | null } = {},
) {
  return {
    id,
    name,
    description: opts.description ?? null,
    format: "FEED",
    status: "CHANGES_REQUESTED",
    workflow: opts.workflow ?? "SUBMISSION_REVIEW",
    project: { id: "p-1", name: "Clinic Project" },
    rounds,
    updatedAt: new Date(),
  };
}

const group = (res: Awaited<ReturnType<typeof searchGlobal>>, category: string) =>
  res.groups.find((g) => g.category === category)?.items ?? [];

describe("Search privacy fixes (R1–R3)", () => {
  beforeEach(() => {
    h.prisma = createPrismaMock();
  });

  describe("R1: Team evidence results follow teamMaySeeRecord", () => {
    beforeEach(() => {
      h.currentUser = TEAM;
    });

    it("hides a client record attached after the last submission", async () => {
      h.prisma.evidenceRecord.findMany.mockResolvedValue([record("late", CLIENT_A.id, [attachment(AFTER)])]);
      const res = await searchGlobal("sunscreen");
      expect(group(res, "evidence")).toHaveLength(0);
    });

    it("shows a client record that reached the team with a submission", async () => {
      h.prisma.evidenceRecord.findMany.mockResolvedValue([record("sent", CLIENT_A.id, [attachment(BEFORE)])]);
      const res = await searchGlobal("sunscreen");
      expect(group(res, "evidence").map((i) => i.id)).toEqual(["evidence-sent"]);
    });

    it("hides records whose only attachment was withdrawn, is on a draft, or was never submitted", async () => {
      h.prisma.evidenceRecord.findMany.mockResolvedValue([
        record("withdrawn", CLIENT_A.id, [attachment(BEFORE, { withdrawnAt: AFTER })]),
        record("draft", CLIENT_A.id, [attachment(BEFORE, { status: "DRAFT" })]),
        record("never", CLIENT_A.id, [attachment(BEFORE, { submittedAt: null })]),
        record("none", CLIENT_A.id, []),
      ]);
      const res = await searchGlobal("sunscreen");
      expect(group(res, "evidence")).toHaveLength(0);
    });

    it("always shows Clyntique-owned records", async () => {
      h.prisma.evidenceRecord.findMany.mockResolvedValue([record("ours", null, [])]);
      const res = await searchGlobal("sunscreen");
      expect(group(res, "evidence").map((i) => i.id)).toEqual(["evidence-ours"]);
    });

    it("over-fetches and still returns at most 4 visible records", async () => {
      const rows = [
        ...Array.from({ length: 5 }, (_, i) => record(`late-${i}`, CLIENT_A.id, [attachment(AFTER)])),
        ...Array.from({ length: 6 }, (_, i) => record(`ok-${i}`, CLIENT_A.id, [attachment(BEFORE)])),
      ];
      h.prisma.evidenceRecord.findMany.mockResolvedValue(rows);
      const res = await searchGlobal("sunscreen");
      const call = h.prisma.evidenceRecord.findMany.mock.calls[0][0];
      expect(call.take).toBeGreaterThan(4);
      expect(call.select.attachments).toBeDefined();
      expect(group(res, "evidence").map((i) => i.id)).toEqual(["evidence-ok-0", "evidence-ok-1", "evidence-ok-2", "evidence-ok-3"]);
    });

    it("clients keep seeing their own records unchanged, including unsubmitted ones", async () => {
      h.currentUser = CLIENT_A;
      h.prisma.evidenceRecord.findMany.mockResolvedValue([record("mine", CLIENT_A.id, [attachment(AFTER)])]);
      const res = await searchGlobal("sunscreen");
      expect(group(res, "evidence").map((i) => i.id)).toEqual(["evidence-mine"]);
      expect(h.prisma.evidenceRecord.findMany.mock.calls[0][0].where.AND[0]).toEqual({ ownerClientId: CLIENT_A.id });
    });
  });

  describe("R2: Team creative results use the submitted snapshot", () => {
    beforeEach(() => {
      h.currentUser = TEAM;
    });

    it("does not match or show a title the client edited after submitting", async () => {
      h.prisma.creative.findMany.mockResolvedValue([
        creative("c-1", "Secret new headline", [{ submittedName: "Summer skin offer", submittedDescription: null }]),
      ]);
      const res = await searchGlobal("secret");
      expect(group(res, "creatives")).toHaveLength(0);
    });

    it("matches the submitted title and shows it instead of the live title", async () => {
      h.prisma.creative.findMany.mockResolvedValue([
        creative("c-1", "Secret new headline", [{ submittedName: "Summer skin offer", submittedDescription: null }]),
      ]);
      const res = await searchGlobal("summer");
      const items = group(res, "creatives");
      expect(items.map((i) => i.title)).toEqual(["Summer skin offer"]);
      expect(items[0].href).toBe("/admin/creatives/c-1");
    });

    it("does not match an edited description, only the submitted one", async () => {
      h.prisma.creative.findMany.mockResolvedValue([
        creative("c-1", "Summer skin offer", [{ submittedName: "Summer skin offer", submittedDescription: "Gentle peel" }], {
          description: "Unsubmitted botox wording",
        }),
      ]);
      expect(group(await searchGlobal("botox"), "creatives")).toHaveLength(0);
      expect(group(await searchGlobal("peel"), "creatives")).toHaveLength(1);
    });

    it("never shows a creative with no submitted round", async () => {
      h.prisma.creative.findMany.mockResolvedValue([creative("c-2", "Summer draft", [])]);
      expect(group(await searchGlobal("summer"), "creatives")).toHaveLength(0);
    });

    it("falls back to the creative's fields for pre-snapshot rounds and legacy creatives", async () => {
      h.prisma.creative.findMany.mockResolvedValue([
        creative("c-3", "Summer old round", [{ submittedName: null, submittedDescription: null }]),
        creative("c-4", "Summer legacy", [], { workflow: "LEGACY_CLIENT_APPROVAL" }),
      ]);
      const res = await searchGlobal("summer");
      expect(group(res, "creatives").map((i) => i.title)).toEqual(["Summer old round", "Summer legacy"]);
    });

    it("queries round snapshots for submissions, not the live creative fields", async () => {
      await searchGlobal("summer");
      const where = h.prisma.creative.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ NOT: { workflow: "SUBMISSION_REVIEW", status: "DRAFT" } });
      const branches = where.AND[1].OR;
      // Live name/description are only used for legacy creatives and pre-snapshot rounds.
      expect(branches).toContainEqual(expect.objectContaining({ workflow: "LEGACY_CLIENT_APPROVAL" }));
      expect(branches).toContainEqual(expect.objectContaining({ rounds: { some: { submittedName: null } } }));
      expect(branches.filter((b: Record<string, unknown>) => !("workflow" in b) && !("rounds" in b))).toHaveLength(0);
    });

    it("clients still find their own creatives by their current title", async () => {
      h.currentUser = CLIENT_A;
      h.prisma.creative.findMany.mockResolvedValue([
        creative("c-1", "Secret new headline", [{ submittedName: "Summer skin offer", submittedDescription: null }]),
      ]);
      const res = await searchGlobal("secret");
      expect(group(res, "creatives").map((i) => i.title)).toEqual(["Secret new headline"]);
    });
  });

  describe("R3: clients only see the active, verified policy version", () => {
    it("limits the loaded version to ACTIVE + VERIFIED for clients", async () => {
      h.currentUser = CLIENT_A;
      await searchGlobal("health");
      const call = h.prisma.policyRule.findMany.mock.calls[0][0];
      expect(call.select.versions.where).toEqual({ status: "ACTIVE", verificationStatus: "VERIFIED" });
    });

    it("keeps every version available to Team", async () => {
      h.currentUser = TEAM;
      await searchGlobal("health");
      const call = h.prisma.policyRule.findMany.mock.calls[0][0];
      expect(call.select.versions.where).toBeUndefined();
    });
  });
});
