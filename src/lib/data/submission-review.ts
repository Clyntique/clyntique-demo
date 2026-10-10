import "server-only";
import type {
  CreativeStatus,
  EvidenceOrigin,
  EvidenceType,
  EvidenceVisibility,
  FindingAction,
  FindingSeverity,
  FindingStatus,
  MediaType,
  ReviewDecisionKind,
  ReviewOutcome,
} from "@/generated/prisma/enums";
import { ReviewOutcome as Outcomes } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { evidenceKindFor } from "@/lib/evidence-files";
import { prisma } from "@/lib/prisma";
import { checkOutcome, clientFindingView, evidenceIsFinal, type Unmet } from "@/lib/workflow/findings";
import { authorize } from "@/lib/workflow/policy";
import { loadReadiness } from "@/lib/workflow/readiness";
import { creativeScope } from "./workspace";

/*
 * Review data for one client submission: cycle and rounds, findings with
 * their responses and history, decisions and evidence. Re-checks the same
 * scope as every workspace read.
 *
 * Visibility is enforced HERE, on the server, never in the page:
 * - CLIENT never receives DRAFT findings or findings that were never
 *   published (filtered by Prisma), never receives INTERNAL evidence, and
 *   only receives findings once the team has requested changes or completed
 *   the review. The reviewer's resolve / reopen / dismiss moves reach the
 *   client only once a later decision has been recorded (clientFindingView),
 *   so a review in progress stays internal.
 * - TEAM receives everything for submissions it can see (never client drafts).
 */

export type FindingEntry =
  | { kind: "response"; id: string; message: string; authorName: string; byClient: boolean; createdAt: Date; versionNumber: number | null; roundNumber: number | null }
  | { kind: "review"; id: string; move: "RESOLVED" | "REOPENED" | "DISMISSED"; note: string | null; actorName: string; createdAt: Date };

export type FindingView = {
  id: string;
  issue: string;
  explanation: string;
  severity: FindingSeverity;
  requiredAction: FindingAction;
  actionDetails: string;
  /** As this viewer may see it (see clientFindingView). */
  status: FindingStatus;
  versionNumber: number | null;
  cycleNumber: number;
  reviewerName: string;
  createdAt: Date;
  publishedAt: Date | null;
  resolutionNote: string | null;
  resolvedInVersionNumber: number | null;
  markets: string[];
  platforms: string[];
  /** Raw codes, for pre-filling the edit form (TEAM only). */
  marketCodes: string[];
  platformCodes: string[];
  /** Responses and reviewer moves, oldest first. */
  entries: FindingEntry[];
  /** Evidence items linked to this finding (ids into SubmissionReview.evidence). */
  evidenceIds: string[];
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
  versionNumber: number | null;
  /** Uploaded file, served only through /api/media/evidence/[id]. */
  file: { name: string; sizeBytes: number | null; isImage: boolean } | null;
  findingIds: string[];
  /** CLIENT only: may withdraw it now (their own, not yet part of a submitted round). */
  withdrawable: boolean;
};

export type RoundView = {
  id: string;
  number: number;
  cycleNumber: number;
  submittedAt: Date;
  submittedByName: string;
  note: string | null;
  version: { id: string; number: number; mediaType: MediaType | null; fileName: string | null; changeNotes: string | null };
  decision: { kind: ReviewDecisionKind; outcome: ReviewOutcome | null } | null;
};

export type OutcomeAvailability = Record<ReviewOutcome, { ok: true } | { ok: false; reason: string }>;

export type SubmissionReview = {
  /** The open (or most recent) cycle and its newest round; null before first submission. */
  cycle: { id: string; number: number; closedAt: Date | null } | null;
  round: { id: string; number: number; versionId: string; versionNumber: number; hasDecision: boolean } | null;
  /** Rounds of the current cycle, newest first. */
  rounds: RoundView[];
  findings: FindingView[];
  decisions: DecisionView[]; // newest first
  evidence: EvidenceView[];
  /** TEAM only: which outcomes the guards allow now, without/with sharing the remaining drafts. */
  outcomes: { asIs: OutcomeAvailability; withDrafts: OutcomeAvailability } | null;
  /** CLIENT only, while changes are requested: what's still needed before resubmitting. */
  readiness: { gaps: Unmet[]; latestVersionNumber: number } | null;
};

const CLIENT_SEES_FINDINGS: CreativeStatus[] = ["CHANGES_REQUESTED", "SUBMITTED", "IN_REVIEW", "REVIEW_COMPLETE"];

