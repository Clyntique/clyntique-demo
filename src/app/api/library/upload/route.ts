import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { LIBRARY_LIMITS, libraryKindFor, libraryPathFor, libraryWorkspaceKey } from "@/lib/library-files";
import { UPLOAD_KEY_PATTERN } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { uploadsConfigured } from "@/lib/review/blob";
import { libraryOwnerFor } from "@/lib/workflow/library-commands";

/*
 * Issues short-lived client upload tokens for Content Library files (Vercel
 * Blob client uploads into the PRIVATE store), the same way
 * /api/evidence/upload does for evidence files.
 *
 * A token is issued only to a signed-in user, for one exact storage path in
 * THEIR OWN workspace's folder (a client's id, or "clyntique" for the team),
 * with the content type fixed by the extension (PDF, DOCX, TXT) and the size
 * capped at 10 MB by the store itself. The file is not a document until
 * createLibraryDocument (src/lib/workflow/library-commands.ts) verifies it
 * and records it.
 */

const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

function deny(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

class UploadRejected extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return deny("Please sign in again.", 401);
  if (!uploadsConfigured()) return deny("File uploads are not configured yet.", 503);

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return deny("Invalid upload request.", 400);
  }
  if (body?.type !== "blob.generate-client-token") return deny("Invalid upload request.", 400);

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { uploadKey?: unknown; fileName?: unknown };
        try {
          payload = JSON.parse(clientPayload ?? "{}");
        } catch {
          throw new UploadRejected("Invalid upload request.");
        }
        const { uploadKey, fileName } = payload;
        if (typeof fileName !== "string") throw new UploadRejected("Invalid upload request.");
        if (typeof uploadKey !== "string" || !UPLOAD_KEY_PATTERN.test(uploadKey)) throw new UploadRejected("Invalid upload request.");

        const ownerClientId = libraryOwnerFor(user);
        const count = await prisma.libraryDocument.count({ where: { ownerClientId, status: { not: "DELETED" } } });
        if (count >= LIBRARY_LIMITS.documentsPerWorkspace) {
          throw new UploadRejected(`This library holds up to ${LIBRARY_LIMITS.documentsPerWorkspace} documents. Delete one you no longer need first.`, 403);
        }

        const kind = libraryKindFor(fileName);
        if (!kind) throw new UploadRejected("Unsupported file type. Upload a PDF, Word (DOCX) or plain-text file.");
        // The browser must ask for exactly the path the server would build, in its own workspace's folder.
        if (pathname !== libraryPathFor(libraryWorkspaceKey(ownerClientId), uploadKey, kind.extension)) throw new UploadRejected("Invalid upload request.");

        return {
          allowedContentTypes: [kind.mimeType],
          maximumSizeInBytes: LIBRARY_LIMITS.maxBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + TOKEN_LIFETIME_MS,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadRejected) return deny(error.message, error.status);
    console.error("Library upload token request failed", error instanceof Error ? error.name : "unknown error");
    return deny("The upload could not be started. Please try again.", 500);
  }
}
