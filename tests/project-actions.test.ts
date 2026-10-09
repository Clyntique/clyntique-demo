import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, TEAM, createPrismaMock, form, type PrismaMock } from "./helpers";

// Pins the current rules: only TEAM creates projects; nobody creates creatives
// through the team flow any more (clients create submissions instead).

const h = vi.hoisted(() => ({ user: null as CurrentUser | null, prisma: null as unknown as PrismaMock }));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
// Mirrors requireRole in src/lib/auth/dal.ts: wrong role → redirect home.
vi.mock("@/lib/auth/dal", () => ({
  requireRole: async (role: string) => {
    if (!h.user) throw new Error("REDIRECT /auth/login");
    if (h.user.role !== role) throw new Error(`REDIRECT ${h.user.role === "TEAM" ? "/admin" : "/dashboard"}`);
    return h.user;
  },
}));

const { createProject, createCreative } = await import("@/app/admin/projects/actions");

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.user = null;
});

describe("project and creative creation", () => {
  it("redirects a CLIENT away without writing anything", async () => {
    h.user = CLIENT_A;
    await expect(createProject(undefined, form({ name: "Mine", clientId: CLIENT_A.id }))).rejects.toThrow("REDIRECT /dashboard");
    await expect(createCreative()).rejects.toThrow("REDIRECT /dashboard");
    expect(h.prisma.project.create).not.toHaveBeenCalled();
    expect(h.prisma.creative.create).not.toHaveBeenCalled();
  });

  it("only assigns projects to existing CLIENT accounts", async () => {
    h.user = TEAM;
    const result = await createProject(undefined, form({ name: "Campaign", clientId: TEAM.id }));
    expect(result?.fieldErrors?.clientId).toBeDefined();
    expect(h.prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: TEAM.id, role: "CLIENT" });
    expect(h.prisma.project.create).not.toHaveBeenCalled();
  });

  it("no longer lets TEAM create creatives (client-owned submissions; D6 deferred)", async () => {
    h.user = TEAM;
    const result = await createCreative();
    expect(result?.error).toMatch(/submitted by the client/);
    expect(h.prisma.creative.create).not.toHaveBeenCalled();
  });
});
