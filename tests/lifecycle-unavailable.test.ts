import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_A, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// The lifecycle tables may not exist yet on a given database (the Oct 19
// migration is applied per environment, by approval). Existing pages must
// keep working, and the new pages must say so instead of failing.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
class KnownRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
vi.mock("@/generated/prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: KnownRequestError } }));

const lifecycle = await import("@/lib/data/lifecycle");
const { getPolicyImpact } = await import("@/lib/data/policy-impact");

const submitted = { id: "s1", status: "SUBMITTED", project: { clientId: CLIENT_A.id } };

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.prisma.creative.findFirst.mockResolvedValue(submitted);
});

describe("lifecycle loaders without the lifecycle tables", () => {
  it("getScanHistory returns an empty history instead of breaking the submission page", async () => {
    h.prisma.aIScanRun.findMany.mockRejectedValue(new KnownRequestError("P2021"));
    expect(await lifecycle.getScanHistory(TEAM, "s1")).toEqual([]);
  });

  it("getLifecycle and getPolicyImpact signal 'unavailable' so the pages show a notice", async () => {
    h.prisma.aIScanRun.findMany.mockRejectedValue(new KnownRequestError("P2021"));
    await expect(lifecycle.getLifecycle(TEAM, "s1")).rejects.toBeInstanceOf(lifecycle.LifecycleUnavailableError);
    h.prisma.policyRuleEvent.findMany.mockRejectedValue(new KnownRequestError("P2021"));
    await expect(getPolicyImpact(TEAM)).rejects.toBeInstanceOf(lifecycle.LifecycleUnavailableError);
  });

  it("any other database error still surfaces", async () => {
    h.prisma.aIScanRun.findMany.mockRejectedValue(new KnownRequestError("P1001"));
    await expect(lifecycle.getScanHistory(TEAM, "s1")).rejects.toThrow("P1001");
    await expect(lifecycle.getLifecycle(TEAM, "s1")).rejects.toThrow("P1001");
  });

  it("a client never reaches the scan history loader's query", async () => {
    expect(await lifecycle.getScanHistory(CLIENT_A, "s1")).toEqual([]);
    expect(h.prisma.aIScanRun.findMany).not.toHaveBeenCalled();
  });
});
