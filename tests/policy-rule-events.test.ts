import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { createPrismaMock, type PrismaMock } from "./helpers";

// Living rulebook (Oct 19 sprint): every Policy Library command appends a
// PolicyRuleEvent in the same transaction. Nothing here activates a rule;
// approval still needs a second administrator and verified sources.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

const db = await import("@/lib/policy/db");

const author: CurrentUser = { id: "usr-admin-1", name: "Policy Administrator", email: "team@clyntique.demo", role: "TEAM", isPolicyAdmin: true };
const approver: CurrentUser = { id: "usr-admin-2", name: "Second Approver", email: "compliance-admin@clyntique.com", role: "TEAM", isPolicyAdmin: true };
const reviewer: CurrentUser = { id: "usr-team-3", name: "Plain reviewer", email: "x@test.invalid", role: "TEAM" };

function loadedRule(status: "PENDING_APPROVAL" | "ACTIVE" = "PENDING_APPROVAL", versionNumber = 1) {
  return [
    {
      id: "rule-1",
      code: "SYN-TEST-01",
      title: "Synthetic rule",
      authorityType: "INTERNAL_RISK",
      jurisdictionCode: "US",
      subJurisdiction: null,
      platformCode: null,
      industry: "GENERAL",
      category: "DISCLOSURE",
      currentVersionNumber: versionNumber,
      createdAt: new Date(),
      updatedAt: new Date(),
      versions: [
        {
          id: `ver-${versionNumber}`,
          ruleId: "rule-1",
          versionNumber,
          title: "Synthetic rule",
          summary: "s",
          legalExplanation: "e",
          remediationAction: "r",
          applicabilityConditions: [],
          exceptions: [],
          effectiveFrom: new Date(),
          effectiveTo: null,
          status,
          verificationStatus: status === "ACTIVE" ? "VERIFIED" : "UNVERIFIED",
          changeSummary: "c",
          createdById: author.id,
          createdBy: { id: author.id, name: author.name },
          approvedById: null,
          approvedBy: null,
          approvedAt: null,
          createdAt: new Date(),
          sources: [],
        },
      ],
    },
  ];
}

const events = () => h.prisma.policyRuleEvent.create.mock.calls.map((c) => c[0].data);

beforeEach(() => {
  h.prisma = createPrismaMock();
});

describe("policy rule events", () => {
  it("createDbPolicyRule appends RULE_CREATED for v1, which stays unactivated", async () => {
    h.prisma.policyRule.findUnique.mockResolvedValue(null);
    h.prisma.policyRule.create.mockResolvedValue({ id: "rule-1" });
    h.prisma.policyRuleVersion.create.mockResolvedValue({ id: "ver-1", status: "PENDING_APPROVAL" });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule());
    await db.createDbPolicyRule(
      { code: "syn-test-01", title: "Synthetic rule", authorityType: "INTERNAL_RISK", jurisdictionCode: "US", industry: "GENERAL", category: "DISCLOSURE", summary: "s", legalExplanation: "e", remediationAction: "r", applicabilityConditions: [], effectiveFrom: new Date().toISOString(), sources: [], status: "PENDING_APPROVAL" },
      author,
    );
    expect(events()).toEqual([expect.objectContaining({ ruleId: "rule-1", versionId: "ver-1", kind: "RULE_CREATED", actorId: author.id })]);
    expect(events()[0].note).toMatch(/not active until approved/);
  });

  it("proposeDbRuleVersion appends VERSION_PROPOSED with the change summary", async () => {
    h.prisma.policyRule.findUnique.mockResolvedValue({ id: "rule-1", versions: [{ versionNumber: 1 }] });
    h.prisma.policyRuleVersion.create.mockResolvedValue({ id: "ver-2" });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule("PENDING_APPROVAL", 2));
    await db.proposeDbRuleVersion(
      { ruleId: "rule-1", title: "Synthetic rule", summary: "s", legalExplanation: "e", remediationAction: "r", applicabilityConditions: [], effectiveFrom: new Date().toISOString(), changeSummary: "Tightened the disclosure wording", sources: [] },
      author,
    );
    expect(events()).toEqual([expect.objectContaining({ ruleId: "rule-1", versionId: "ver-2", kind: "VERSION_PROPOSED", actorId: author.id, note: "v2 proposed: Tightened the disclosure wording" })]);
  });

  it("approveDbRuleVersion appends VERSION_APPROVED naming the superseded version, only after maker-checker and source checks pass", async () => {
    const pending = { id: "ver-2", ruleId: "rule-1", versionNumber: 2, createdById: author.id, status: "PENDING_APPROVAL", changeSummary: "c" };
    h.prisma.policyRuleVersion.findUnique.mockResolvedValue(pending);
    // Author can't approve their own version: no event.
    await expect(db.approveDbRuleVersion("rule-1", "ver-2", author)).rejects.toThrow();
    // An unverified cited source blocks approval: no event.
    h.prisma.policyRuleVersionSource.findMany.mockResolvedValueOnce([{ source: { name: "Draft source", verificationStatus: "UNVERIFIED" } }]);
    await expect(db.approveDbRuleVersion("rule-1", "ver-2", approver)).rejects.toThrow(/VERIFIED/);
    expect(h.prisma.policyRuleEvent.create).not.toHaveBeenCalled();

    h.prisma.policyRuleVersionSource.findMany.mockResolvedValue([]);
    h.prisma.policyRuleVersion.findMany.mockResolvedValue([{ versionNumber: 1 }]); // the active version being superseded
    h.prisma.policyRuleVersion.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule("ACTIVE", 2));
    await db.approveDbRuleVersion("rule-1", "ver-2", approver, "Checked against the source text");
    expect(events()).toEqual([expect.objectContaining({ ruleId: "rule-1", versionId: "ver-2", kind: "VERSION_APPROVED", actorId: approver.id })]);
    expect(events()[0].note).toBe("v2 approved and verified · supersedes v1 · Checked against the source text");
  });

  it("retireDbRule appends RULE_RETIRED and keeps the retired version rows", async () => {
    h.prisma.policyRuleVersion.findMany.mockResolvedValue([{ id: "ver-2", versionNumber: 2, status: "ACTIVE", changeSummary: "c" }]);
    await db.retireDbRule("rule-1", author, "Withdrawn by the authority");
    expect(events()).toEqual([expect.objectContaining({ ruleId: "rule-1", versionId: "ver-2", kind: "RULE_RETIRED", actorId: author.id, note: "retired v2 · Withdrawn by the authority" })]);
    expect(h.prisma.policyRuleVersion.deleteMany).not.toHaveBeenCalled();
  });

  it("a TEAM member without policy-admin rights can't write any of them", async () => {
    await expect(db.retireDbRule("rule-1", reviewer)).rejects.toThrow(/Policy Administrator/);
    await expect(db.proposeDbRuleVersion({ ruleId: "rule-1", title: "t", summary: "s", legalExplanation: "e", remediationAction: "r", applicabilityConditions: [], effectiveFrom: "", changeSummary: "x", sources: [] }, reviewer)).rejects.toThrow();
    expect(h.prisma.policyRuleEvent.create).not.toHaveBeenCalled();
  });
});
