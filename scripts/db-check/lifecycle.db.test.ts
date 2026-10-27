import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { completeReview, openReviewCycle, recordExternalOutcome, recordExternalSubmission, startReview, submitForReview } from "@/lib/workflow/commands";
import { getLifecycle } from "@/lib/data/lifecycle";
import { getPolicyImpact } from "@/lib/data/policy-impact";
import { analyzeCreativeCompliance, clearAnalysisCache } from "@/lib/ai/service";
import { createDbPolicyRule } from "@/lib/policy/db";
import type { AIComplianceProvider } from "@/lib/ai/types";

// End-to-end lifecycle on a real (disposable) PostgreSQL: the migration's
// tables and constraints, the commands' transactions and the loaders' scoping,
// all together. Refuses to run against anything that isn't clearly local.

const url = process.env.DATABASE_URL ?? "";
const local = /127\.0\.0\.1|localhost/.test(url) && !/render\.com|vercel|neon|supabase/i.test(url);
const tag = `dbcheck-${Date.now()}`;

let team: CurrentUser;
let client: CurrentUser;
let other: CurrentUser;
let creativeId = "";
let versionId = "";

describe.skipIf(!local)("lifecycle on a real database", () => {
  beforeAll(async () => {
    const [t, c, o] = await Promise.all(
      (["TEAM", "CLIENT", "CLIENT"] as const).map((role, i) =>
        prisma.user.create({ data: { name: `${tag} ${role} ${i}`, email: `${tag}-${i}@example.invalid`, passwordHash: "x", role, isPolicyAdmin: role === "TEAM" } }),
      ),
    );
    team = { id: t.id, name: t.name, email: t.email, role: "TEAM", isPolicyAdmin: true };
    client = { id: c.id, name: c.name, email: c.email, role: "CLIENT" };
    other = { id: o.id, name: o.name, email: o.email, role: "CLIENT" };
    const project = await prisma.project.create({ data: { name: `${tag} project`, clientId: client.id } });
    const creative = await prisma.creative.create({
      data: {
        projectId: project.id,
        name: `${tag} creative`,
        createdById: client.id,
        markets: { create: [{ marketCode: "US" }] },
        platforms: { create: [{ platformCode: "META" }] },
        versions: { create: [{ versionNumber: 1, fileUrl: "https://example.invalid/x.png", mimeType: "image/png", mediaType: "IMAGE", createdById: client.id }] },
      },
      select: { id: true, versions: { select: { id: true } } },
    });
    creativeId = creative.id;
    versionId = creative.versions[0].id;
  });

  afterAll(async () => {
    // Everything hangs off the creative, the project and the tagged users/rules.
    await prisma.policyRuleEvent.deleteMany({ where: { actorId: team.id } });
    await prisma.policyRuleVersion.deleteMany({ where: { createdById: team.id } });
    await prisma.policyRule.deleteMany({ where: { code: { startsWith: "DBCHECK-" } } });
    if (creativeId) await prisma.creative.delete({ where: { id: creativeId } });
    await prisma.project.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  it("client submits, team reviews and completes; external records and the review record follow", async () => {
    expect((await submitForReview(client, creativeId)).ok).toBe(true);
    expect((await startReview(team, creativeId)).ok).toBe(true);
    const round = await prisma.submissionRound.findFirstOrThrow({ where: { creativeId } });
    expect((await completeReview(team, { creativeId, roundId: round.id, versionId, outcome: "NO_ISSUES_IDENTIFIED", summary: "No issues identified in this synthetic check." })).ok).toBe(true);

    // External record, by the client: must be a reviewed version; another client is refused.
    const input = { creativeId, versionId, destinationType: "AD_PLATFORM", destinationName: "Meta Ads Manager", submittedOn: "2026-10-15", platformCode: "META", marketCode: "US" };
    expect((await recordExternalSubmission(other, input)).ok).toBe(false);
    const ext = await recordExternalSubmission(client, input);
    expect(ext.ok).toBe(true);
    if (!ext.ok) return;
    expect((await recordExternalOutcome(other, { submissionId: ext.submissionId, kind: "APPROVED", outcomeOn: "2026-10-16" })).ok).toBe(false);
    expect((await recordExternalOutcome(client, { submissionId: ext.submissionId, kind: "APPROVED", outcomeOn: "2026-10-16" })).ok).toBe(true);

    const forClient = await getLifecycle(client, creativeId);
    expect(forClient?.externalStatus).toBe("APPROVED_REPORTED");
    expect(forClient?.externalByDestination).toEqual({ AD_PLATFORM: "APPROVED_REPORTED", REGULATOR: "NOT_SUBMITTED" });
    expect(forClient?.cycles).toHaveLength(1);
    expect(forClient?.cycles[0].finalOutcome).toBe("NO_ISSUES_IDENTIFIED");
    expect(forClient?.canRecordExternal).toBe(true);
    expect(forClient?.canReopen).toBe(false);
    expect(await getLifecycle(other, creativeId)).toBeNull(); // isolation
    const forTeam = await getLifecycle(team, creativeId);
    expect(forTeam?.canReopen).toBe(true);
    expect(forTeam?.external[0].recordedByName).toBe(client.name);
  });

  it("an AI scan is recorded as insufficient coverage (no verified rules) and hidden in detail from the client", async () => {
    clearAnalysisCache();
    const provider: AIComplianceProvider = { name: "db-check", promptVersion: "db-check-1", analyzeCreative: async () => ({ status: "SUCCESS", summary: "unused", extractedVisualText: [], detectedClaims: [], findings: [] }) };
    const result = await analyzeCreativeCompliance(team, { creativeId, provider });
    expect(result.status).toBe("INSUFFICIENT_COVERAGE");
    expect(result.scanId).toBeTruthy();
    const row = await prisma.aIScanRun.findUniqueOrThrow({ where: { id: result.scanId! }, include: { rulesChecked: true } });
    expect(row).toMatchObject({ creativeId, versionId, initiatedById: team.id, status: "INSUFFICIENT_COVERAGE", promptVersion: "db-check-1" });
    expect(row.cycleId).toBeTruthy();
    expect(row.rulesChecked).toEqual([]);
    const forClient = await getLifecycle(client, creativeId);
    expect(forClient?.scans).toHaveLength(1);
    expect(forClient?.scans[0].summary).toBeNull();
    expect(forClient?.scans[0].modelUsed).toBeNull();
    const forTeam = await getLifecycle(team, creativeId);
    expect(forTeam?.scans[0].summary).toBeTruthy();
  });

  it("re-review opens cycle 2 on the same version, keeps cycle 1 intact, and refuses a duplicate", async () => {
    const before = await prisma.reviewCycle.findFirstOrThrow({ where: { creativeId, number: 1 }, include: { decisions: true, rounds: true } });
    const reopened = await openReviewCycle(team, { creativeId, reason: "TEAM_REQUEST", note: "Synthetic re-check requested by the reviewer for this database check." });
    expect(reopened).toMatchObject({ ok: true, cycleNumber: 2 });
    expect((await prisma.creative.findUniqueOrThrow({ where: { id: creativeId } })).status).toBe("SUBMITTED");
    const after = await prisma.reviewCycle.findFirstOrThrow({ where: { creativeId, number: 1 }, include: { decisions: true, rounds: true } });
    expect(after.closedAt?.toISOString()).toBe(before.closedAt?.toISOString());
    expect(after.decisions.map((d) => d.id)).toEqual(before.decisions.map((d) => d.id));
    expect(after.rounds.map((r) => r.id)).toEqual(before.rounds.map((r) => r.id));
    const cycle2 = await prisma.reviewCycle.findFirstOrThrow({ where: { creativeId, number: 2 }, include: { rounds: true } });
    expect(cycle2.reasonKind).toBe("TEAM_REQUEST");
    expect(cycle2.rounds).toHaveLength(1);
    expect(cycle2.rounds[0].versionId).toBe(versionId);
    // Duplicate active cycle: refused (status is no longer REVIEW_COMPLETE, and cycle 2 is open).
    expect((await openReviewCycle(team, { creativeId, reason: "TEAM_REQUEST", note: "Second attempt, must be refused." })).ok).toBe(false);
    // The external record survives, and can still be read while the re-review runs.
    const lifecycle = await getLifecycle(client, creativeId);
    expect(lifecycle?.cycles).toHaveLength(2);
    expect(lifecycle?.external).toHaveLength(1);
    expect(lifecycle?.canRecordExternal).toBe(true);
  });

  it("creating a policy rule writes a RULE_CREATED event and nothing active; the impact page reads it", async () => {
    const rule = await createDbPolicyRule(
      { code: `DBCHECK-${Date.now()}`, title: "Synthetic db-check rule", authorityType: "INTERNAL_RISK", jurisdictionCode: "US", industry: "GENERAL", category: "DISCLOSURE", summary: "Synthetic db-check summary", legalExplanation: "e", remediationAction: "r", applicabilityConditions: [], effectiveFrom: new Date().toISOString(), sources: [], status: "DRAFT" },
      team,
    );
    expect(rule.currentVersion.status).toBe("DRAFT");
    const events = await prisma.policyRuleEvent.findMany({ where: { ruleId: rule.id } });
    expect(events.map((e) => e.kind)).toEqual(["RULE_CREATED"]);
    const impact = await getPolicyImpact(team);
    expect(impact?.events.some((e) => e.ruleCode === rule.code && e.kind === "RULE_CREATED")).toBe(true);
    expect(await getPolicyImpact(client)).toBeNull();
  });
});
