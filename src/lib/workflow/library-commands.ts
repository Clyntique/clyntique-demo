import "server-only";
import { del } from "@vercel/blob";
import { EvidenceType as EvidenceTypes, type EvidenceType, type LibraryVisibility } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { UPLOAD_KEY_PATTERN } from "@/lib/media";
import { LIBRARY_LIMITS, libraryKindFor, libraryPathMatches, libraryWorkspaceKey } from "@/lib/library-files";
import { headBlob, isPrivateBlobUrl, readBlob } from "@/lib/review/blob";
import { chunkPages, countChars } from "@/lib/knowledge/chunk";
import { ExtractionError, extractDocumentText } from "@/lib/knowledge/extract";
import { LIMITS, clean, fail, run, type CommandResult } from "./commands";
import { createEvidenceRecord } from "./evidence-record-commands";

/*
 * Commands of the Content Library (Nov 2). Every command re-reads the user
 * and the document from the database and decides ownership itself:
 * - a CLIENT owns the documents of their own workspace (ownerClientId = them);
 * - the TEAM owns Clyntique's library (ownerClientId = null) and may READ a
 *   client's document only when the client shared it (visibility TEAM), but
 *   never changes or deletes a client's document.
 * Processing (text extraction) happens here, after the upload was verified
 * against the private Blob store, and only ever reads the file.
 */

const NOT_FOUND = "This document is no longer available.";
const NO_PERMISSION = "You don't have permission to do that.";

/** The workspace a user's uploads belong to: their own, or Clyntique's for the team. */
export function libraryOwnerFor(user: CurrentUser): string | null {
  return user.role === "TEAM" ? null : user.id;
}

export function ownsDocument(user: CurrentUser, doc: { ownerClientId: string | null }) {
  return doc.ownerClientId === libraryOwnerFor(user);
}

export function mayReadDocument(user: CurrentUser, doc: { ownerClientId: string | null; visibility: LibraryVisibility }) {
  if (ownsDocument(user, doc)) return true;
  return user.role === "TEAM" && doc.ownerClientId !== null && doc.visibility === "TEAM";
}

function blobAuth(): { token?: string } {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { token } : {};
}

export type NewDocumentInput = {
  uploadKey: string;
  url: string;
  fileName: string;
  title?: string;
  type: string;
  source?: string;
  visibility?: string;
};

/**
 * Records an uploaded file as a library document (status PENDING) after
 * verifying the upload: a private Blob URL, on the exact path the upload
 * route issued for this workspace and key, within the size limit, of the
 * type its extension says. The text is extracted by processLibraryDocument.
 */
export async function createLibraryDocument(user: CurrentUser, input: NewDocumentInput): Promise<CommandResult<{ documentId: string }>> {
  const ownerClientId = libraryOwnerFor(user);
  const uploadKey = String(input.uploadKey ?? "");
  const url = String(input.url ?? "");
  const fileName = String(input.fileName ?? "").trim().slice(0, 200);
  const kind = libraryKindFor(fileName);
  const unverified = fail("This upload couldn't be verified. Please upload the file again.");
  if (!UPLOAD_KEY_PATTERN.test(uploadKey) || !kind || !isPrivateBlobUrl(url)) return unverified;

  const type = Object.values(EvidenceTypes).find((t) => t === input.type) as EvidenceType | undefined;
  if (!type) return fail("Choose the type of document.");
  if (type === "POLICY_REFERENCE" && user.role !== "TEAM") return fail("Choose the type of document.");
  const title = clean(input.title, LIMITS.name) ?? "";
  const source = clean(input.source, LIMITS.name);
  if (source === null) return fail(`Keep the source under ${LIMITS.name} characters.`);
  const visibility: LibraryVisibility = user.role === "CLIENT" && input.visibility === "TEAM" ? "TEAM" : "PRIVATE";

  const count = await prisma.libraryDocument.count({ where: { ownerClientId, status: { not: "DELETED" } } });
  if (count >= LIBRARY_LIMITS.documentsPerWorkspace) return fail(`This library holds up to ${LIBRARY_LIMITS.documentsPerWorkspace} documents. Delete one you no longer need first.`);

  const existing = await prisma.libraryDocument.findFirst({ where: { fileUrl: url }, select: { id: true } });
  if (existing) return unverified;

  const blob = await headBlob(url);
  if (!blob) return fail("The uploaded file couldn't be found. Please try again.");
  if (!libraryPathMatches(blob.pathname, libraryWorkspaceKey(ownerClientId), uploadKey, kind.extension)) return unverified;
  if (blob.size <= 0 || blob.size > LIBRARY_LIMITS.maxBytes) {
    await del(url, blobAuth()).catch(() => {});
    return fail("Library files can be up to 10 MB.");
  }
  if (blob.contentType !== kind.mimeType) {
    await del(url, blobAuth()).catch(() => {});
    return fail(`This file isn't a valid ${kind.label} file.`);
  }

  return run("createLibraryDocument", async () => {
    const doc = await prisma.libraryDocument.create({
      data: {
        ownerClientId,
        uploadedById: user.id,
        title: title || fileName.replace(/\.[a-z0-9]+$/i, "").slice(0, LIMITS.name) || "Untitled document",
        fileName,
        mimeType: kind.mimeType,
        fileSize: blob.size,
        fileUrl: url,
        type,
        source: source || null,
        visibility,
      },
      select: { id: true },
    });
    return { ok: true, documentId: doc.id };
  });
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>, limit: number): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > limit) throw new ExtractionError("Library files can be up to 10 MB.");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(parts);
}

