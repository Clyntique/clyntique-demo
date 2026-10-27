import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_A, TEAM, createPrismaMock, installCreativeStore, type PrismaMock } from "./helpers";

// P0 (Oct 27), milestone M6: Clyntique (Team) evidence, findings that cite a
// reviewed policy, and what the client sees of them (decisions D4, D5, D8).
// Prisma is mocked; all policy content is SYNTHETIC.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

const cmd = await import("@/lib/workflow/commands");
const reviewData = await import("@/lib/data/submission-review");
const access = await import("@/lib/review/access");

/** An ACTIVE, verified (V) and approved (B) rule version, as getDbPolicyRules reads it. */
function dbRule(versionId = "ver-ok") {
  return {
    id: "rule-1",
    code: "SYN-AES-01",
    title: "SYNTHETIC aesthetics rule",
    authorityType: "PLATFORM_POLICY",
    jurisdictionCode: "US",
    subJurisdiction: null,
    platformCode: "META",
    industry: "HEALTHCARE",
    category: "EFFICACY_CLAIM",
    currentVersionNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: versionId,
        ruleId: "rule-1",
        versionNumber: 1,
        title: "SYNTHETIC aesthetics rule",
        summary: "s",
        legalExplanation: "e",
        remediationAction: "r",
        applicabilityConditions: [],
        exceptions: [],
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
        changeSummary: "c",
        createdById: "a",
        createdAt: new Date(),
        approvedById: "b",
        verifiedById: "v",
        verifiedBy: { id: "v", name: "V" },
        approvedAt: new Date(),
        createdBy: { id: "a", name: "A" },
        approvedBy: { id: "b", name: "B" },
        sources: [
          {
            id: "cit-1",
            sourceId: "src-1",
            sectionReference: "SYN §1",
            sectionTitle: "Synthetic",
            directUrl: "https://example.test/synthetic",
            excerpt: null,
            source: { name: "SYNTHETIC SOURCE", authorityName: "Synthetic", verificationStatus: "VERIFIED" },
          },
        ],
      },
    ],
  };
}

/** A submission in review (US, Meta, healthcare), with round 1 on V1 in open cycle 1. */
function inReview(status = "IN_REVIEW") {
  h.prisma.creative.findFirst.mockResolvedValue({ id: "s1", name: "Spring promo", status, workflow: "SUBMISSION_REVIEW", projectId: "p-a", project: { name: "P", clientId: CLIENT_A.id } });
  h.prisma.creative.findUnique.mockImplementation(async ({ select }: { select?: Record<string, unknown> }) =>
    select?.markets
      ? {
          id: "s1",
          name: "Spring promo",
          description: null,
          context: null,
          format: "FEED",
          industry: "HEALTHCARE",
          markets: [{ market: { code: "US", name: "United States" } }],
          platforms: [{ platform: { code: "META", name: "Meta" } }],
        }
      : { id: "s1", name: "Spring promo", workflow: "SUBMISSION_REVIEW", status, projectId: "p-a", project: { clientId: CLIENT_A.id } },
  );
  h.prisma.submissionRound.findMany.mockResolvedValue([
    { id: "r1", cycleId: "c1", versionId: "v1", submittedName: "Spring promo", submittedDescription: null, submittedContext: null, submittedIndustry: "HEALTHCARE", version: { id: "v1", versionNumber: 1, fileUrl: null, mimeType: null } },
  ]);
  h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: null });
  h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v1", decisions: [] });
  h.prisma.policyRule.findMany.mockResolvedValue([dbRule()]);
  h.prisma.creative.updateMany.mockResolvedValue({ count: 1 }); // row lock
}

const FINDING = {
  creativeId: "s1",
  issue: "Unsupported results claim",
  explanation: "The ad promises results the evidence doesn't show.",
  severity: "HIGH",
  requiredAction: "PROVIDE_EVIDENCE",
  actionDetails: "Provide the study, or remove the claim.",
};

beforeEach(() => {
  h.prisma = createPrismaMock();
});

