import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

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

describe("Global Search & Command Palette (PR C)", () => {
  beforeEach(() => {
    h.prisma = createPrismaMock();
    h.currentUser = CLIENT_A;
  });

  describe("Authentication & Boundary Checks", () => {
    it("rejects unauthenticated requests with an error", async () => {
      h.currentUser = null;
      await expect(searchGlobal("skincare")).rejects.toThrow(/Unauthorized/i);
    });

    it("returns quick navigation shortcuts immediately when query is short (< 2 chars)", async () => {
      h.currentUser = CLIENT_A;
      const res = await searchGlobal("a");
      expect(res.groups).toHaveLength(1);
      expect(res.groups[0].category).toBe("navigation");
      expect(res.groups[0].items.length).toBeGreaterThan(0);
      expect(h.prisma.project.findMany).not.toHaveBeenCalled();
      expect(h.prisma.creative.findMany).not.toHaveBeenCalled();
      expect(h.prisma.policyRule.findMany).not.toHaveBeenCalled();
    });

    it("handles whitespace queries gracefully", async () => {
      h.currentUser = CLIENT_A;
      const res = await searchGlobal("   ");
      expect(res.groups).toHaveLength(1);
      expect(res.groups[0].category).toBe("navigation");
    });
  });

  describe("Client Scoping & Tenant Isolation", () => {
    it("strictly isolates client queries to own workspace entities", async () => {
      h.currentUser = CLIENT_A;

      h.prisma.project.findMany.mockResolvedValue([
        { id: "p-1", name: "Acne Campaign 2026", description: "Q1 Launch", updatedAt: new Date() },
      ]);
      h.prisma.creative.findMany.mockResolvedValue([
        { id: "c-1", name: "Before & After Video", format: "FEED", status: "IN_REVIEW", project: { id: "p-1", name: "Acne Campaign 2026" }, updatedAt: new Date() },
      ]);
      h.prisma.evidenceRecord.findMany.mockResolvedValue([
        { id: "ev-1", title: "Double-Blind Clinical Trial", claimText: "Reduces acne in 14 days", source: "Dermatol Res 2025", status: "VERIFIED", type: "STUDY", updatedAt: new Date() },
      ]);
      h.prisma.libraryDocument.findMany.mockResolvedValue([
        { id: "doc-1", title: "Study Protocol PDF", fileName: "protocol.pdf", source: "Internal", type: "STUDY", status: "READY", visibility: "PRIVATE", updatedAt: new Date() },
      ]);
      h.prisma.policyRule.findMany.mockResolvedValue([
        { id: "pol-1", code: "US-FTC-DISC-01", title: "Testimonial Disclosure Rule", jurisdictionCode: "US", category: "DISCLOSURE", currentVersionNumber: 1, versions: [{ versionNumber: 1, summary: "Clear disclosure required", status: "ACTIVE", verificationStatus: "VERIFIED" }] },
      ]);

      const res = await searchGlobal("Acne");

      // Verify Project query scope
      const projectWhere = h.prisma.project.findMany.mock.calls[0][0].where;
      expect(projectWhere.AND[0]).toEqual({ clientId: CLIENT_A.id });

      // Verify Creative query scope (belongs to client project)
      const creativeWhere = h.prisma.creative.findMany.mock.calls[0][0].where;
      expect(creativeWhere.AND[0]).toEqual(
        expect.objectContaining({
          project: { clientId: CLIENT_A.id },
        })
      );

      // Verify Evidence Record query scope
      const evidenceWhere = h.prisma.evidenceRecord.findMany.mock.calls[0][0].where;
      expect(evidenceWhere.AND[0]).toEqual({ ownerClientId: CLIENT_A.id });

      // Verify Library Document query scope
      const libraryWhere = h.prisma.libraryDocument.findMany.mock.calls[0][0].where;
      expect(libraryWhere.AND[0]).toEqual({
        AND: [
          { ownerClientId: CLIENT_A.id },
          { status: "READY" },
        ],
      });

      // Verify Policy Rule query scope (only ACTIVE and VERIFIED versions)
      const policyWhere = h.prisma.policyRule.findMany.mock.calls[0][0].where;
      expect(policyWhere.AND[0]).toEqual({
        versions: {
          some: {
            status: "ACTIVE",
            verificationStatus: "VERIFIED",
          },
        },
      });

      // Destination links must route to /dashboard/ or /policy-dashboard
      const projectItem = res.groups.find((g) => g.category === "projects")?.items[0];
      expect(projectItem?.href).toBe("/dashboard/projects/p-1");

      const creativeItem = res.groups.find((g) => g.category === "creatives")?.items[0];
      expect(creativeItem?.href).toBe("/dashboard/creatives/c-1");

      const evidenceItem = res.groups.find((g) => g.category === "evidence")?.items[0];
      expect(evidenceItem?.href).toBe("/dashboard/evidence/ev-1");

      const libraryItem = res.groups.find((g) => g.category === "knowledge")?.items[0];
      expect(libraryItem?.href).toBe("/dashboard/evidence/library/doc-1");

      const policyItem = res.groups.find((g) => g.category === "policies")?.items[0];
      expect(policyItem?.href).toBe("/policy-dashboard?rule=pol-1");
    });
  });

  describe("Team Scoping & Multi-Client Visibility", () => {
    it("allows Team users to search across projects while preserving draft and privacy boundaries", async () => {
      h.currentUser = TEAM;

      h.prisma.project.findMany.mockResolvedValue([
        { id: "p-1", name: "Client 1 Project", description: null, client: { name: "Client 1" }, updatedAt: new Date() },
        { id: "p-2", name: "Client 2 Project", description: null, client: { name: "Client 2" }, updatedAt: new Date() },
      ]);
      h.prisma.creative.findMany.mockResolvedValue([]);
      h.prisma.evidenceRecord.findMany.mockResolvedValue([]);
      h.prisma.libraryDocument.findMany.mockResolvedValue([]);
      h.prisma.policyRule.findMany.mockResolvedValue([]);

      const res = await searchGlobal("Project");

      // Team project scope is empty {} (sees all projects)
      const projectWhere = h.prisma.project.findMany.mock.calls[0][0].where;
      expect(projectWhere.AND[0]).toEqual({});

      // Team creative scope hides unsubmitted client drafts
      const creativeWhere = h.prisma.creative.findMany.mock.calls[0][0].where;
      expect(creativeWhere.AND[0]).toEqual({
        NOT: { workflow: "SUBMISSION_REVIEW", status: "DRAFT" },
      });

      // Team library scope only allows Clyntique reference docs OR client docs with TEAM visibility
      const libraryWhere = h.prisma.libraryDocument.findMany.mock.calls[0][0].where;
      expect(libraryWhere.AND[0]).toEqual({
        AND: [
          { OR: [{ ownerClientId: null }, { visibility: "TEAM" }] },
          { status: "READY" },
        ],
      });

      // Team policy scope does not restrict to ACTIVE/VERIFIED
      const policyWhere = h.prisma.policyRule.findMany.mock.calls[0][0].where;
      expect(policyWhere.AND[0]).toEqual({});

      // Team destination links must route to /admin/
      const projectItem = res.groups.find((g) => g.category === "projects")?.items[0];
      expect(projectItem?.href).toBe("/admin/projects/p-1");
      expect(projectItem?.subtitle).toBe("Client: Client 1");
    });
  });

  describe("Privacy & Intentional Search Guarantees (PR #31 Preservation)", () => {
    it("never writes KnowledgeQuery audit log rows when users search", async () => {
      h.currentUser = CLIENT_A;

      await searchGlobal("clinical trial evidence");

      expect(h.prisma.knowledgeQuery.create).not.toHaveBeenCalled();
      expect(h.prisma.knowledgeQuery.createMany).not.toHaveBeenCalled();
    });
  });

  describe("Sanitization & Robustness", () => {
    it("handles SQL injection tokens safely without throwing", async () => {
      h.currentUser = CLIENT_A;

      await expect(searchGlobal("' OR '1'='1' --")).resolves.not.toThrow();
      await expect(searchGlobal("<script>alert(1)</script>")).resolves.not.toThrow();
      await expect(searchGlobal("%_")).resolves.not.toThrow();
    });

    it("truncates excessively long queries to 80 characters", async () => {
      h.currentUser = CLIENT_A;
      const longQuery = "a".repeat(150);

      const res = await searchGlobal(longQuery);
      expect(res.query.length).toBeLessThanOrEqual(80);
    });

    it("measures execution latency in milliseconds", async () => {
      h.currentUser = CLIENT_A;

      const res = await searchGlobal("health");
      expect(typeof res.durationMs).toBe("number");
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
