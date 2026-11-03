// Content Library file rules shared by the uploader (browser) and the server.
// The server re-checks everything; the browser checks only to fail fast.
// Mirrors src/lib/evidence-files.ts: extension → the only content type accepted
// for it; the stored file's leading bytes are checked after upload.

export type LibraryFileKind = { mimeType: string; label: string };

export const LIBRARY_BY_EXTENSION: Record<string, LibraryFileKind> = {
  pdf: { mimeType: "application/pdf", label: "PDF" },
  docx: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word (DOCX)" },
  txt: { mimeType: "text/plain", label: "Text" },
};

export const LIBRARY_ACCEPT = Object.keys(LIBRARY_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

/**
 * Fixed limits (first version, Nov 2). They bound Blob storage, the text kept
 * in the database and the processing time of one upload on a serverless
 * function. Raising them is a product decision, not a configuration change.
 */
export const LIBRARY_LIMITS = {
  /** One file: 10 MB, the same ceiling as evidence files. */
  maxBytes: 10 * 1024 * 1024,
  /** Documents per workspace (Clyntique's library counts as one workspace). */
  documentsPerWorkspace: 200,
  /** Extracted characters kept per document; longer text is cut and the document says so. */
  maxTextChars: 400_000,
  /** Search chunks per document (about 900 characters each). */
  maxChunks: 600,
  /** Pages read from a PDF. */
  maxPages: 300,
} as const;

export const LIBRARY_FILE_HINT = "PDF, Word (DOCX) or plain text, up to 10 MB. Text is extracted for search; scanned PDFs without a text layer cannot be searched.";

export function libraryKindFor(fileName: string): (LibraryFileKind & { extension: string }) | null {
  const match = /\.([a-z0-9]+)$/i.exec(String(fileName ?? "").trim());
  const extension = match ? match[1].toLowerCase() : "";
  const kind = LIBRARY_BY_EXTENSION[extension];
  return kind ? { ...kind, extension } : null;
}

/** Storage key: server-validated workspace key and upload key, whitelisted extension; never the user's file name. */
export function libraryPathFor(workspaceKey: string, uploadKey: string, extension: string) {
  return `library/${workspaceKey}/${uploadKey}.${extension}`;
}

/** Whether a stored pathname is the one issued for this upload (with or without Blob's random suffix). */
export function libraryPathMatches(pathname: string, workspaceKey: string, uploadKey: string, extension: string) {
  const expected = libraryPathFor(workspaceKey, uploadKey, extension);
  const prefix = expected.slice(0, -(extension.length + 1));
  return (
    pathname === expected ||
    (pathname.startsWith(`${prefix}-`) && pathname.endsWith(`.${extension}`) && !pathname.slice(prefix.length).includes("/"))
  );
}

/** The workspace segment of a storage key: the client's id, or "clyntique" for the team's library. */
export function libraryWorkspaceKey(ownerClientId: string | null) {
  return ownerClientId ?? "clyntique";
}

/** Browser-side pre-check; the server repeats it. */
export function checkLibraryFile(file: { name: string; size: number }): string | null {
  if (!libraryKindFor(file.name)) return "Unsupported file type. Upload a PDF, Word (DOCX) or plain-text file.";
  if (file.size <= 0) return "This file is empty.";
  if (file.size > LIBRARY_LIMITS.maxBytes) return "Library files can be up to 10 MB.";
  return null;
}
