import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityType, CreativeFormat, CreativeStatus } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/*
 * Read queries for the workspace pages.
 *
 * Every function takes the signed-in user (from requireRole/requireUser) and
 * scopes its query to what that user may see:
 * - TEAM sees every project and creative.
 * - CLIENT sees only projects where they are the client, and never DRAFT
 *   creatives (drafts are not shared yet).
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
  projectId: string;
  projectName: string;
  clientName: string;
  versionCount: number;
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

function projectScope(user: CurrentUser): Prisma.ProjectWhereInput {
  return user.role === "TEAM" ? {} : { clientId: user.id };
}

function creativeScope(user: CurrentUser): Prisma.CreativeWhereInput {
  return user.role === "TEAM" ? {} : { project: { clientId: user.id }, status: { not: "DRAFT" } };
}

const projectSelect = (user: CurrentUser) =>
  ({
    id: true,
    name: true,
    description: true,
    updatedAt: true,
    client: { select: { name: true } },
    creatives: {
      where: user.role === "TEAM" ? {} : { status: { not: "DRAFT" } },
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
      updatedAt: true,
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      _count: { select: { versions: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    format: c.format,
    status: c.status,
    projectId: c.project.id,
    projectName: c.project.name,
    clientName: c.project.client.name,
    versionCount: c._count.versions,
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
