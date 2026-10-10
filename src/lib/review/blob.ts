import "server-only";
import { del, get, head, type HeadBlobResult } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

/*
 * Vercel Blob access for creative files.
 *
 * Creative files live in a PRIVATE Blob store: blob URLs are not publicly
 * readable, and every read goes through /api/media/[versionId], which checks
 * the viewer's access first. The SDK authenticates with BLOB_READ_WRITE_TOKEN
 * (required for client upload tokens), or OIDC (BLOB_STORE_ID) on Vercel.
 */

const ACCESS = "private" as const;

/** Client uploads need the read-write token to sign upload tokens. */
export function uploadsConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** True only for URLs in a private Vercel Blob store. */
export function isPrivateBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function headBlob(url: string): Promise<HeadBlobResult | null> {
  try {
    return await head(url);
  } catch {
    return null;
  }
}

/** Streams a private blob, forwarding Range / If-None-Match for video seeking and caching. */
export function readBlob(pathnameOrUrl: string, init: { range?: string | null; ifNoneMatch?: string | null }) {
  return get(pathnameOrUrl, {
    access: ACCESS,
    ifNoneMatch: init.ifNoneMatch ?? undefined,
    headers: init.range ? { range: init.range } : undefined,
  });
}

// Leading bytes of each accepted format. Checked against the stored file, so a
// renamed or mislabelled file is rejected even if the browser lied about it.
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "video/mp4": (b) => ascii(b, 4, 8) === "ftyp",
  "video/webm": (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  "application/pdf": (b) => ascii(b, 0, 5) === "%PDF-",
};

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Reads the first bytes of a stored blob and checks them against the expected type. */
export async function contentMatches(url: string, mimeType: string): Promise<boolean> {
  const check = SIGNATURES[mimeType];
  if (!check) return false;
  const result = await get(url, { access: ACCESS, useCache: false, headers: { range: "bytes=0-31" } });
  if (!result || result.statusCode !== 200) return false;

  const reader = result.stream.getReader();
  const bytes = new Uint8Array(32);
  let filled = 0;
  try {
    while (filled < bytes.length) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.length, bytes.length - filled);
      bytes.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return filled >= 12 && check(bytes);
}

/**
 * Deletes a blob only if no creative version or evidence item references it. Used for uploads
 * that were rejected or abandoned. Files in the version or evidence history are never deleted.
 */
export async function deleteUnreferencedBlob(url: string) {
  const [version, evidence] = await Promise.all([
    prisma.creativeVersion.findFirst({ where: { fileUrl: url }, select: { id: true } }),
    prisma.evidence.findFirst({ where: { fileUrl: url }, select: { id: true } }),
  ]);
  if (version || evidence) return false;
  try {
    await del(url);
    return true;
  } catch (error) {
    console.error("Blob cleanup failed", error instanceof Error ? error.name : "unknown error");
    return false;
  }
}
