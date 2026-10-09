import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityType, CreativeFormat, CreativeStatus, CreativeWorkflow, MediaType } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/*
 * Read queries for the workspace pages.
 *
 * Every function takes the signed-in user (from requireRole/requireUser) and
 * scopes its query to what that user may see:
 * - TEAM sees every project, and every creative except clients' draft submissions.
 * - CLIENT sees only projects where they are the client: their own draft
 *   submissions, and never the team's legacy drafts.
 * Pages must never query Project/Creative/Activity directly.
 */

export type StatusCounts = Partial<Record<CreativeStatus, number>>;

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  clientName: string;
  creativeCount: number;
  statusCounts: StatusCounts;
  lastActivityAt: Date;
};

export type CreativeSummary = {
  id: string;
  name: string;
  description: string | null;
  format: CreativeFormat;
  status: CreativeStatus;
  workflow: CreativeWorkflow;
  projectId: string;
  projectName: string;
  clientName: string;
  versionCount: number;
  /** Newest version, for the thumbnail. Null until a file is uploaded. */
  latestVersion: { id: string; versionNumber: number; mediaType: MediaType | null } | null;
  updatedAt: Date;
};

export type ActivityItem = {
  id: string;
  type: ActivityType;
  message: string;
  projectId: string;
  projectName: string;
  actorName: string;
  createdAt: Date;
};

export type ClientOption = { id: string; name: string; email: string };

export function projectScope(user: CurrentUser): Prisma.ProjectWhereInput {
  return user.role === "TEAM" ? {} : { clientId: user.id };
}

/*
 * Drafts are private to the side that owns them:
 * - TEAM never sees a client's draft submission (SUBMISSION_REVIEW + DRAFT).
 * - CLIENT never sees a legacy draft (the team's pre-compliance workflow), but
 *   does see their own draft submissions.
 */
function draftPrivacy(user: CurrentUser): Prisma.CreativeWhereInput {
  return user.role === "TEAM"
    ? { NOT: { workflow: "SUBMISSION_REVIEW", status: "DRAFT" } }
    : { OR: [{ workflow: "SUBMISSION_REVIEW" }, { status: { not: "DRAFT" } }] };
}

export function creativeScope(user: CurrentUser): Prisma.CreativeWhereInput {
  return user.role === "TEAM" ? draftPrivacy(user) : { project: { clientId: user.id }, ...draftPrivacy(user) };
}

const projectSelect = (user: CurrentUser) =>
  ({
    id: true,
    name: true,
    description: true,
    updatedAt: true,
    client: { select: { name: true } },
    creatives: {
      where: draftPrivacy(user),
      select: { status: true, updatedAt: true },
    },
    activities: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
  }) satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: ReturnType<typeof projectSelect> }>;

function toProjectSummary(p: ProjectRow): ProjectSummary {
  const statusCounts: StatusCounts = {};
  let last = p.updatedAt.getTime();
  for (const c of p.creatives) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    last = Math.max(last, c.updatedAt.getTime());
  }
  if (p.activities[0]) last = Math.max(last, p.activities[0].createdAt.getTime());

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    clientName: p.client.name,
    creativeCount: p.creatives.length,
    statusCounts,
    lastActivityAt: new Date(last),
  };
}

export async function getProjects(user: CurrentUser, query?: string): Promise<ProjectSummary[]> {
  const search: Prisma.ProjectWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { client: { name: { contains: query, mode: "insensitive" } } },
        ],
      }
    : {};
  const rows = await prisma.project.findMany({
    where: { AND: [projectScope(user), search] },
    select: projectSelect(user),
  });
  return rows
    .map(toProjectSummary)
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

/** Returns null when the project does not exist or the user may not see it. */
export async function getProject(user: CurrentUser, projectId: string): Promise<ProjectSummary | null> {
  const row = await prisma.project.findFirst({
    where: { AND: [{ id: projectId }, projectScope(user)] },
    select: projectSelect(user),
  });
  return row ? toProjectSummary(row) : null;
}

export async function getCreatives(
  user: CurrentUser,
  filter: { projectId?: string; status?: CreativeStatus } = {},
): Promise<CreativeSummary[]> {
  const rows = await prisma.creative.findMany({
    where: { AND: [creativeScope(user), filter] },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      format: true,
      status: true,
      workflow: true,
      updatedAt: true,
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      _count: { select: { versions: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true, mediaType: true },
      },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    format: c.format,
    status: c.status,
    workflow: c.workflow,
    projectId: c.project.id,
    projectName: c.project.name,
    clientName: c.project.client.name,
    versionCount: c._count.versions,
    latestVersion: c.versions[0] ?? null,
    updatedAt: c.updatedAt,
  }));
}

/** Creative counts per status, within the user's scope. */
export async function getCreativeStatusCounts(user: CurrentUser): Promise<StatusCounts> {
  const groups = await prisma.creative.groupBy({
    by: ["status"],
    where: creativeScope(user),
    _count: { _all: true },
  });
  return Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
}

export async function getActivity(
  user: CurrentUser,
  { projectId, take = 50 }: { projectId?: string; take?: number } = {},
): Promise<ActivityItem[]> {
  const rows = await prisma.activity.findMany({
    where: { project: projectScope(user), ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      user: { select: { name: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    message: a.message,
    projectId: a.project.id,
    projectName: a.project.name,
    actorName: a.user?.name ?? "Clyntique",
    createdAt: a.createdAt,
  }));
}

/** CLIENT users a project can be assigned to. TEAM only. */
export async function getClientOptions(user: CurrentUser): Promise<ClientOption[]> {
  if (user.role !== "TEAM") return [];
  return prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}
