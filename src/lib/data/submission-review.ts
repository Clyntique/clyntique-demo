import "server-only";
import type {
  CreativeStatus,
  EvidenceOrigin,
  EvidenceType,
  EvidenceVisibility,
  FindingAction,
  FindingSeverity,
  FindingStatus,
  ReviewDecisionKind,
  ReviewOutcome,
} from "@/generated/prisma/enums";
import { ReviewOutcome as Outcomes } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { checkOutcome } from "@/lib/workflow/findings";
import { creativeScope } from "./workspace";

/*
 * Review data for one client submission: current cycle and round, findings,
 * decisions and evidence. Re-checks the same scope as every workspace read.
 *
 * Visibility is enforced IN THE QUERY, not in the page:
 * - CLIENT never receives DRAFT findings or findings that were never
 *   published (they are filtered out by Prisma), never receives INTERNAL
 *   evidence, and only receives findings once the team has requested changes
 *   or completed the review (status CHANGES_REQUESTED or later).
 * - TEAM receives everything for submissions it can see (never client drafts).
 */

export type FindingView = {
  id: string;
  issue: string;
  explanation: string;
  severity: FindingSeverity;
  requiredAction: FindingAction;
  actionDetails: string;
  status: FindingStatus;
  versionNumber: number | null;
  cycleNumber: number;
  reviewerName: string;
  createdAt: Date;
  publishedAt: Date | null;
  resolutionNote: string | null;
  markets: string[];
  platforms: string[];
  /** Raw codes, for pre-filling the edit form (TEAM only). */
  marketCodes: string[];
  platformCodes: string[];
};

export type DecisionView = {
  id: string;
  kind: ReviewDecisionKind;
  outcome: ReviewOutcome | null;
  summary: string;
  scopeNote: string | null;
  versionNumber: number;
  roundNumber: number;
  cycleNumber: number;
  reviewerName: string;
  createdAt: Date;
};

export type EvidenceView = {
  id: string;
  title: string;
  type: EvidenceType;
  description: string | null;
  source: string | null;
  url: string | null;
  origin: EvidenceOrigin | null;
  visibility: EvidenceVisibility;
  addedByName: string | null;
  withdrawn: boolean;
  createdAt: Date;
};

export type OutcomeAvailability = Record<ReviewOutcome, { ok: true } | { ok: false; reason: string }>;

export type SubmissionReview = {
  /** The open (or most recent) cycle and its newest round; null before first submission. */
  cycle: { id: string; number: number; closedAt: Date | null } | null;
  round: { id: string; number: number; versionId: string; versionNumber: number; hasDecision: boolean } | null;
  findings: FindingView[];
  decisions: DecisionView[]; // newest first
  evidence: EvidenceView[];
  /** TEAM only: which outcomes the guards allow now, without/with sharing the remaining drafts. */
  outcomes: { asIs: OutcomeAvailability; withDrafts: OutcomeAvailability } | null;
};

const CLIENT_SEES_FINDINGS: CreativeStatus[] = ["CHANGES_REQUESTED", "SUBMITTED", "IN_REVIEW", "REVIEW_COMPLETE"];

