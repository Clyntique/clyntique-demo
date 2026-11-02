import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CreativeStatus, EvidenceRecordCheckResult, EvidenceRecordStatus, EvidenceType } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { basePathFor } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { attachmentReachedTeam, recordExpired, teamMaySeeRecord } from "@/lib/workflow/evidence-records";
import { authorize } from "@/lib/workflow/policy";
import { creativeScope } from "./workspace";

/*
 * Reads for the Evidence Dictionary (Nov 2). Scope is decided HERE, on the
 * server, never in a page:
 * - CLIENT: only records of their own workspace (ownerClientId = the client),
 *   and only their own attachments of them.
 * - TEAM: Clyntique's records, plus a client's record once an attachment of it
 *   reached the team through a submission (teamMaySeeRecord); of the
 *   attachments, only those the team has received.
 * A client sees reviewer names as "Clyntique reviewer" (decision D4).
 */

export type EvidenceRecordSummary = {
  id: string;
  title: string;
  type: EvidenceType;
  status: EvidenceRecordStatus;
  claimText: string | null;
  source: string | null;
  validUntil: Date | null;
  expired: boolean;
  /** TEAM: the client workspace it belongs to; null for Clyntique's records. */
  ownerName: string | null;
  isClyntique: boolean;
  /** Attachments this viewer may see. */
  usageCount: number;
  lastCheckedAt: Date | null;
  createdAt: Date;
};

export type EvidenceRecordUsage = {
  evidenceId: string;
  creativeId: string;
  creativeName: string;
  projectName: string;
  creativeStatus: CreativeStatus;
  versionNumber: number | null;
  attachedAt: Date;
  withdrawn: boolean;
  href: string;
  recordHref: string;
};

export type EvidenceRecordCheckView = {
  id: string;
  result: EvidenceRecordCheckResult;
  note: string | null;
  reviewerName: string;
  createdAt: Date;
};

export type EvidenceRecordDetail = EvidenceRecordSummary & {
  description: string | null;
  url: string | null;
  createdByName: string;
  usages: EvidenceRecordUsage[]; // newest first
  checks: EvidenceRecordCheckView[]; // newest first
  /** TEAM: may record a check now. */
  canCheck: boolean;
  /** Submissions this viewer may attach the record to now (not already attached). */
  attachTargets: { id: string; name: string; status: CreativeStatus }[];
};

export type RecordFilter = { query?: string; type?: string; status?: string; owner?: "CLIENT" | "CLYNTIQUE" };

/** Records of the viewer's workspace. The TEAM query is a superset that JS narrows with teamMaySeeRecord. */
export function recordScope(user: CurrentUser): Prisma.EvidenceRecordWhereInput {
  return user.role === "CLIENT"
    ? { ownerClientId: user.id }
    : { OR: [{ ownerClientId: null }, { attachments: { some: { withdrawnAt: null, creative: { workflow: "SUBMISSION_REVIEW", status: { not: "DRAFT" } } } } }] };
}

const ATTACHMENT_SELECT = {
  id: true,
  createdAt: true,
  withdrawnAt: true,
  version: { select: { versionNumber: true } },
  creative: {
    select: {
      id: true,
      name: true,
      workflow: true,
      status: true,
      project: { select: { name: true, clientId: true } },
      rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedAt: true, submittedName: true } },
    },
  },
} satisfies Prisma.EvidenceSelect;

type AttachmentRow = Prisma.EvidenceGetPayload<{ select: typeof ATTACHMENT_SELECT }>;

function fact(a: AttachmentRow) {
  return { createdAt: a.createdAt, withdrawnAt: a.withdrawnAt, creative: { workflow: a.creative.workflow, status: a.creative.status, lastSubmittedAt: a.creative.rounds[0]?.submittedAt ?? null } };
}

/** Attachments this viewer may see: a client their own, the team those that reached it. */
function visibleAttachments(user: CurrentUser, attachments: AttachmentRow[]) {
  return user.role === "TEAM" ? attachments.filter((a) => attachmentReachedTeam(fact(a))) : attachments.filter((a) => a.creative.project.clientId === user.id);
}

