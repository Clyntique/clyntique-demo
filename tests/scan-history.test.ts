import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { createPrismaMock, type PrismaMock } from "./helpers";
import type { AIComplianceProvider, AISuggestedFinding } from "@/lib/ai/types";

// Persistent AI scan history (Oct 19 sprint): every scan outcome is recorded
// with the creative, the exact submitted version, the cycle and round, the
// initiating user, the rule versions evaluated, and the validated result.
// Never the raw provider output, never a provider error message.
// All rules here are SYNTHETIC TEST FIXTURES.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

const { analyzeCreativeCompliance, clearAnalysisCache } = await import("@/lib/ai/service");

const TEAM: CurrentUser = { id: "team-1", name: "Reviewer", email: "r@test.invalid", role: "TEAM" };
const CLIENT: CurrentUser = { id: "client-a", name: "Client", email: "c@test.invalid", role: "CLIENT" };

function dbRule() {
  return {
    id: "rule-syn-1",
    code: "SYN-TEST-01",
    title: "SYNTHETIC rule",
    authorityType: "INTERNAL_RISK",
    jurisdictionCode: "US",
    subJurisdiction: null,
    platformCode: null,
    industry: "GENERAL",
    category: "DISCLOSURE",
    currentVersionNumber: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: "ver-syn-2",
        ruleId: "rule-syn-1",
        versionNumber: 2,
        title: "SYNTHETIC rule",
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
        approvedAt: new Date(),
        createdBy: { id: "a", name: "A" },
        approvedBy: { id: "b", name: "B" },
        sources: [
          {
            id: "cit-1",
            sourceId: "src-syn",
            sectionReference: "SYN §1",
            sectionTitle: "Synthetic",
            directUrl: "https://example.test/synthetic",
            excerpt: null,
            source: { name: "SYNTHETIC TEST SOURCE", authorityName: "Synthetic", verificationStatus: "VERIFIED" },
          },
        ],
      },
    ],
  };
}

function setup(prisma: PrismaMock, opts: { rules?: unknown[] } = {}) {
  prisma.creative.findFirst.mockResolvedValue({ id: "cr-1", name: "Live title", status: "IN_REVIEW", workflow: "SUBMISSION_REVIEW", projectId: "p-1", project: { name: "P", clientId: "client-a" } });
  prisma.creative.findUnique.mockResolvedValue({
    id: "cr-1",
    name: "Client's unsubmitted new title",
    description: "Unsubmitted private description",
    context: "Unsubmitted private context",
    format: "FEED",
    markets: [{ market: { code: "US", name: "United States" } }],
    platforms: [{ platform: { code: "META", name: "Meta" } }],
  });
  prisma.submissionRound.findMany.mockResolvedValue([
    { id: "round-2", cycleId: "cycle-1", versionId: "v-2", submittedName: "Submitted title", submittedDescription: "Submitted description", submittedContext: "Submitted context", version: { id: "v-2", versionNumber: 2, fileUrl: null, mimeType: null } },
  ]);
  prisma.policyRule.findMany.mockResolvedValue(opts.rules ?? [dbRule()]);
  prisma.aIScanRun.create.mockResolvedValue({ id: "scan-1", createdAt: new Date("2026-10-19T12:00:00Z") });
}

const suggestion = (code: string): AISuggestedFinding => ({
  id: "s-1",
  issue: "Synthetic issue",
  severity: "MAJOR",
  requiredAction: "REVISE_CONTENT",
  explanation: "Synthetic explanation",
  actionDetails: "Synthetic action",
  confidenceScore: 0.9,
  policyCitation: { ruleId: "x", ruleCode: code, ruleTitle: "x", authorityType: "REGULATION", jurisdictionCode: "US", sectionReference: "Invented §99", officialUrl: "https://evil.example" },
});

const provider = (result: unknown): AIComplianceProvider => ({ name: "mock", promptVersion: "test-prompt-1", analyzeCreative: vi.fn().mockResolvedValue(result) });

function recorded() {
  expect(h.prisma.aIScanRun.create).toHaveBeenCalledTimes(1);
  return h.prisma.aIScanRun.create.mock.calls[0][0].data;
}

