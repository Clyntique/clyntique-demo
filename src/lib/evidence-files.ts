// Evidence file rules shared by the uploader (browser) and the server.
// The server re-checks everything; the browser checks only to fail fast.

export type EvidenceFileKind = { mimeType: string; label: string; inline: boolean };

// Extension → the only content type we accept for it. The server derives the
// type from the extension, then checks the stored file's leading bytes.
export const EVIDENCE_BY_EXTENSION: Record<string, EvidenceFileKind> = {
  pdf: { mimeType: "application/pdf", label: "PDF", inline: false },
  png: { mimeType: "image/png", label: "PNG", inline: true },
  jpg: { mimeType: "image/jpeg", label: "JPEG", inline: true },
  jpeg: { mimeType: "image/jpeg", label: "JPEG", inline: true },
  webp: { mimeType: "image/webp", label: "WebP", inline: true },
};

export const EVIDENCE_ACCEPT = Object.keys(EVIDENCE_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

/** Fixed limit for evidence files (product decision, M5): 10 MB. */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export const EVIDENCE_FILE_HINT = "PDF, PNG, JPEG or WebP, up to 10 MB.";

export function evidenceKindFor(fileName: string): (EvidenceFileKind & { extension: string }) | null {
  const match = /\.([a-z0-9]+)$/i.exec(String(fileName ?? "").trim());
  const extension = match ? match[1].toLowerCase() : "";
  const kind = EVIDENCE_BY_EXTENSION[extension];
  return kind ? { ...kind, extension } : null;
}

/** Returns a user-facing error, or null when the file may be uploaded. */
export function checkEvidenceFile(file: { name: string; size: number }): string | null {
  if (!evidenceKindFor(file.name)) return "Unsupported file type. Upload a PDF, PNG, JPEG or WebP file.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > EVIDENCE_MAX_BYTES) return "Evidence files can be up to 10 MB.";
  return null;
}

// Storage key for an evidence upload, built only from server-validated ids
// and a whitelisted extension (never the user's file name). Vercel Blob
// appends a random suffix before the extension.
export function evidencePathFor(creativeId: string, uploadKey: string, extension: string) {
  return `evidence/${creativeId}/${uploadKey}.${extension}`;
}

/** Whether a stored pathname is the one issued for this upload (with or without the random suffix). */
export function evidencePathMatches(pathname: string, creativeId: string, uploadKey: string, extension: string) {
  const expected = evidencePathFor(creativeId, uploadKey, extension);
  const prefix = expected.slice(0, -(extension.length + 1));
  return (
    pathname === expected ||
    (pathname.startsWith(`${prefix}-`) && pathname.endsWith(`.${extension}`) && !pathname.slice(prefix.length).includes("/"))
  );
}
