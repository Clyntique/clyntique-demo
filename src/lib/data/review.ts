import "server-only";
import type { ApprovalStatus, CreativeFormat, CreativeStatus, CreativeWorkflow, EvidenceType, MediaType, Role } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { creativeScope } from "./workspace";

/*
 * Everything the review page shows for one creative, scoped to the user with
 * the same rules as the workspace lists (CLIENT: own projects, never drafts).
 * Returns null for missing and forbidden creatives alike.
 */

export type ReviewVersion = {
  id: string;
  versionNumber: number;
  fileName: string | null;
  mimeType: string | null;
  mediaType: MediaType | null;
  sizeBytes: number | null;
  changeNotes: string | null;
  createdAt: Date;
  createdByName: string;
  commentCount: number;
  decision: { status: ApprovalStatus; at: Date } | null;
};

export type ThreadEntry =
  | { kind: "comment"; id: string; authorName: string; authorRole: Role; content: string; createdAt: Date; mine: boolean }
  | {
      kind: "decision";
      id: string;
      authorName: string;
      status: ApprovalStatus;
      reason: string | null;
      createdAt: Date;
    };

export type EvidenceItem = {
  id: string;
  title: string;
  type: EvidenceType;
  description: string | null;
  source: string | null;
  url: string | null;
  date: Date | null;
};

export type CreativeReview = {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  format: CreativeFormat;
  status: CreativeStatus;
  workflow: CreativeWorkflow;
  updatedAt: Date;
  project: { id: string; name: string; clientName: string };
  versions: ReviewVersion[]; // newest first
  current: ReviewVersion | null;
  selected: ReviewVersion | null;
  evidence: EvidenceItem[];
  thread: ThreadEntry[]; // for the selected version, oldest first
};

export async function getCreativeReview(
  user: CurrentUser,
  creativeId: string,
  versionNumber?: number,
): Promise<CreativeReview | null> {
  const creative = await prisma.creative.findFirst({
    where: { AND: [{ id: creativeId }, creativeScope(user)] },
    select: {
      id: true,
      name: true,
      description: true,
      context: true,
      format: true,
      status: true,
      workflow: true,
      updatedAt: true,
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          mimeType: true,
          mediaType: true,
          sizeBytes: true,
          changeNotes: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          _count: { select: { comments: true } },
          approvals: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, createdAt: true } },
        },
      },
      evidence: {
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, type: true, description: true, source: true, url: true, date: true },
      },
    },
  });
  if (!creative) return null;

  const versions: ReviewVersion[] = creative.versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    fileName: v.fileName,
    mimeType: v.mimeType,
    mediaType: v.mediaType,
    sizeBytes: v.sizeBytes,
    changeNotes: v.changeNotes,
    createdAt: v.createdAt,
    createdByName: v.createdBy.name,
    commentCount: v._count.comments,
    decision: v.approvals[0] ? { status: v.approvals[0].status, at: v.approvals[0].createdAt } : null,
  }));
  const current = versions[0] ?? null;
  const selected = (versionNumber && versions.find((v) => v.versionNumber === versionNumber)) || current;

  let thread: ThreadEntry[] = [];
  if (selected) {
    const [comments, approvals] = await Promise.all([
      prisma.comment.findMany({
        where: { creativeId: creative.id, versionId: selected.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, content: true, createdAt: true, user: { select: { id: true, name: true, role: true } } },
      }),
      prisma.approval.findMany({
        where: { creativeId: creative.id, versionId: selected.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, reason: true, createdAt: true, user: { select: { name: true } } },
      }),
    ]);
    thread = [
      ...comments.map((c) => ({
        kind: "comment" as const,
        id: c.id,
        authorName: c.user.name,
        authorRole: c.user.role,
        content: c.content,
        createdAt: c.createdAt,
        mine: c.user.id === user.id,
      })),
      ...approvals.map((a) => ({
        kind: "decision" as const,
        id: a.id,
        authorName: a.user.name,
        status: a.status,
        reason: a.reason,
        createdAt: a.createdAt,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  return {
    id: creative.id,
    name: creative.name,
    description: creative.description,
    context: creative.context,
    format: creative.format,
    status: creative.status,
    workflow: creative.workflow,
    updatedAt: creative.updatedAt,
    project: { id: creative.project.id, name: creative.project.name, clientName: creative.project.client.name },
    versions,
    current,
    selected,
    evidence: creative.evidence,
    thread,
  };
}