describe("AI scan history", () => {
  beforeEach(() => {
    h.prisma = createPrismaMock();
    clearAnalysisCache();
  });

  it("records a successful scan with creative, exact version, cycle, round, user, prompt version and the rule versions evaluated", async () => {
    setup(h.prisma);
    const p = provider({ status: "SUCCESS", summary: "x", modelUsed: "mock-model", extractedVisualText: [{ text: "Hello", location: "headline" }], detectedClaims: [{ text: "Cures everything", kind: "EFFICACY" }], findings: [suggestion("SYN-TEST-01"), suggestion("INVENTED-01")] });
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p });
    expect(result.status).toBe("SUCCESS");
    expect(result.scanId).toBe("scan-1");
    expect(result.scannedAt).toBe("2026-10-19T12:00:00.000Z");

    const data = recorded();
    expect(data).toMatchObject({ creativeId: "cr-1", versionId: "v-2", cycleId: "cycle-1", roundId: "round-2", initiatedById: TEAM.id, status: "SUCCESS", modelUsed: "mock-model", promptVersion: "test-prompt-1", discardedSuggestions: 1 });
    expect(data.rulesChecked).toEqual({ create: [{ ruleVersionId: "ver-syn-2", ruleCode: "SYN-TEST-01", ruleVersionNumber: 2 }] });
    // Only the validated suggestion is stored, with its citation rebuilt from the Policy Library.
    expect(data.suggestedFindings).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("Invented §99");
    expect(JSON.stringify(data)).not.toContain("evil.example");
    // Never the client's unsubmitted edits.
    expect(JSON.stringify(data)).not.toContain("Unsubmitted");
  });

  it("records an insufficient-coverage outcome with no rules and without calling the model", async () => {
    setup(h.prisma, { rules: [] });
    const p = provider({ status: "SUCCESS", summary: "x", extractedVisualText: [], detectedClaims: [], findings: [] });
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p });
    expect(result.status).toBe("INSUFFICIENT_COVERAGE");
    expect(p.analyzeCreative).not.toHaveBeenCalled();
    const data = recorded();
    expect(data).toMatchObject({ status: "INSUFFICIENT_COVERAGE", versionId: "v-2", initiatedById: TEAM.id, suggestedFindings: [] });
    expect(data.rulesChecked).toEqual({ create: [] });
  });

  it("records a thrown provider error as ERROR with the error name only, never its message", async () => {
    setup(h.prisma);
    const p: AIComplianceProvider = { name: "mock", analyzeCreative: vi.fn().mockRejectedValue(new Error("network down at https://secret.internal/key=abc")) };
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p });
    expect(result.status).toBe("ERROR");
    const data = recorded();
    expect(data).toMatchObject({ status: "ERROR", errorName: "Error", suggestedFindings: [] });
    expect(JSON.stringify(data)).not.toContain("secret.internal");
    expect(data.rulesChecked.create).toHaveLength(1); // what it would have been checked against
  });

  it("records a rate-limited provider answer and drops any findings it carried", async () => {
    setup(h.prisma);
    const p = provider({ status: "RATE_LIMITED", summary: "busy", error: "RateLimit", extractedVisualText: [], detectedClaims: [], findings: [suggestion("SYN-TEST-01")] });
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p });
    expect(result.status).toBe("RATE_LIMITED");
    expect(recorded()).toMatchObject({ status: "RATE_LIMITED", errorName: "RateLimit", suggestedFindings: [] });
  });

  it("a failed history write never hides the scan result, and the result then carries no scan id", async () => {
    setup(h.prisma);
    h.prisma.aIScanRun.create.mockRejectedValue(new Error("db down"));
    const p = provider({ status: "SUCCESS", summary: "x", extractedVisualText: [], detectedClaims: [], findings: [] });
    const result = await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p });
    expect(result.status).toBe("SUCCESS");
    expect(result.scanId).toBeUndefined();
  });

  it("a cached repeat scan is not recorded twice; a forced re-run is", async () => {
    setup(h.prisma);
    const p = provider({ status: "SUCCESS", summary: "x", extractedVisualText: [], detectedClaims: [], findings: [] });
    await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p });
    await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p });
    expect(h.prisma.aIScanRun.create).toHaveBeenCalledTimes(1);
    await analyzeCreativeCompliance(TEAM, { creativeId: "cr-1", provider: p, forceRefresh: true });
    expect(h.prisma.aIScanRun.create).toHaveBeenCalledTimes(2);
  });

  it("a CLIENT can't run a scan, so nothing is recorded", async () => {
    setup(h.prisma);
    const p = provider({ status: "SUCCESS", summary: "x", extractedVisualText: [], detectedClaims: [], findings: [] });
    await expect(analyzeCreativeCompliance(CLIENT, { creativeId: "cr-1", provider: p })).rejects.toThrow();
    expect(h.prisma.aIScanRun.create).not.toHaveBeenCalled();
    expect(p.analyzeCreative).not.toHaveBeenCalled();
  });
});