/**
 * Extracts the document's text into search chunks. Only the owner may run
 * it, only while the document is PENDING or FAILED (a retry). The file is
 * read from the private store, never from the browser. Any failure leaves
 * the document FAILED with a plain-words reason and no chunks.
 */
export async function processLibraryDocument(user: CurrentUser, documentId: string): Promise<CommandResult<{ chunkCount: number }>> {
  const doc = documentId
    ? await prisma.libraryDocument.findUnique({
        where: { id: String(documentId) },
        select: { id: true, ownerClientId: true, visibility: true, status: true, fileUrl: true, mimeType: true },
      })
    : null;
  if (!doc || doc.status === "DELETED" || !doc.fileUrl) return fail(NOT_FOUND);
  if (!ownsDocument(user, doc)) return fail(NO_PERMISSION);
  if (doc.status === "READY") return { ok: true, chunkCount: await prisma.libraryChunk.count({ where: { documentId: doc.id } }) };
  if (doc.status === "PROCESSING") return fail("This document is still being processed. Refresh in a moment.");

  // Claim it: a second concurrent request finds it PROCESSING and stops.
  const claimed = await prisma.libraryDocument.updateMany({
    where: { id: doc.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PROCESSING", error: null },
  });
  if (claimed.count !== 1) return fail("This document is still being processed. Refresh in a moment.");

  const failWith = async (message: string) => {
    await prisma.libraryDocument.update({ where: { id: doc.id }, data: { status: "FAILED", error: message } });
    return fail(message);
  };

  let buffer: Buffer;
  try {
    const result = await readBlob(doc.fileUrl, { range: null, ifNoneMatch: null });
    if (!result || result.statusCode !== 200) return failWith("The file could not be read from storage. Try again later.");
    buffer = await streamToBuffer(result.stream, LIBRARY_LIMITS.maxBytes);
  } catch (error) {
    if (error instanceof ExtractionError) return failWith(error.message);
    console.error("Library read failed", error instanceof Error ? error.name : "unknown error");
    return failWith("The file could not be read from storage. Try again later.");
  }

  let extraction;
  try {
    extraction = await extractDocumentText(buffer, doc.mimeType);
  } catch (error) {
    if (error instanceof ExtractionError) return failWith(error.message);
    console.error("Library extraction failed", error instanceof Error ? error.name : "unknown error");
    return failWith("The text could not be extracted from this file.");
  }

  const { chunks, truncated } = chunkPages(extraction.pages, { maxChunks: LIBRARY_LIMITS.maxChunks });
  const notes: string[] = [];
  if (extraction.truncated) notes.push(`Only the first ${LIBRARY_LIMITS.maxTextChars.toLocaleString("en-US")} characters were indexed.`);
  if (truncated) notes.push(`Only the first ${LIBRARY_LIMITS.maxChunks} passages were indexed.`);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.libraryChunk.deleteMany({ where: { documentId: doc.id } });
      await tx.libraryChunk.createMany({ data: chunks.map((c) => ({ documentId: doc.id, index: c.index, page: c.page, text: c.text })) });
      await tx.libraryDocument.update({
        where: { id: doc.id },
        data: {
          status: "READY",
          error: notes.length ? notes.join(" ") : null,
          pageCount: extraction.pageCount,
          chunkCount: chunks.length,
          textChars: countChars(extraction.pages),
          processedAt: new Date(),
        },
      });
    });
  } catch (error) {
    console.error("Library indexing failed", error instanceof Error ? error.name : "unknown error");
    return failWith("The document could not be indexed. Try again later.");
  }
  return { ok: true, chunkCount: chunks.length };
}

