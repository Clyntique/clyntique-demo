import "server-only";
import type { CreativeFormat, CreativeStatus, MarketKind, MediaType } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { creativeScope } from "./workspace";

/*
 * Reads for client-owned submissions (workflow SUBMISSION_REVIEW).
 * Same scope as every workspace query (creativeScope): the TEAM never gets a
 * client's draft, a CLIENT only gets submissions in their own projects.
 * Missing and forbidden submissions both return null.
 */

export type SubmissionVersion = {
  id: string;
  versionNumber: number;
  fileName: string | null;
  mimeType: string | null;
  mediaType: MediaType | null;
  sizeBytes: number | null;
  changeNotes: string | null;
  createdAt: Date;
  createdByName: string;
};

export type SubmissionRoundSummary = {
  number: number;
  versionNumber: number;
  submittedAt: Date;
  submittedByName: string;
};

export type TargetOption = { code: string; name: string };

export type SubmissionDetail = {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  format: CreativeFormat;
  status: CreativeStatus;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  createdByName: string | null;
  project: { id: string; name: string; clientName: string };
  markets: TargetOption[];
  platforms: TargetOption[];
  versions: SubmissionVersion[]; // newest first
  current: SubmissionVersion | null;
  selected: SubmissionVersion | null;
  rounds: SubmissionRoundSummary[]; // newest first
};

export async function getSubmission(user: CurrentUser, creativeId: string, versionNumber?: number): Promise<SubmissionDetail | null> {
  if (!creativeId || typeof creativeId !== "string") return null;
  const row = await prisma.creative.findFirst({
    where: { AND: [{ id: creativeId, workflow: "SUBMISSION_REVIEW" }, creativeScope(user)] },
    select: {
      id: true,
      name: true,
      description: true,
      context: true,
      format: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      submittedAt: true,
      createdBy: { select: { name: true } },
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      markets: { select: { market: { select: { code: true, name: true, sortOrder: true } } } },
      platforms: { select: { platform: { select: { code: true, name: true, sortOrder: true } } } },
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
        },
      },
      rounds: {
        orderBy: [{ cycle: { number: "desc" } }, { number: "desc" }],
        select: { number: true, submittedAt: true, submittedBy: { select: { name: true } }, version: { select: { versionNumber: true } } },
      },
    },
  });
  if (!row) return null;

  const versions = row.versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    fileName: v.fileName,
    mimeType: v.mimeType,
    mediaType: v.mediaType,
    sizeBytes: v.sizeBytes,
    changeNotes: v.changeNotes,
    createdAt: v.createdAt,
    createdByName: v.createdBy.name,
  }));
  const current = versions[0] ?? null;
  const selected = (versionNumber && versions.find((v) => v.versionNumber === versionNumber)) || current;
  const byOrder = <T extends { sortOrder: number; code: string; name: string }>(items: T[]) =>
    items.sort((a, b) => a.sortOrder - b.sortOrder).map(({ code, name }) => ({ code, name }));

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    context: row.context,
    format: row.format,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    createdByName: row.createdBy?.name ?? null,
    project: { id: row.project.id, name: row.project.name, clientName: row.project.client.name },
    markets: byOrder(row.markets.map((m) => m.market)),
    platforms: byOrder(row.platforms.map((p) => p.platform)),
    versions,
    current,
    selected,
    rounds: row.rounds.map((r) => ({
      number: r.number,
      versionNumber: r.version.versionNumber,
      submittedAt: r.submittedAt,
      submittedByName: r.submittedBy.name,
    })),
  };
}

export type TargetingOptions = { markets: (TargetOption & { kind: MarketKind })[]; platforms: TargetOption[] };

/** Active markets (countries first) and advertising platforms, in display order. */
export async function getTargetingOptions(): Promise<TargetingOptions> {
  const [markets, platforms] = await Promise.all([
    prisma.market.findMany({
      where: { active: true, kind: "COUNTRY" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { code: true, name: true, kind: true },
    }),
    prisma.adPlatform.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { code: true, name: true },
    }),
  ]);
  return { markets, platforms };
}

/** Projects a CLIENT may create submissions in: the ones assigned to them. */
export async function getSubmissionProjects(user: CurrentUser): Promise<{ id: string; name: string }[]> {
  if (user.role !== "CLIENT") return [];
  return prisma.project.findMany({
    where: { clientId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
