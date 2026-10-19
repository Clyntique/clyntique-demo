import "server-only";
import type { CreativeStatus, PolicyRuleEventKind } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/*
 * Rule-change impact analysis (Oct 19 sprint, TEAM only).
 *
 * A rule change is an approved version that superseded an earlier active
 * version, or a retirement. For each one, the submissions that were judged
 * against the superseded version are listed in two tiers:
 * - CONFIRMED: a reviewer recorded a finding citing that rule version.
 * - POTENTIAL: an AI pre-check ran against that rule version (no finding).
 * Nothing here changes a submission; a reviewer opens a re-review explicitly,
 * and only after a human looked at the list. Client drafts are never
 * included (they can't have findings or scans, and TEAM never sees drafts).
 */

export type ImpactedSubmission = {
  creativeId: string;
  name: string;
  projectName: string;
  clientName: string;
  status: CreativeStatus;
  tier: "CONFIRMED" | "POTENTIAL";
  /** How the superseded version touched it. */
  via: string;
  /** A review cycle citing the new version already exists. */
  reReviewOpened: boolean;
  /** A review is in progress right now (any cycle still open). */
  reviewInProgress: boolean;
};

export type RuleChange = {
  ruleId: string;
  ruleCode: string;
  ruleTitle: string;
  kind: "VERSION_APPROVED" | "RULE_RETIRED";
  newVersion: { id: string; versionNumber: number; title: string; effectiveFrom: Date; changeSummary: string } | null;
  supersededVersions: { id: string; versionNumber: number }[];
  changedAt: Date;
  changedByName: string;
  impacted: ImpactedSubmission[];
};

export type RuleEventView = {
  id: string;
  kind: PolicyRuleEventKind;
  ruleCode: string;
  ruleTitle: string;
  versionNumber: number | null;
  actorName: string;
  note: string | null;
  createdAt: Date;
};

export type PolicyImpact = {
  changes: RuleChange[]; // newest first
  events: RuleEventView[]; // newest first
  /** Rules with more than one version, for the "versions evaluated" view. */
  rulesWithHistory: number;
};

export async function getPolicyImpact(user: CurrentUser): Promise<PolicyImpact | null> {
  if (user.role !== "TEAM") return null;

  const [events, rules] = await Promise.all([
    prisma.policyRuleEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        note: true,
        createdAt: true,
        actor: { select: { name: true } },
        rule: { select: { code: true, title: true } },
        version: { select: { versionNumber: true } },
      },
    }),
    prisma.policyRule.findMany({
      select: {
        id: true,
        code: true,
        title: true,
        updatedAt: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          select: { id: true, versionNumber: true, title: true, status: true, effectiveFrom: true, effectiveTo: true, changeSummary: true, approvedAt: true, approvedBy: { select: { name: true } } },
        },
      },
    }),
  ]);

  const changes: RuleChange[] = [];
  for (const rule of rules) {
    const deprecated = rule.versions.filter((v) => v.status === "DEPRECATED");
    if (deprecated.length === 0) continue;
    const active = rule.versions.find((v) => v.status === "ACTIVE") ?? null;
    const supersededIds = deprecated.map((v) => v.id);

    const [findings, scanChecks, cycles] = await Promise.all([
      prisma.finding.findMany({
        where: { ruleVersionId: { in: supersededIds }, creative: { status: { not: "DRAFT" }, workflow: "SUBMISSION_REVIEW" } },
        select: { creativeId: true, status: true, ruleVersion: { select: { versionNumber: true } } },
      }),
      prisma.aIScanRuleCheck.findMany({
        where: { ruleVersionId: { in: supersededIds }, scan: { creative: { status: { not: "DRAFT" }, workflow: "SUBMISSION_REVIEW" } } },
        select: { ruleVersionNumber: true, scan: { select: { creativeId: true, createdAt: true } } },
      }),
      active ? prisma.reviewCycle.findMany({ where: { triggerRuleVersionId: active.id }, select: { creativeId: true } }) : Promise.resolve([]),
    ]);
    const reopened = new Set(cycles.map((c) => c.creativeId));

    const byCreative = new Map<string, { tier: "CONFIRMED" | "POTENTIAL"; via: string }>();
    for (const f of findings) {
      byCreative.set(f.creativeId, { tier: "CONFIRMED", via: `Finding recorded against v${f.ruleVersion?.versionNumber ?? "?"} (${f.status.toLowerCase()})` });
    }
    for (const c of scanChecks) {
      if (byCreative.has(c.scan.creativeId)) continue;
      byCreative.set(c.scan.creativeId, { tier: "POTENTIAL", via: `AI pre-check ran against v${c.ruleVersionNumber}` });
    }

    const creativeIds = [...byCreative.keys()];
    const creatives = creativeIds.length
      ? await prisma.creative.findMany({
          where: { id: { in: creativeIds } },
          select: {
            id: true,
            name: true,
            status: true,
            project: { select: { name: true, client: { select: { name: true } } } },
            cycles: { where: { closedAt: null }, select: { id: true }, take: 1 },
          },
        })
      : [];

    const impacted: ImpactedSubmission[] = creatives
      .map((c) => {
        const hit = byCreative.get(c.id)!;
        return {
          creativeId: c.id,
          name: c.name,
          projectName: c.project.name,
          clientName: c.project.client.name,
          status: c.status,
          tier: hit.tier,
          via: hit.via,
          reReviewOpened: reopened.has(c.id),
          reviewInProgress: c.cycles.length > 0,
        };
      })
      .sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === "CONFIRMED" ? -1 : 1));

    const latestDeprecated = deprecated[0];
    changes.push({
      ruleId: rule.id,
      ruleCode: rule.code,
      ruleTitle: rule.title,
      kind: active ? "VERSION_APPROVED" : "RULE_RETIRED",
      newVersion: active ? { id: active.id, versionNumber: active.versionNumber, title: active.title, effectiveFrom: active.effectiveFrom, changeSummary: active.changeSummary } : null,
      supersededVersions: deprecated.map((v) => ({ id: v.id, versionNumber: v.versionNumber })),
      changedAt: active?.approvedAt ?? latestDeprecated.effectiveTo ?? rule.updatedAt,
      changedByName: active?.approvedBy?.name ?? "Policy administrator",
      impacted,
    });
  }
  changes.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());

  return {
    changes,
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      ruleCode: e.rule.code,
      ruleTitle: e.rule.title,
      versionNumber: e.version?.versionNumber ?? null,
      actorName: e.actor.name,
      note: e.note,
      createdAt: e.createdAt,
    })),
    rulesWithHistory: rules.filter((r) => r.versions.length > 1).length,
  };
}
