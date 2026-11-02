import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { EvidenceType, LibraryDocumentStatus, LibraryVisibility } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { mayReadDocument } from "@/lib/workflow/library-commands";

/*
 * Reads for the Content Library (Nov 2). Scope is decided HERE:
 * - CLIENT: documents of their own workspace only;
 * - TEAM: Clyntique's documents, plus client documents the client shared
 *   with reviewers (visibility TEAM).
 * Deleted documents are listed as tombstones only where a record points at
 * them; the library list hides them.
 */

export type LibraryDocumentSummary = {
  id: string;
  title: string;
  fileName: string;
  type: EvidenceType;
  source: string | null;
  status: LibraryDocumentStatus;
  visibility: LibraryVisibility;
  error: string | null;
  fileSize: number;
  pageCount: number | null;
  chunkCount: number;
  ownerName: string | null;
  isClyntique: boolean;
  /** Whether this viewer owns it (may process, share or delete it). */
  mine: boolean;
  createdAt: Date;
  processedAt: Date | null;
};

export type LibraryDocumentDetail = LibraryDocumentSummary & {
  uploadedByName: string;
  textChars: number;
  deletedAt: Date | null;
  /** The first passages, so a reader can see what was indexed. */
  preview: { id: string; index: number; page: number | null; text: string }[];
  /** Dictionary records saved from this document that the viewer may see. */
  records: { id: string; title: string; createdAt: Date }[];
  /** Whether a file exists and the viewer may download it. */
  downloadable: boolean;
};

/** Readable documents of this viewer, any status. */
export function libraryScope(user: CurrentUser): Prisma.LibraryDocumentWhereInput {
  if (user.role === "CLIENT") return { ownerClientId: user.id };
  return { OR: [{ ownerClientId: null }, { visibility: "TEAM" }] };
}

/** Documents search may use: readable and indexed. */
export function searchableScope(user: CurrentUser): Prisma.LibraryDocumentWhereInput {
  return { AND: [libraryScope(user), { status: "READY" }] };
}

const SUMMARY_SELECT = {
  id: true,
  ownerClientId: true,
  title: true,
  fileName: true,
  type: true,
  source: true,
  status: true,
  visibility: true,
  error: true,
  fileSize: true,
  pageCount: true,
  chunkCount: true,
  createdAt: true,
  processedAt: true,
  owner: { select: { name: true } },
} satisfies Prisma.LibraryDocumentSelect;

type SummaryRow = Prisma.LibraryDocumentGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(user: CurrentUser, d: SummaryRow): LibraryDocumentSummary {
  return {
    id: d.id,
    title: d.title,
    fileName: d.fileName,
    type: d.type,
    source: d.source,
    status: d.status,
    visibility: d.visibility,
    error: d.error,
    fileSize: d.fileSize,
    pageCount: d.pageCount,
    chunkCount: d.chunkCount,
    ownerName: d.owner?.name ?? null,
    isClyntique: d.ownerClientId === null,
    mine: d.ownerClientId === (user.role === "TEAM" ? null : user.id),
    createdAt: d.createdAt,
    processedAt: d.processedAt,
  };
}

export async function getLibraryDocuments(user: CurrentUser): Promise<LibraryDocumentSummary[]> {
  const rows = await prisma.libraryDocument.findMany({
    where: { AND: [libraryScope(user), { status: { not: "DELETED" } }] },
    orderBy: { createdAt: "desc" },
    select: SUMMARY_SELECT,
  });
  return rows.map((d) => toSummary(user, d));
}

export async function getLibraryDocument(user: CurrentUser, documentId: string): Promise<LibraryDocumentDetail | null> {
  if (!documentId) return null;
  const d = await prisma.libraryDocument.findFirst({
    where: { AND: [{ id: documentId }, libraryScope(user)] },
    select: {
      ...SUMMARY_SELECT,
      textChars: true,
      deletedAt: true,
      fileUrl: true,
      uploadedBy: { select: { name: true } },
      chunks: { orderBy: { index: "asc" }, take: 5, select: { id: true, index: true, page: true, text: true } },
      records: {
        where: user.role === "CLIENT" ? { ownerClientId: user.id } : { OR: [{ ownerClientId: null }, { ownerClientId: { not: null } }] },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, createdAt: true, ownerClientId: true },
      },
    },
  });
  if (!d || !mayReadDocument(user, d)) return null;
  return {
    ...toSummary(user, d),
    uploadedByName: d.uploadedBy.name,
    textChars: d.textChars,
    deletedAt: d.deletedAt,
    preview: d.chunks,
    // The team sees Clyntique's records from a client's shared document, never the client's own records.
    records: d.records.filter((r) => user.role === "CLIENT" || r.ownerClientId === null || d.ownerClientId === null).map(({ id, title, createdAt }) => ({ id, title, createdAt })),
    downloadable: Boolean(d.fileUrl) && d.status !== "DELETED",
  };
}

/** For the download route: the file of a document this viewer may read, or null. */
export async function findAccessibleLibraryFile(user: CurrentUser, documentId: string) {
  if (!documentId) return null;
  const d = await prisma.libraryDocument.findFirst({
    where: { AND: [{ id: documentId }, libraryScope(user), { status: { not: "DELETED" } }] },
    select: { id: true, ownerClientId: true, visibility: true, fileUrl: true, fileName: true, mimeType: true },
  });
  if (!d || !d.fileUrl || !mayReadDocument(user, d)) return null;
  return d;
}

export async function getLibraryCounts(user: CurrentUser) {
  const rows = await prisma.libraryDocument.groupBy({
    by: ["status"],
    where: { AND: [libraryScope(user), { status: { not: "DELETED" } }] },
    _count: { _all: true },
  });
  const by = (s: LibraryDocumentStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return { total: rows.reduce((n, r) => n + r._count._all, 0), ready: by("READY"), failed: by("FAILED"), pending: by("PENDING") + by("PROCESSING") };
}