export async function getSubmissionReview(user: CurrentUser, creativeId: string): Promise<SubmissionReview | null> {
  if (!creativeId || typeof creativeId !== "string") return null;
  const creative = await prisma.creative.findFirst({
    where: { AND: [{ id: creativeId, workflow: "SUBMISSION_REVIEW" }, creativeScope(user)] },
    select: { id: true, status: true },
  });
  if (!creative) return null;

  const team = user.role === "TEAM";
  // A client sees findings only after the team has formally shared some
  // (request changes or completion). Published findings exist only then, and
  // the query below additionally excludes anything unpublished.
  const clientMaySeeFindings = CLIENT_SEES_FINDINGS.includes(creative.status);

  const [cycle, findings, decisions, evidence] = await Promise.all([
    prisma.reviewCycle.findFirst({
      where: { creativeId: creative.id },
      orderBy: { number: "desc" },
      select: {
        id: true,
        number: true,
        closedAt: true,
        rounds: {
          orderBy: { number: "desc" },
          take: 1,
          select: { id: true, number: true, versionId: true, version: { select: { versionNumber: true } }, decisions: { select: { id: true } } },
        },
      },
    }),
    team || clientMaySeeFindings
      ? prisma.finding.findMany({
          where: team ? { creativeId: creative.id } : { creativeId: creative.id, status: { not: "DRAFT" }, publishedAt: { not: null } },
          orderBy: [{ cycle: { number: "desc" } }, { createdAt: "asc" }],
          select: {
            id: true,
            issue: true,
            explanation: true,
            severity: true,
            requiredAction: true,
            actionDetails: true,
            status: true,
            createdAt: true,
            publishedAt: true,
            resolutionNote: true,
            version: { select: { versionNumber: true } },
            cycle: { select: { number: true } },
            createdBy: { select: { name: true } },
            markets: { select: { market: { select: { code: true, name: true } } } },
            platforms: { select: { platform: { select: { code: true, name: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.reviewDecision.findMany({
      where: { creativeId: creative.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        outcome: true,
        summary: true,
        scopeNote: true,
        createdAt: true,
        version: { select: { versionNumber: true } },
        round: { select: { number: true } },
        cycle: { select: { number: true } },
        reviewer: { select: { name: true } },
      },
    }),
    prisma.evidence.findMany({
      where: team ? { creativeId: creative.id } : { creativeId: creative.id, visibility: "SHARED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        description: true,
        source: true,
        url: true,
        origin: true,
        visibility: true,
        withdrawnAt: true,
        createdAt: true,
        addedBy: { select: { name: true } },
      },
    }),
  ]);

  const round = cycle?.rounds[0] ?? null;
  const findingViews: FindingView[] = findings.map((f) => ({
    id: f.id,
    issue: f.issue,
    explanation: f.explanation,
    severity: f.severity,
    requiredAction: f.requiredAction,
    actionDetails: f.actionDetails,
    status: f.status,
    versionNumber: f.version?.versionNumber ?? null,
    cycleNumber: f.cycle.number,
    reviewerName: f.createdBy.name,
    createdAt: f.createdAt,
    publishedAt: f.publishedAt,
    resolutionNote: f.resolutionNote,
    markets: f.markets.map((m) => m.market.name),
    platforms: f.platforms.map((p) => p.platform.name),
    marketCodes: team ? f.markets.map((m) => m.market.code) : [],
    platformCodes: team ? f.platforms.map((p) => p.platform.code) : [],
  }));

  let outcomes: SubmissionReview["outcomes"] = null;
  if (team && cycle && !cycle.closedAt) {
    const current = findingViews.filter((f) => f.cycleNumber === cycle.number);
    const withDrafts = current.map((f) => (f.status === "DRAFT" ? { ...f, status: "OPEN" as const } : f));
    // A long placeholder summary: the form checks the real summary on submit.
    const placeholder = "placeholder summary for availability";
    const map = (list: { status: FindingStatus; severity: FindingSeverity }[]) =>
      Object.fromEntries(
        Object.values(Outcomes).map((o) => {
          const r = checkOutcome(o, list, placeholder);
          return [o, r.ok ? { ok: true } : { ok: false, reason: r.error }];
        }),
      ) as OutcomeAvailability;
    outcomes = { asIs: map(current), withDrafts: map(withDrafts) };
  }

  return {
    cycle: cycle ? { id: cycle.id, number: cycle.number, closedAt: cycle.closedAt } : null,
    round: round
      ? { id: round.id, number: round.number, versionId: round.versionId, versionNumber: round.version.versionNumber, hasDecision: round.decisions.length > 0 }
      : null,
    findings: findingViews,
    decisions: decisions.map((d) => ({
      id: d.id,
      kind: d.kind,
      outcome: d.outcome,
      summary: d.summary,
      scopeNote: d.scopeNote,
      versionNumber: d.version.versionNumber,
      roundNumber: d.round.number,
      cycleNumber: d.cycle.number,
      reviewerName: d.reviewer.name,
      createdAt: d.createdAt,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      description: e.description,
      source: e.source,
      url: e.url,
      origin: e.origin,
      visibility: e.visibility,
      addedByName: e.addedBy?.name ?? null,
      withdrawn: e.withdrawnAt !== null,
      createdAt: e.createdAt,
    })),
    outcomes,
  };
}
