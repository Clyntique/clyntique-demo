import "server-only";
import type { CreativeFormat, CreativeStatus, MediaType } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/*
 * The internal review queue: client submissions waiting for, or in, review.
 * TEAM only (returns nothing for anyone else). Never includes drafts.
 * Ordered by when the current round was submitted, oldest first.
 */

export type QueueItem = {
  id: string;
  name: string;
  status: CreativeStatus;
  format: CreativeFormat;
  projectId: string;
  projectName: string;
  clientName: string;
  markets: string[];
  platforms: string[];
  roundNumber: number;
  versionNumber: number;
  submittedAt: Date;
  submittedByName: string;
  latestVersion: { id: string; versionNumber: number; mediaType: MediaType | null } | null;
  draftFindings: number;
};

export type ReviewSummary = { waiting: number; inReview: number; changesRequested: number; completedThisWeek: number };

const QUEUE_STATUSES: CreativeStatus[] = ["SUBMITTED", "IN_REVIEW"];

export async function getReviewQueue(user: CurrentUser): Promise<QueueItem[]> {
  if (user.role !== "TEAM") return [];
  const rows = await prisma.creative.findMany({
    where: { workflow: "SUBMISSION_REVIEW", status: { in: QUEUE_STATUSES } },
    select: {
      id: true,
      name: true,
      status: true,
      format: true,
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      markets: { select: { market: { select: { name: true, sortOrder: true } } } },
      platforms: { select: { platform: { select: { name: true, sortOrder: true } } } },
      rounds: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { number: true, submittedAt: true, submittedBy: { select: { name: true } }, version: { select: { versionNumber: true } } },
      },
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true, mediaType: true } },
      _count: { select: { findings: { where: { status: "DRAFT" } } } },
    },
  });

  return rows
    .filter((r) => r.rounds[0])
    .map((r) => {
      const round = r.rounds[0]!;
      const byOrder = <T extends { sortOrder: number; name: string }>(items: T[]) => items.sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.name);
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        format: r.format,
        projectId: r.project.id,
        projectName: r.project.name,
        clientName: r.project.client.name,
        markets: byOrder(r.markets.map((m) => m.market)),
        platforms: byOrder(r.platforms.map((p) => p.platform)),
        roundNumber: round.number,
        versionNumber: round.version.versionNumber,
        submittedAt: round.submittedAt,
        submittedByName: round.submittedBy.name,
        latestVersion: r.versions[0] ?? null,
        draftFindings: r._count.findings,
      };
    })
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
}

/** Counts for the team dashboard (submission-review workflow only). */
export async function getReviewSummary(user: CurrentUser, now = new Date()): Promise<ReviewSummary> {
  if (user.role !== "TEAM") return { waiting: 0, inReview: 0, changesRequested: 0, completedThisWeek: 0 };
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [groups, completed] = await Promise.all([
    prisma.creative.groupBy({
      by: ["status"],
      where: { workflow: "SUBMISSION_REVIEW", status: { in: ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED"] } },
      _count: { _all: true },
    }),
    prisma.reviewDecision.count({ where: { kind: "FINAL", createdAt: { gte: weekAgo } } }),
  ]);
  const n = (s: CreativeStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { waiting: n("SUBMITTED"), inReview: n("IN_REVIEW"), changesRequested: n("CHANGES_REQUESTED"), completedThisWeek: completed };
}