function filterWhere(filter: RecordFilter): Prisma.EvidenceRecordWhereInput {
  const and: Prisma.EvidenceRecordWhereInput[] = [];
  const query = filter.query?.trim();
  if (query) {
    and.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { claimText: { contains: query, mode: "insensitive" } },
        { source: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (filter.type) and.push({ type: filter.type as EvidenceType });
  if (filter.status) and.push({ status: filter.status as EvidenceRecordStatus });
  if (filter.owner === "CLYNTIQUE") and.push({ ownerClientId: null });
  if (filter.owner === "CLIENT") and.push({ ownerClientId: { not: null } });
  return and.length ? { AND: and } : {};
}

export const RECORD_STATUSES: EvidenceRecordStatus[] = ["UNCHECKED", "ACCEPTED", "NEEDS_MORE_INFO", "NOT_ACCEPTED"];

export async function getEvidenceRecords(user: CurrentUser, filter: RecordFilter = {}): Promise<EvidenceRecordSummary[]> {
  const rows = await prisma.evidenceRecord.findMany({
    where: { AND: [recordScope(user), filterWhere(filter)] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ownerClientId: true,
      title: true,
      type: true,
      status: true,
      claimText: true,
      source: true,
      validUntil: true,
      createdAt: true,
      owner: { select: { name: true } },
      attachments: { select: ATTACHMENT_SELECT },
      checks: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const now = new Date();
  return rows
    .filter((r) => user.role === "CLIENT" || teamMaySeeRecord({ ownerClientId: r.ownerClientId, attachments: r.attachments.map(fact) }))
    .map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      claimText: r.claimText,
      source: r.source,
      validUntil: r.validUntil,
      expired: recordExpired(r.validUntil, now),
      ownerName: user.role === "TEAM" ? (r.owner?.name ?? null) : null,
      isClyntique: r.ownerClientId === null,
      usageCount: visibleAttachments(user, r.attachments).length,
      lastCheckedAt: r.checks[0]?.createdAt ?? null,
      createdAt: r.createdAt,
    }));
}

/** Submissions a client may attach evidence to now (their own, accepting evidence), or the team may add reviewer evidence to (under review). */
async function attachTargetsFor(user: CurrentUser, excludeCreativeIds: Set<string>) {
  const rows = await prisma.creative.findMany({
    where: {
      AND: [
        creativeScope(user),
        { workflow: "SUBMISSION_REVIEW", status: user.role === "CLIENT" ? { in: ["DRAFT", "CHANGES_REQUESTED"] } : "IN_REVIEW" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, name: true, status: true, workflow: true, project: { select: { clientId: true } }, rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedName: true } } },
  });
  return rows
    .filter((c) => !excludeCreativeIds.has(c.id))
    .filter((c) => authorize(user, user.role === "CLIENT" ? "MANAGE_EVIDENCE" : "ADD_REVIEWER_EVIDENCE", { id: c.id, workflow: c.workflow, status: c.status, projectClientId: c.project.clientId }).ok)
    .map((c) => ({ id: c.id, name: user.role === "TEAM" ? (c.rounds[0]?.submittedName ?? c.name) : c.name, status: c.status }));
}

/** Returns null when the record does not exist or the viewer may not see it. */
export async function getEvidenceRecord(user: CurrentUser, recordId: string): Promise<EvidenceRecordDetail | null> {
  if (!recordId || typeof recordId !== "string") return null;
  const r = await prisma.evidenceRecord.findFirst({
    where: { AND: [{ id: recordId }, recordScope(user)] },
    select: {
      id: true,
      ownerClientId: true,
      title: true,
      type: true,
      status: true,
      description: true,
      source: true,
      url: true,
      claimText: true,
      validUntil: true,
      createdAt: true,
      owner: { select: { name: true } },
      createdBy: { select: { name: true, role: true } },
      attachments: { select: ATTACHMENT_SELECT, orderBy: { createdAt: "desc" } },
      checks: { orderBy: { createdAt: "desc" }, select: { id: true, result: true, note: true, createdAt: true, reviewer: { select: { name: true } } } },
    },
  });
  if (!r) return null;
  const team = user.role === "TEAM";
  if (team && !teamMaySeeRecord({ ownerClientId: r.ownerClientId, attachments: r.attachments.map(fact) })) return null;

  const base = basePathFor(user.role);
  const usages = visibleAttachments(user, r.attachments).map((a) => ({
    evidenceId: a.id,
    creativeId: a.creative.id,
    creativeName: team ? (a.creative.rounds[0]?.submittedName ?? a.creative.name) : a.creative.name,
    projectName: a.creative.project.name,
    creativeStatus: a.creative.status,
    versionNumber: a.version?.versionNumber ?? null,
    attachedAt: a.createdAt,
    withdrawn: a.withdrawnAt !== null,
    href: `${base}/creatives/${a.creative.id}?tab=evidence#evidence-${a.id}`,
    recordHref: `${base}/creatives/${a.creative.id}/record`,
  }));
  // Only an active attachment blocks attaching again; a withdrawn one doesn't.
  const attached = new Set(r.attachments.filter((a) => a.withdrawnAt === null).map((a) => a.creative.id));
  // A client attaches their own records; the team attaches Clyntique's.
  const mayAttach = team ? r.ownerClientId === null : r.ownerClientId === user.id;
  const attachTargets = mayAttach ? await attachTargetsFor(user, attached) : [];

  return {
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    claimText: r.claimText,
    source: r.source,
    validUntil: r.validUntil,
    expired: recordExpired(r.validUntil),
    ownerName: team ? (r.owner?.name ?? null) : null,
    isClyntique: r.ownerClientId === null,
    usageCount: usages.length,
    lastCheckedAt: r.checks[0]?.createdAt ?? null,
    createdAt: r.createdAt,
    description: r.description,
    url: r.url,
    createdByName: team || r.createdBy.role === "CLIENT" ? r.createdBy.name : "Clyntique reviewer",
    usages,
    checks: r.checks.map((c) => ({ id: c.id, result: c.result, note: c.note, reviewerName: team ? c.reviewer.name : "Clyntique reviewer", createdAt: c.createdAt })),
    canCheck: team,
    attachTargets,
  };
}

export type AttachableRecord = { id: string; title: string; type: EvidenceType; status: EvidenceRecordStatus; expired: boolean };

/**
 * Records the viewer may attach to this creative from its Evidence tab: a
 * client's own records, or Clyntique's for the team; never one already
 * actively attached. Empty when the viewer may not add evidence now.
 */
export async function getAttachableRecords(user: CurrentUser, creativeId: string): Promise<AttachableRecord[]> {
  if (!creativeId) return [];
  const creative = await prisma.creative.findFirst({
    where: { AND: [{ id: creativeId, workflow: "SUBMISSION_REVIEW" }, creativeScope(user)] },
    select: { id: true, workflow: true, status: true, project: { select: { clientId: true } } },
  });
  if (!creative) return [];
  const allowed = authorize(user, user.role === "CLIENT" ? "MANAGE_EVIDENCE" : "ADD_REVIEWER_EVIDENCE", { id: creative.id, workflow: creative.workflow, status: creative.status, projectClientId: creative.project.clientId });
  if (!allowed.ok) return [];
  const rows = await prisma.evidenceRecord.findMany({
    where: { ownerClientId: user.role === "CLIENT" ? user.id : null, attachments: { none: { creativeId: creative.id, withdrawnAt: null } } },
    orderBy: { title: "asc" },
    take: 200,
    select: { id: true, title: true, type: true, status: true, validUntil: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, type: r.type, status: r.status, expired: recordExpired(r.validUntil) }));
}

/** Counts by status within the viewer's scope, for the dictionary's summary strip. */
export async function getEvidenceRecordCounts(user: CurrentUser): Promise<Record<EvidenceRecordStatus, number> & { total: number }> {
  const records = await getEvidenceRecords(user);
  const counts = { UNCHECKED: 0, ACCEPTED: 0, NEEDS_MORE_INFO: 0, NOT_ACCEPTED: 0, total: records.length };
  for (const r of records) counts[r.status] += 1;
  return counts;
}
