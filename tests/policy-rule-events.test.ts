import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { createPrismaMock, withReferenceCodes, type PrismaMock } from "./helpers";

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
  h.prisma = withReferenceCodes(createPrismaMock());
});

describe("policy rule events", () => {
  it("createDbPolicyRule appends RULE_CREATED for v1, which stays unactivated", async () => {
    h.prisma.policyRule.findUnique.mockResolvedValue(null);
    h.prisma.policyRule.create.mockResolvedValue({ id: "rule-1" });
    h.prisma.policyRuleVersion.create.mockResolvedValue({ id: "ver-1", status: "PENDING_APPROVAL" });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule());
    await db.createDbPolicyRule(
      { code: "syn-test-01", title: "Synthetic rule", authorityType: "INTERNAL_RISK", jurisdictionCode: "US", industry: "GENERAL", category: "DISCLOSURE", summary: "Synthetic summary text", legalExplanation: "e", remediationAction: "r", applicabilityConditions: [], effectiveFrom: new Date().toISOString(), sources: [], status: "DRAFT" },
      author,
    );
    expect(events()).toEqual([expect.objectContaining({ ruleId: "rule-1", versionId: "ver-1", kind: "RULE_CREATED", actorId: author.id })]);
    expect(events()[0].note).toMatch(/not active until verified and approved/);
  });

  it("proposeDbRuleVersion appends VERSION_PROPOSED with the change summary", async () => {
    h.prisma.policyRule.findUnique.mockResolvedValue({ id: "rule-1", versions: [{ versionNumber: 1 }] });
    h.prisma.policyRuleVersion.create.mockResolvedValue({ id: "ver-2" });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule("PENDING_APPROVAL", 2));
    await db.proposeDbRuleVersion(
      { ruleId: "rule-1", title: "Synthetic rule", summary: "Synthetic summary text", legalExplanation: "e", remediationAction: "r", applicabilityConditions: [], effectiveFrom: new Date().toISOString(), changeSummary: "Tightened the disclosure wording", sources: [], status: "DRAFT" },
      author,
    );
    expect(events()).toEqual([expect.objectContaining({ ruleId: "rule-1", versionId: "ver-2", kind: "VERSION_PROPOSED", actorId: author.id, note: "v2 proposed as DRAFT: Tightened the disclosure wording" })]);
  });

  it("approveDbRuleVersion appends VERSION_APPROVED naming the superseded version, only after maker-checker and source checks pass", async () => {
    const pending = { id: "ver-2", ruleId: "rule-1", versionNumber: 2, createdById: author.id, status: "PENDING_APPROVAL", verificationStatus: "VERIFIED", verifiedById: author.id, effectiveFrom: new Date(), changeSummary: "c" };
    h.prisma.policyRuleVersion.findUnique.mockResolvedValue(pending);
    // Author can't approve their own version: no event.
    await expect(db.approveDbRuleVersion("rule-1", "ver-2", author)).rejects.toThrow();
    // An unverified cited source blocks approval: no event.
    h.prisma.policyRuleVersionSource.findMany.mockResolvedValueOnce([{ source: { name: "Draft source", verificationStatus: "UNVERIFIED" } }]);
    await expect(db.approveDbRuleVersion("rule-1", "ver-2", approver)).rejects.toThrow(/VERIFIED/);
    expect(h.prisma.policyRuleEvent.create).not.toHaveBeenCalled();

    h.prisma.policyRuleVersionSource.findMany.mockResolvedValue([{ source: { name: "Verified source", verificationStatus: "VERIFIED" } }]);
    h.prisma.policyRuleVersion.findMany.mockResolvedValue([{ versionNumber: 1 }]); // the active version being superseded
    h.prisma.policyRuleVersion.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule("ACTIVE", 2));
    await db.approveDbRuleVersion("rule-1", "ver-2", approver, "Checked against the source text");
    expect(events()).toEqual([expect.objectContaining({ ruleId: "rule-1", versionId: "ver-2", kind: "VERSION_APPROVED", actorId: approver.id })]);
    expect(events()[0].note).toBe("v2 approved · supersedes v1 · Checked against the source text");
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

  it("verification is its own step: VERSION_VERIFIED records the verifier, and needs verified sources", async () => {
    const submitted = { id: "ver-2", ruleId: "rule-1", versionNumber: 2, createdById: author.id, status: "PENDING_APPROVAL", verificationStatus: "UNVERIFIED", sources: [{ source: { name: "Draft source", verificationStatus: "UNVERIFIED" } }] };
    h.prisma.policyRuleVersion.findUnique.mockResolvedValue(submitted);
    await expect(db.verifyDbRuleVersion("ver-2", approver, { result: "VERIFIED" })).rejects.toThrow(/Verify the cited source "Draft source" first/);
    expect(h.prisma.policyRuleEvent.create).not.toHaveBeenCalled();

    h.prisma.policyRuleVersion.findUnique.mockResolvedValue({ ...submitted, sources: [{ source: { name: "S", verificationStatus: "VERIFIED" } }] });
    h.prisma.policyRuleVersion.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule("PENDING_APPROVAL", 2));
    await db.verifyDbRuleVersion("ver-2", approver, { result: "VERIFIED", note: "Matches section 3 of the page" });
    const write = h.prisma.policyRuleVersion.updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(write.where).toMatchObject({ id: "ver-2", status: "PENDING_APPROVAL", verificationStatus: "UNVERIFIED" });
    expect(write.data).toMatchObject({ verificationStatus: "VERIFIED", verifiedById: approver.id, verificationNote: "Matches section 3 of the page" });
    expect(write.data).not.toHaveProperty("status"); // still waits for a different approver
    expect(events()).toEqual([expect.objectContaining({ kind: "VERSION_VERIFIED", actorId: approver.id, versionId: "ver-2" })]);
  });

  it("returning a version sends it back to DRAFT with the reason; a reason is required", async () => {
    h.prisma.policyRuleVersion.findUnique.mockResolvedValue({ id: "ver-2", ruleId: "rule-1", versionNumber: 2, createdById: author.id, status: "PENDING_APPROVAL", verificationStatus: "UNVERIFIED", sources: [] });
    await expect(db.verifyDbRuleVersion("ver-2", approver, { result: "REQUIRES_REVIEW" })).rejects.toThrow(/Say what needs review/);
    h.prisma.policyRuleVersion.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule("PENDING_APPROVAL", 2));
    await db.verifyDbRuleVersion("ver-2", approver, { result: "REQUIRES_REVIEW", note: "The page shows no update date; section numbering unclear." });
    const write = h.prisma.policyRuleVersion.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(write.data).toMatchObject({ status: "DRAFT", verificationStatus: "REQUIRES_REVIEW", reviewNote: expect.stringContaining("no update date") });
    expect(events()).toEqual([expect.objectContaining({ kind: "VERSION_RETURNED" })]);
  });

  it("an approved version can't be verified, edited or submitted again", async () => {
    const active = { id: "ver-1", ruleId: "rule-1", versionNumber: 1, createdById: author.id, status: "ACTIVE", verificationStatus: "VERIFIED", sources: [], rule: { versions: [{ status: "ACTIVE", approvedAt: new Date() }] } };
    h.prisma.policyRuleVersion.findUnique.mockResolvedValue(active);
    await expect(db.verifyDbRuleVersion("ver-1", approver, { result: "VERIFIED" })).rejects.toThrow(/submitted for verification/);
    await expect(db.submitDbRuleVersion("ver-1", author)).rejects.toThrow(/Only a draft/);
    await expect(
      db.updateDbDraftRuleVersion({ versionId: "ver-1", title: "Changed", summary: "Changed summary text", legalExplanation: "", remediationAction: "", applicabilityConditions: [], sources: [] }, author),
    ).rejects.toThrow(/Only a draft version can be edited/);
    expect(h.prisma.policyRuleVersion.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.policyRuleEvent.create).not.toHaveBeenCalled();
  });

  it("editing a draft writes VERSION_EDITED and replaces only that draft's citations", async () => {
    h.prisma.policyRuleVersion.findUnique.mockResolvedValue({ id: "ver-1", ruleId: "rule-1", versionNumber: 1, status: "DRAFT", verificationStatus: "REQUIRES_REVIEW", updatedAt: new Date(), rule: { versions: [{ status: "DRAFT", approvedAt: null }] } });
    h.prisma.policySource.count.mockResolvedValue(1);
    h.prisma.policyRuleVersion.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.policyRule.findMany.mockResolvedValue(loadedRule("PENDING_APPROVAL", 1));
    await db.updateDbDraftRuleVersion(
      {
        versionId: "ver-1",
        title: "Synthetic rule",
        summary: "Corrected summary in our own words",
        legalExplanation: "",
        remediationAction: "",
        applicabilityConditions: [],
        restrictedClaims: ["Guaranteed results"],
        sources: [{ sourceId: "src-1", sectionReference: "Section 2", sectionTitle: "Claims", directUrl: "https://www.tiktok.com/legal/page/global/ad-policy", excerpt: "short" }],
      },
      author,
    );
    expect(h.prisma.policyRuleVersionSource.deleteMany).toHaveBeenCalledWith({ where: { versionId: "ver-1" } });
    expect(h.prisma.policyRuleVersion.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "ver-1", status: "DRAFT" }, data: { restrictedClaims: ["Guaranteed results"] } });
    expect(events()).toEqual([expect.objectContaining({ kind: "VERSION_EDITED", actorId: author.id })]);
  });

  it("sources: adding, editing and verifying each write a source event; editing clears a verification", async () => {
    h.prisma.policySource.create.mockResolvedValue({ id: "src-1", name: "TikTok ad policies", authorityName: "TikTok", authorityType: "PLATFORM_POLICY", jurisdictionCode: "GLOBAL", officialUrl: "https://ads.tiktok.com/x", publishedAt: null, lastAuditedAt: new Date(), verificationStatus: "UNVERIFIED" });
    const { source, warnings } = await db.createDbPolicySource(
      { name: "TikTok ad policies", authorityName: "TikTok", authorityType: "PLATFORM_POLICY", jurisdictionCode: "GLOBAL", officialUrl: "https://ads.tiktok.com/help/article/x", sourceKind: "PLATFORM_POLICY_PAGE", accessNote: "Public page, read in a browser." },
      author,
    );
    expect(source.verificationStatus).toBe("UNVERIFIED");
    expect(warnings).toEqual([]);
    expect(h.prisma.policySource.create.mock.calls[0][0].data).toMatchObject({ verificationStatus: "UNVERIFIED", sourceKind: "PLATFORM_POLICY_PAGE" });

    h.prisma.policySource.findUnique.mockResolvedValue({ id: "src-1", verificationStatus: "VERIFIED", updatedAt: new Date() });
    h.prisma.policySource.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.policySource.findUniqueOrThrow.mockResolvedValue({ id: "src-1", name: "n", authorityName: "a", authorityType: "PLATFORM_POLICY", jurisdictionCode: "GLOBAL", officialUrl: "https://ads.tiktok.com/x", publishedAt: null, lastAuditedAt: new Date(), verificationStatus: "UNVERIFIED" });
    await db.updateDbPolicySource("src-1", { name: "TikTok ad policies", authorityName: "TikTok", authorityType: "PLATFORM_POLICY", jurisdictionCode: "GLOBAL", officialUrl: "https://ads.tiktok.com/help/article/y" }, author);
    expect(h.prisma.policySource.updateMany.mock.calls[0][0].data).toMatchObject({ verificationStatus: "UNVERIFIED", verifiedById: null });

    h.prisma.policySource.update.mockResolvedValue({ id: "src-1", name: "n", authorityName: "a", authorityType: "PLATFORM_POLICY", jurisdictionCode: "GLOBAL", officialUrl: "https://ads.tiktok.com/x", publishedAt: null, lastAuditedAt: new Date(), verificationStatus: "VERIFIED", verifiedById: approver.id, verifiedAt: new Date(), verifiedBy: { name: approver.name } });
    const verified = await db.verifyDbPolicySource("src-1", approver, { note: "Official TikTok domain, current page" });
    expect(verified).toMatchObject({ verificationStatus: "VERIFIED", verifiedByName: approver.name });
    expect(events().map((e) => e.kind)).toEqual(["SOURCE_CREATED", "SOURCE_EDITED", "SOURCE_VERIFIED"]);
    expect(events().every((e) => e.sourceId === "src-1" && !e.ruleId)).toBe(true);
  });

  it("source input is validated: https only, a known market, and a warning off official domains", async () => {
    const base = { name: "Some source", authorityName: "Publisher", authorityType: "PLATFORM_POLICY", jurisdictionCode: "US" };
    await expect(db.createDbPolicySource({ ...base, officialUrl: "http://www.facebook.com/policies" }, author)).rejects.toThrow(/https/);
    await expect(db.createDbPolicySource({ ...base, officialUrl: "javascript:alert(1)" }, author)).rejects.toThrow();
    await expect(db.createDbPolicySource({ ...base, jurisdictionCode: "ZZ", officialUrl: "https://www.facebook.com/policies" }, author)).rejects.toThrow(/market/);
    h.prisma.policySource.create.mockResolvedValue({ id: "src-2", name: "n", authorityName: "a", authorityType: "PLATFORM_POLICY", jurisdictionCode: "US", officialUrl: "https://blog.example.com/x", publishedAt: null, lastAuditedAt: new Date(), verificationStatus: "UNVERIFIED" });
    const { warnings } = await db.createDbPolicySource({ ...base, officialUrl: "https://blog.example.com/x" }, author);
    expect(warnings[0]).toMatch(/not on a known official domain/);
  });
});
