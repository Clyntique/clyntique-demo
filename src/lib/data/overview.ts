import "server-only";
import type { CreativeFormat, CreativeStatus, MediaType, ReviewOutcome } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { teamVisibleVersions } from "@/lib/workflow/findings";
import { getReviewQueue, type QueueItem } from "./review-queue";

/*
 * Dashboard reads (Stage C). Every count shown on a dashboard comes from one
 * of these lists, so nothing is estimated or invented.
 *
 * TEAM: what needs review, what is in review, which clients owe changes, and
 * what was completed recently. Client work prepared since the last
 * submission stays private (thumbnails use the last submitted version).
 * CLIENT: their own submissions, grouped by what they need to do.
 */

type Thumb = { id: string; versionNumber: number; mediaType: MediaType | null } | null;

export type WaitingItem = {
  id: string;
  name: string;
  format: CreativeFormat;
  projectName: string;
  clientName: string;
  latestVersion: Thumb;
  roundNumber: number;
  requestedAt: Date | null;
  sharedFindings: number;
};

export type CompletedItem = {
  id: string;
  name: string;
  format: CreativeFormat;
  clientName: string;
  outcome: ReviewOutcome | null;
  versionNumber: number;
  roundNumber: number;
  completedAt: Date;
  latestVersion: Thumb;
};

export type TeamOverview = { needsReview: QueueItem[]; inReview: QueueItem[]; waitingOnClients: WaitingItem[]; completed: CompletedItem[] };

const WEEK = 7 * 24 * 60 * 60 * 1000;

export async function getTeamOverview(user: CurrentUser, now = new Date()): Promise<TeamOverview> {
  if (user.role !== "TEAM") return { needsReview: [], inReview: [], waitingOnClients: [], completed: [] };
  const weekAgo = new Date(now.getTime() - WEEK);

  const [queue, waiting, completed] = await Promise.all([
    getReviewQueue(user),
    prisma.creative.findMany({
      where: { workflow: "SUBMISSION_REVIEW", status: "CHANGES_REQUESTED" },
      select: {
        id: true,
        name: true,
        format: true,
        project: { select: { name: true, client: { select: { name: true } } } },
        versions: { orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, mediaType: true, createdAt: true } },
        rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { number: true, submittedAt: true, submittedName: true } },
        decisions: { where: { kind: "CHANGES_REQUESTED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        // Shared findings still open or awaiting the reviewer: a total the client's
        // unsubmitted responses don't change (open + responded stays constant).
        _count: { select: { findings: { where: { publishedAt: { not: null }, status: { in: ["OPEN", "RESPONDED"] } } } } },
      },
    }),
    prisma.reviewDecision.findMany({
      where: { kind: "FINAL", createdAt: { gte: weekAgo }, creative: { workflow: "SUBMISSION_REVIEW" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        outcome: true,
        createdAt: true,
        version: { select: { id: true, versionNumber: true, mediaType: true } },
        round: { select: { number: true } },
        creative: { select: { id: true, name: true, format: true, project: { select: { client: { select: { name: true } } } } } },
      },
    }),
  ]);

  return {
    needsReview: queue.filter((q) => q.status === "SUBMITTED"),
    inReview: queue.filter((q) => q.status === "IN_REVIEW"),
    waitingOnClients: waiting
      .map((c) => {
        const visible = teamVisibleVersions(c.versions, { workflow: "SUBMISSION_REVIEW", lastSubmittedAt: c.rounds[0]?.submittedAt ?? null });
        const v = visible[0];
        return {
          id: c.id,
          // The title as last submitted: the client may be editing it privately.
          name: c.rounds[0]?.submittedName ?? c.name,
          format: c.format,
          projectName: c.project.name,
          clientName: c.project.client.name,
          latestVersion: v ? { id: v.id, versionNumber: v.versionNumber, mediaType: v.mediaType } : null,
          roundNumber: c.rounds[0]?.number ?? 1,
          requestedAt: c.decisions[0]?.createdAt ?? null,
          sharedFindings: c._count.findings,
        };
      })
      // Longest wait first.
      .sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0)),
    completed: completed.map((d) => ({
      id: d.creative.id,
      name: d.creative.name,
      format: d.creative.format,
      clientName: d.creative.project.client.name,
      outcome: d.outcome,
      versionNumber: d.version.versionNumber,
      roundNumber: d.round.number,
      completedAt: d.createdAt,
      latestVersion: d.version,
    })),
  };
}

// ---------------------------------------------------------------------------

export type ClientItem = {
  id: string;
  name: string;
  format: CreativeFormat;
  status: CreativeStatus;
  projectName: string;
  updatedAt: Date;
  latestVersion: Thumb;
  roundNumber: number | null;
  submittedAt: Date | null;
  /** Shared findings still waiting for the client's response (changes requested only). */
  findingsToAnswer: number;
  outcome: ReviewOutcome | null;
  completedAt: Date | null;
};

export type ClientOverview = { actionNeeded: ClientItem[]; withClyntique: ClientItem[]; done: ClientItem[]; earlierWork: number };

export async function getClientOverview(user: CurrentUser): Promise<ClientOverview> {
  if (user.role !== "CLIENT") return { actionNeeded: [], withClyntique: [], done: [], earlierWork: 0 };
  const [rows, earlierWork] = await Promise.all([
    prisma.creative.findMany({
      where: { workflow: "SUBMISSION_REVIEW", project: { clientId: user.id } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        format: true,
        status: true,
        updatedAt: true,
        project: { select: { name: true } },
        versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true, mediaType: true } },
        rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { number: true, submittedAt: true } },
        decisions: { where: { kind: "FINAL" }, orderBy: { createdAt: "desc" }, take: 1, select: { outcome: true, createdAt: true } },
        // Only published findings, and only OPEN ones: what still needs the client's response.
        _count: { select: { findings: { where: { publishedAt: { not: null }, status: "OPEN" } } } },
      },
    }),
    // Creatives from the earlier client-approval workflow, shared with this client.
    prisma.creative.count({ where: { workflow: "LEGACY_CLIENT_APPROVAL", project: { clientId: user.id }, status: { not: "DRAFT" } } }),
  ]);

  const items: ClientItem[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    format: c.format,
    status: c.status,
    projectName: c.project.name,
    updatedAt: c.updatedAt,
    latestVersion: c.versions[0] ?? null,
    roundNumber: c.rounds[0]?.number ?? null,
    submittedAt: c.rounds[0]?.submittedAt ?? null,
    findingsToAnswer: c.status === "CHANGES_REQUESTED" ? c._count.findings : 0,
    outcome: c.decisions[0]?.outcome ?? null,
    completedAt: c.decisions[0]?.createdAt ?? null,
  }));

  return {
    // Changes requested first, then drafts not yet submitted.
    actionNeeded: [...items.filter((i) => i.status === "CHANGES_REQUESTED"), ...items.filter((i) => i.status === "DRAFT")],
    withClyntique: items.filter((i) => i.status === "SUBMITTED" || i.status === "IN_REVIEW"),
    done: items.filter((i) => i.status === "REVIEW_COMPLETE"),
    earlierWork,
  };
}