/** CLIENT only: share a document with Clyntique reviewers, or make it private again. */
export async function setLibraryVisibility(user: CurrentUser, documentId: string, visibility: string): Promise<CommandResult> {
  if (user.role !== "CLIENT") return fail(NO_PERMISSION);
  const next: LibraryVisibility = visibility === "TEAM" ? "TEAM" : "PRIVATE";
  const updated = await prisma.libraryDocument.updateMany({
    where: { id: String(documentId ?? ""), ownerClientId: user.id, status: { not: "DELETED" } },
    data: { visibility: next },
  });
  return updated.count === 1 ? { ok: true } : fail(NOT_FOUND);
}

/**
 * Deletes a document's file and its search chunks. The row stays as a
 * tombstone (status DELETED, no file, no text) so evidence records that
 * quoted it still say where the quote came from. Only the owner may delete.
 */
export async function deleteLibraryDocument(user: CurrentUser, documentId: string): Promise<CommandResult> {
  const doc = documentId
    ? await prisma.libraryDocument.findUnique({ where: { id: String(documentId) }, select: { id: true, ownerClientId: true, status: true, fileUrl: true } })
    : null;
  if (!doc || doc.status === "DELETED") return fail(NOT_FOUND);
  if (!ownsDocument(user, doc)) return fail(NO_PERMISSION);

  return run("deleteLibraryDocument", async () => {
    // Index first, then the file: a failed file delete is retried by hand; a
    // failed index delete would leave searchable text of a file that is gone.
    await prisma.$transaction(async (tx) => {
      await tx.libraryChunk.deleteMany({ where: { documentId: doc.id } });
      await tx.libraryDocument.update({
        where: { id: doc.id },
        data: { status: "DELETED", deletedAt: new Date(), deletedById: user.id, chunkCount: 0, textChars: 0, error: null },
      });
    });
    if (doc.fileUrl) {
      try {
        await del(doc.fileUrl, blobAuth());
        await prisma.libraryDocument.update({ where: { id: doc.id }, data: { fileUrl: null } });
      } catch (error) {
        console.error("Library file delete failed", error instanceof Error ? error.name : "unknown error");
        return fail("The document was removed from search, but its file could not be deleted yet. Please try again.");
      }
    }
    return { ok: true };
  });
}

/**
 * Saves a search result as an Evidence Dictionary record: the passage is
 * quoted as the description, the document is named as the source and
 * linked. The record goes through the ordinary record rules (and can then be
 * attached to a creative, checked by a reviewer and shown on the passport).
 * It is a record of what the document says, never a verification.
 */
export async function saveChunkAsRecord(user: CurrentUser, input: { chunkId: string; claimText?: string }): Promise<CommandResult<{ recordId: string }>> {
  const chunk = input.chunkId
    ? await prisma.libraryChunk.findUnique({
        where: { id: String(input.chunkId) },
        select: {
          id: true,
          page: true,
          text: true,
          document: { select: { id: true, ownerClientId: true, visibility: true, status: true, title: true, fileName: true, type: true, source: true } },
        },
      })
    : null;
  if (!chunk || chunk.document.status !== "READY" || !mayReadDocument(user, chunk.document)) return fail(NOT_FOUND);
  // A team member saving from a client's shared document creates a Clyntique record; a client's stays theirs.
  const type: EvidenceType = chunk.document.type === "POLICY_REFERENCE" && user.role !== "TEAM" ? "SOURCE" : chunk.document.type;
  const where = chunk.page ? `${chunk.document.fileName}, page ${chunk.page}` : chunk.document.fileName;
  const result = await createEvidenceRecord(user, {
    title: chunk.document.title.slice(0, LIMITS.name),
    type,
    description: `“${chunk.text.slice(0, LIMITS.text - 80)}”\n\n— ${where}`.slice(0, LIMITS.text),
    source: (chunk.document.source ? `${chunk.document.source} · ${where}` : where).slice(0, LIMITS.name),
    claimText: input.claimText,
  });
  if (!result.ok) return result;
  await prisma.evidenceRecord.update({ where: { id: result.recordId }, data: { documentId: chunk.document.id } });
  return result;
}
