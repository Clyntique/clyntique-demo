import type { MediaType } from "@/generated/prisma/enums";

// Creative file rules shared by the uploader (browser) and the server.
// The server re-checks everything; the browser checks only to fail fast.

export type MediaKind = { mediaType: MediaType; mimeType: string; label: string };

// Extension → the only content type we accept for it. The content type a
// browser reports is never trusted on its own: the server derives it from the
// extension and then checks the file's leading bytes (see lib/review/blob.ts).
export const MEDIA_BY_EXTENSION: Record<string, MediaKind> = {
  jpg: { mediaType: "IMAGE", mimeType: "image/jpeg", label: "JPEG" },
  jpeg: { mediaType: "IMAGE", mimeType: "image/jpeg", label: "JPEG" },
  png: { mediaType: "IMAGE", mimeType: "image/png", label: "PNG" },
  webp: { mediaType: "IMAGE", mimeType: "image/webp", label: "WebP" },
  mp4: { mediaType: "VIDEO", mimeType: "video/mp4", label: "MP4" },
  webm: { mediaType: "VIDEO", mimeType: "video/webm", label: "WebM" },
};

export const ACCEPT_ATTRIBUTE = Object.keys(MEDIA_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

export type UploadLimits = { imageBytes: number; videoBytes: number };

const MB = 1024 * 1024;
const DEFAULT_IMAGE_MB = 15;
const DEFAULT_VIDEO_MB = 100;
// Hard ceilings so a typo in an env var cannot open the door to huge files.
const MAX_IMAGE_MB = 50;
const MAX_VIDEO_MB = 500;

function readMb(value: string | undefined, fallback: number, ceiling: number) {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, ceiling);
}

/** Server only: reads the configurable limits. Pass the result to the browser as props. */
export function getUploadLimits(): UploadLimits {
  return {
    imageBytes: Math.floor(readMb(process.env.CREATIVE_MAX_IMAGE_MB, DEFAULT_IMAGE_MB, MAX_IMAGE_MB) * MB),
    videoBytes: Math.floor(readMb(process.env.CREATIVE_MAX_VIDEO_MB, DEFAULT_VIDEO_MB, MAX_VIDEO_MB) * MB),
  };
}

export function extensionOf(fileName: string) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

export function mediaKindFor(fileName: string): (MediaKind & { extension: string }) | null {
  const extension = extensionOf(fileName);
  const kind = MEDIA_BY_EXTENSION[extension];
  return kind ? { ...kind, extension } : null;
}

export function limitFor(mediaType: MediaType, limits: UploadLimits) {
  return mediaType === "IMAGE" ? limits.imageBytes : limits.videoBytes;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / MB;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Returns a user-facing error, or null when the file may be uploaded. */
export function checkFile(file: { name: string; size: number }, limits: UploadLimits): string | null {
  const kind = mediaKindFor(file.name);
  if (!kind) return "Unsupported file type. Upload a JPEG, PNG, WebP, MP4 or WebM file.";
  if (file.size === 0) return "This file is empty.";
  const limit = limitFor(kind.mediaType, limits);
  if (file.size > limit) {
    return `${kind.mediaType === "IMAGE" ? "Images" : "Videos"} can be up to ${formatBytes(limit)}. This file is ${formatBytes(file.size)}.`;
  }
  return null;
}

// Storage key for an upload. Built only from server-validated ids and a
// whitelisted extension, never from the user's file name. Vercel Blob appends
// a random suffix before the extension (addRandomSuffix).
export function uploadPathFor(creativeId: string, uploadKey: string, extension: string) {
  return `creatives/${creativeId}/${uploadKey}.${extension}`;
}

export const UPLOAD_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
