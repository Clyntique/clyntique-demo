import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_A, CLIENT_B, CREATIVES, TEAM, createPrismaMock, matchesCreative, type PrismaMock } from "./helpers";

// Pins the read scoping used by every workspace page, list, count and the
// media route (via access.ts).

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

const workspace = await import("@/lib/data/workspace");

const visibleTo = (user: typeof TEAM) => CREATIVES.filter((c) => matchesCreative(workspace.creativeScope(user), c)).map((c) => c.id);

beforeEach(() => {
  h.prisma = createPrismaMock();
});

describe("creativeScope: draft privacy", () => {
  it("TEAM sees every project's submitted work and legacy creatives, never a client's draft submission", () => {
    expect(visibleTo(TEAM)).toEqual(["cr-a-review", "cr-a-draft", "cr-b-review", "sub-a-submitted", "sub-a-review"]);
  });

  it("CLIENT sees only their own projects: their draft submissions yes, legacy team drafts no", () => {
    expect(visibleTo(CLIENT_A)).toEqual(["cr-a-review", "sub-a-draft", "sub-a-submitted", "sub-a-review"]);
    expect(visibleTo(CLIENT_B)).toEqual(["cr-b-review", "sub-b-draft"]);
  });

  it("projectScope limits clients to their own projects", () => {
    expect(workspace.projectScope(TEAM)).toEqual({});
    expect(workspace.projectScope(CLIENT_A)).toEqual({ clientId: CLIENT_A.id });
  });
});

describe("workspace queries apply the scope", () => {
  it("getCreatives, getCreativeStatusCounts, getActivity and getProject", async () => {
    await workspace.getCreatives(CLIENT_A, { projectId: "p-a" });
    expect(h.prisma.creative.findMany.mock.calls[0][0].where).toEqual({ AND: [workspace.creativeScope(CLIENT_A), { projectId: "p-a" }] });

    await workspace.getCreativeStatusCounts(TEAM);
    expect(h.prisma.creative.groupBy.mock.calls[0][0].where).toEqual(workspace.creativeScope(TEAM));

    await workspace.getActivity(CLIENT_A);
    expect(h.prisma.activity.findMany.mock.calls[0][0].where).toEqual({ project: { clientId: CLIENT_A.id } });

    await workspace.getProject(CLIENT_A, "p-b");
    const projectQuery = h.prisma.project.findFirst.mock.calls[0][0];
    expect(projectQuery.where).toEqual({ AND: [{ id: "p-b" }, { clientId: CLIENT_A.id }] });
  });

  it("project progress counts follow the same draft privacy", async () => {
    await workspace.getProject(TEAM, "p-a");
    const teamFilter = h.prisma.project.findFirst.mock.calls[0][0].select.creatives.where;
    expect(CREATIVES.filter((c) => matchesCreative(teamFilter, c)).map((c) => c.id)).not.toContain("sub-a-draft");
    await workspace.getProject(CLIENT_A, "p-a");
    const clientFilter = h.prisma.project.findFirst.mock.calls[1][0].select.creatives.where;
    const forClient = CREATIVES.filter((c) => matchesCreative(clientFilter, c)).map((c) => c.id);
    expect(forClient).toContain("sub-a-draft");
    expect(forClient).not.toContain("cr-a-draft");
  });

  it("only TEAM can list client accounts", async () => {
    expect(await workspace.getClientOptions(CLIENT_A)).toEqual([]);
    expect(h.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("never selects password hashes for client options", async () => {
    await workspace.getClientOptions(TEAM);
    expect(h.prisma.user.findMany.mock.calls[0][0].select).toEqual({ id: true, name: true, email: true });
  });
});