export async function getSubmissionReview(user: CurrentUser, creativeId: string): Promise<SubmissionReview | null> {
  if (!creativeId || typeof creativeId !== "string") return null;
  const creative = await prisma.creative.findFirst({
    where: { AND: [{ id: creativeId, workflow: "SUBMISSION_REVIEW" }, creativeScope(user)] },
    select: { id: true, status: true, project: { select: { clientId: true } } },
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
          select: {
            id: true,
            number: true,
            note: true,
            submittedAt: true,
            submittedBy: { select: { name: true } },
            versionId: true,
            version: { select: { id: true, versionNumber: true, mediaType: true, fileName: true, changeNotes: true } },
            decisions: { select: { id: true, kind: true, outcome: true } },
          },
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
            resolvedInVersion: { select: { versionNumber: true } },
            version: { select: { versionNumber: true } },
            cycle: { select: { number: true } },
            createdBy: { select: { name: true } },
            markets: { select: { market: { select: { code: true, name: true } } } },
            platforms: { select: { platform: { select: { code: true, name: true } } } },
            events: {
              orderBy: { createdAt: "asc" },
              select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true, actor: { select: { name: true, role: true } } },
            },
            responses: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                message: true,
                createdAt: true,
                author: { select: { name: true, role: true } },
                version: { select: { versionNumber: true } },
                round: { select: { number: true } },
              },
            },
            evidence: {
              where: team ? {} : { evidence: { visibility: "SHARED" } },
              select: { evidenceId: true },
            },
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
        addedById: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        fileUrl: true,
        version: { select: { versionNumber: true } },
        addedBy: { select: { name: true } },
        findings: { select: { findingId: true } },
      },
    }),
  ]);

  const lastDecisionAt = decisions[0]?.createdAt ?? null;
  const reviewer = (name: string, role: string) => (team || role === "CLIENT" ? name : "Clyntique reviewer");

  const findingViews: FindingView[] = [];
  for (const f of findings) {
    const facts = f.events.map((e) => ({ ...e, byClient: e.actor.role === "CLIENT" }));
    // Published findings always have history; without any, there is nothing to hold back.
    const seen = team || !facts.length ? { status: f.status as FindingStatus | null, events: facts } : clientFindingView(facts, lastDecisionAt);
    if (!seen.status) continue; // nothing the client may see yet
    const status = seen.status;

    const reviewMoves: FindingEntry[] = seen.events
      .filter((e) => !e.byClient && e.fromStatus !== "DRAFT" && e.fromStatus !== null)
      .flatMap((e): FindingEntry[] => {
        const move = e.toStatus === "RESOLVED" ? "RESOLVED" : e.toStatus === "DISMISSED" ? "DISMISSED" : e.toStatus === "OPEN" && e.fromStatus === "RESPONDED" ? "REOPENED" : null;
        return move ? [{ kind: "review", id: e.id, move, note: e.note, actorName: reviewer(e.actor.name, e.actor.role), createdAt: e.createdAt }] : [];
      });
    const responses: FindingEntry[] = f.responses.map((r) => ({
      kind: "response",
      id: r.id,
      message: r.message,
      authorName: reviewer(r.author.name, r.author.role),
      byClient: r.author.role === "CLIENT",
      createdAt: r.createdAt,
      versionNumber: r.version?.versionNumber ?? null,
      roundNumber: r.round?.number ?? null,
    }));

    findingViews.push({
      id: f.id,
      issue: f.issue,
      explanation: f.explanation,
      severity: f.severity,
      requiredAction: f.requiredAction,
      actionDetails: f.actionDetails,
      status,
      versionNumber: f.version?.versionNumber ?? null,
      cycleNumber: f.cycle.number,
      reviewerName: f.createdBy.name,
      createdAt: f.createdAt,
      publishedAt: f.publishedAt,
      resolutionNote: status === "RESOLVED" ? f.resolutionNote : null,
      resolvedInVersionNumber: status === "RESOLVED" ? (f.resolvedInVersion?.versionNumber ?? null) : null,
      markets: f.markets.map((m) => m.market.name),
      platforms: f.platforms.map((p) => p.platform.name),
      marketCodes: team ? f.markets.map((m) => m.market.code) : [],
      platformCodes: team ? f.platforms.map((p) => p.platform.code) : [],
      entries: [...responses, ...reviewMoves].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      evidenceIds: f.evidence.map((e) => e.evidenceId),
    });
  }

  const latestRound = cycle?.rounds[0] ?? null;
  const lastSubmittedAt = cycle?.rounds.reduce<Date | null>((max, r) => (!max || r.submittedAt > max ? r.submittedAt : max), null) ?? null;
  const facts = { id: creative.id, workflow: "SUBMISSION_REVIEW" as const, status: creative.status, projectClientId: creative.project.clientId };
  const mayManageEvidence = !team && authorize(user, "MANAGE_EVIDENCE", facts).ok;

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

  let readiness: SubmissionReview["readiness"] = null;
  if (!team && creative.status === "CHANGES_REQUESTED" && cycle && !cycle.closedAt) {
    const r = await loadReadiness(creative.id, cycle.id);
    readiness = { gaps: r.gaps, latestVersionNumber: r.latestVersionNumber };
  }

  return {
    cycle: cycle ? { id: cycle.id, number: cycle.number, closedAt: cycle.closedAt } : null,
    round: latestRound
      ? {
          id: latestRound.id,
          number: latestRound.number,
          versionId: latestRound.versionId,
          versionNumber: latestRound.version.versionNumber,
          hasDecision: latestRound.decisions.length > 0,
        }
      : null,
    rounds: (cycle?.rounds ?? []).map((r) => ({
      id: r.id,
      number: r.number,
      cycleNumber: cycle!.number,
      submittedAt: r.submittedAt,
      submittedByName: r.submittedBy.name,
      note: r.note,
      version: { id: r.version.id, number: r.version.versionNumber, mediaType: r.version.mediaType, fileName: r.version.fileName, changeNotes: r.version.changeNotes },
      decision: r.decisions[0] ? { kind: r.decisions[0].kind, outcome: r.decisions[0].outcome } : null,
    })),
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
    evidence: evidence.map((e) => {
      const kind = e.fileUrl && e.fileName ? evidenceKindFor(e.fileName) : null;
      return {
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
        versionNumber: e.version?.versionNumber ?? null,
        file: kind && e.mimeType === kind.mimeType ? { name: e.fileName!, sizeBytes: e.fileSize, isImage: kind.inline } : null,
        findingIds: e.findings.map((l) => l.findingId),
        withdrawable:
          mayManageEvidence &&
          e.origin === "CLIENT_SUBMITTED" &&
          e.addedById === user.id &&
          e.withdrawnAt === null &&
          !evidenceIsFinal(e, lastSubmittedAt),
      };
    }),
    outcomes,
    readiness,
  };
}