describe("findings that cite a reviewed policy", () => {
  it("records the claim, where it appears, suggested wording and a citable rule version", async () => {
    inReview();
    h.prisma.finding.create.mockResolvedValue({ id: "f1" });
    const res = await cmd.recordFinding(TEAM, {
      ...FINDING,
      claimText: "Results in 2 weeks",
      claimLocation: "Headline",
      suggestedRevision: "Individual results vary.",
      ruleVersionId: "ver-ok",
    });
    expect(res).toEqual({ ok: true, findingId: "f1" });
    expect(h.prisma.finding.create.mock.calls[0][0].data).toMatchObject({
      claimText: "Results in 2 weeks",
      claimLocation: "Headline",
      suggestedRevision: "Individual results vary.",
      ruleVersionId: "ver-ok",
      origin: "REVIEWER",
      status: "DRAFT",
    });
  });

  it("refuses a rule version that isn't current, verified, approved and applicable, whatever the browser sends", async () => {
    inReview();
    expect(await cmd.recordFinding(TEAM, { ...FINDING, ruleVersionId: "ver-made-up" })).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a current, verified and approved rule/) });
    // An unverified source makes the rule unusable.
    const unverified = dbRule();
    unverified.versions[0].sources[0].source.verificationStatus = "UNVERIFIED";
    h.prisma.policyRule.findMany.mockResolvedValue([unverified]);
    expect((await cmd.recordFinding(TEAM, { ...FINDING, ruleVersionId: "ver-ok" })).ok).toBe(false);
    // A rule for another platform doesn't apply to this submission.
    h.prisma.policyRule.findMany.mockResolvedValue([{ ...dbRule(), platformCode: "TIKTOK" }]);
    expect((await cmd.recordFinding(TEAM, { ...FINDING, ruleVersionId: "ver-ok" })).ok).toBe(false);
    expect(h.prisma.finding.create).not.toHaveBeenCalled();
  });

  it("an edit keeps the rule already cited, removes it with \"\", and re-checks a different one", async () => {
    inReview();
    h.prisma.finding.findUnique.mockResolvedValue({ id: "f1", creativeId: "s1", status: "DRAFT", ruleVersionId: "ver-old" });
    h.prisma.finding.updateMany.mockResolvedValue({ count: 1 });
    // ver-old is no longer citable, but it's what the finding already cites.
    expect((await cmd.updateDraftFinding(TEAM, { findingId: "f1", ...FINDING, ruleVersionId: "ver-old" })).ok).toBe(true);
    expect(h.prisma.finding.updateMany.mock.calls[0][0].data).not.toHaveProperty("ruleVersionId");
    expect((await cmd.updateDraftFinding(TEAM, { findingId: "f1", ...FINDING, ruleVersionId: "" })).ok).toBe(true);
    expect(h.prisma.finding.updateMany.mock.calls[1][0].data).toMatchObject({ ruleVersionId: null });
    expect((await cmd.updateDraftFinding(TEAM, { findingId: "f1", ...FINDING, ruleVersionId: "ver-made-up" })).ok).toBe(false);
    expect((await cmd.updateDraftFinding(TEAM, { findingId: "f1", ...FINDING, ruleVersionId: "ver-ok" })).ok).toBe(true);
    expect(h.prisma.finding.updateMany.mock.calls[2][0].data).toMatchObject({ ruleVersionId: "ver-ok" });
  });
});

describe("Clyntique evidence (addReviewerEvidence)", () => {
  const EVIDENCE = { creativeId: "s1", title: "Meta healthcare policy", type: "POLICY_REFERENCE", visibility: "SHARED", description: "Applies to the headline claim." };

  it("a reviewer adds shared or internal evidence on the version under review, optionally citing a rule", async () => {
    inReview();
    h.prisma.evidence.create.mockResolvedValue({ id: "e1" });
    h.prisma.finding.count.mockResolvedValue(1);
    const res = await cmd.addReviewerEvidence(TEAM, { ...EVIDENCE, ruleVersionId: "ver-ok", claimText: "Results in 2 weeks", findingIds: ["f1"] });
    expect(res).toEqual({ ok: true, evidenceId: "e1" });
    expect(h.prisma.evidence.create.mock.calls[0][0].data).toMatchObject({
      origin: "REVIEWER_ADDED",
      visibility: "SHARED",
      addedById: TEAM.id,
      versionId: "v1",
      policyRuleVersionId: "ver-ok",
      claimText: "Results in 2 weeks",
    });
    expect(h.prisma.findingEvidence.createMany.mock.calls[0][0].data).toEqual([{ findingId: "f1", evidenceId: "e1", linkedById: TEAM.id }]);
    expect(h.prisma.finding.count.mock.calls[0][0].where).toMatchObject({ cycleId: "c1", creativeId: "s1", status: { not: "DISMISSED" } });
  });

  it("needs a visibility, refuses an uncitable rule, findings from elsewhere, clients, and work outside a review", async () => {
    inReview();
    expect((await cmd.addReviewerEvidence(TEAM, { ...EVIDENCE, visibility: "PUBLIC" })).ok).toBe(false);
    expect((await cmd.addReviewerEvidence(TEAM, { ...EVIDENCE, ruleVersionId: "ver-made-up" })).ok).toBe(false);
    h.prisma.finding.count.mockResolvedValue(0);
    expect((await cmd.addReviewerEvidence(TEAM, { ...EVIDENCE, findingIds: ["f-other"] })).ok).toBe(false);
    expect((await cmd.addReviewerEvidence(CLIENT_A, EVIDENCE)).ok).toBe(false);
    inReview("CHANGES_REQUESTED");
    expect((await cmd.addReviewerEvidence(TEAM, EVIDENCE)).ok).toBe(false);
    expect(h.prisma.evidence.create).not.toHaveBeenCalled();
  });
});

describe("what the client sees", () => {
  const POLICY_ROW = {
    versionNumber: 1,
    title: "SYNTHETIC aesthetics rule",
    summary: "Synthetic summary",
    restrictionLevel: "RESTRICTED",
    restrictedClaims: ["Guaranteed results"],
    substantiationRequirements: ["Clinical evidence"],
    status: "DEPRECATED",
    rule: { code: "SYN-AES-01", authorityType: "PLATFORM_POLICY", jurisdictionCode: "US", platformCode: "META" },
    sources: [{ sectionReference: "SYN §1", sectionTitle: "Synthetic", directUrl: "https://example.test/synthetic", excerpt: "", sourceUpdatedAt: null, source: { name: "SYNTHETIC SOURCE", authorityName: "Synthetic" } }],
  };
  const evidenceRow = (id: string, createdAt: Date) => ({
    id,
    title: `Clyntique ${id}`,
    type: "POLICY_REFERENCE",
    description: null,
    source: null,
    url: null,
    origin: "REVIEWER_ADDED",
    visibility: "SHARED",
    withdrawnAt: null,
    withdrawnBy: null,
    createdAt,
    addedById: TEAM.id,
    fileName: null,
    fileSize: null,
    mimeType: null,
    fileUrl: null,
    addedBy: { name: "Dana Reviewer" },
    findings: [],
    claimText: null,
    claimLocation: null,
    version: { versionNumber: 1 },
    policyRuleVersion: POLICY_ROW,
    assessments: [],
  });

  beforeEach(() => {
    installCreativeStore(h.prisma);
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: null, rounds: [{ id: "r1", number: 1, note: null, submittedAt: new Date("2026-10-10T10:00:00Z"), submittedBy: { name: "Client A" }, versionId: "v1", version: { id: "v1", versionNumber: 1, mediaType: "IMAGE", fileName: null, changeNotes: null }, decisions: [] }] });
    h.prisma.evidence.findMany.mockResolvedValue([evidenceRow("before", new Date("2026-10-11T10:00:00Z")), evidenceRow("after", new Date("2026-10-13T10:00:00Z"))]);
    h.prisma.reviewDecision.findMany.mockResolvedValue([
      { id: "d1", kind: "CHANGES_REQUESTED", outcome: null, summary: "s", scopeNote: null, createdAt: new Date("2026-10-12T10:00:00Z"), version: { versionNumber: 1 }, round: { number: 1 }, cycle: { number: 1 }, reviewer: { name: "Dana Reviewer" } },
    ]);
  });

  it("Clyntique evidence reaches the client only with a later published decision, as “Clyntique reviewer”", async () => {
    const team = await reviewData.getSubmissionReview(TEAM, "sub-a-review");
    expect(team!.evidence.map((e) => e.id)).toEqual(["before", "after"]);
    const client = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
    expect(client!.evidence.map((e) => e.id)).toEqual(["before"]);
    expect(client!.evidence[0].addedByName).toBe("Clyntique reviewer");
    expect(JSON.stringify(client)).not.toContain("Dana Reviewer");
  });

  it("the policy reference carries the summary and official sources only, and says when it was superseded", async () => {
    const client = await reviewData.getSubmissionReview(CLIENT_A, "sub-a-review");
    const policy = client!.evidence[0].policy!;
    expect(policy).toMatchObject({ ruleCode: "SYN-AES-01", versionNumber: 1, superseded: true, restrictedClaims: ["Guaranteed results"] });
    expect(policy.citations).toEqual([{ sourceName: "SYNTHETIC SOURCE", publisher: "Synthetic", sectionReference: "SYN §1", sectionTitle: "Synthetic", url: "https://example.test/synthetic", quotation: null, sourceUpdatedAt: null }]);
    // Nothing from the verification or approval steps.
    expect(Object.keys(policy).sort()).toEqual(
      ["authorityType", "citations", "jurisdictionCode", "platformCode", "restrictedClaims", "restrictionLevel", "ruleCode", "substantiationRequirements", "summary", "superseded", "title", "versionNumber"].sort(),
    );
    // The query never asks for internal notes.
    const select = JSON.stringify(h.prisma.evidence.findMany.mock.calls[0][0].select.policyRuleVersion);
    expect(select).not.toMatch(/verificationNote|reviewNote|changeSummary|approvedBy|verifiedBy|legalExplanation/);
  });

  it("the evidence file route applies the same rule", async () => {
    h.prisma.evidence.findFirst.mockResolvedValue({ id: "e1", creativeId: "s1", origin: "REVIEWER_ADDED", createdAt: new Date("2026-10-13T10:00:00Z"), withdrawnAt: null, fileUrl: "u", fileName: "f.pdf", mimeType: "application/pdf" });
    h.prisma.reviewDecision.findFirst.mockResolvedValue(null);
    expect(await access.findAccessibleEvidenceFile(CLIENT_A, "e1")).toBeNull();
    expect(h.prisma.reviewDecision.findFirst.mock.calls[0][0].where).toEqual({ creativeId: "s1", createdAt: { gte: new Date("2026-10-13T10:00:00Z") } });
    h.prisma.reviewDecision.findFirst.mockResolvedValue({ id: "d2" });
    expect(await access.findAccessibleEvidenceFile(CLIENT_A, "e1")).toMatchObject({ id: "e1" });
    expect(await access.findAccessibleEvidenceFile(TEAM, "e1")).toMatchObject({ id: "e1" });
  });
});
