import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { EVIDENCE_MAX_BYTES, evidenceKindFor, evidencePathFor } from "@/lib/evidence-files";
import { UPLOAD_KEY_PATTERN } from "@/lib/media";
import { findAccessibleCreative, submissionFacts } from "@/lib/review/access";
import { uploadsConfigured } from "@/lib/review/blob";
import { DENIAL_MESSAGE, authorize } from "@/lib/workflow/policy";

/*
 * Issues short-lived client upload tokens for evidence files (Vercel Blob
 * client uploads into the PRIVATE store).
 *
 * A token is issued only to the client who owns the submission, while they may
 * manage its evidence (draft or changes requested; src/lib/workflow/policy.ts),
 * for one exact storage path built on the server, with the content type fixed
 * by the extension (PDF, PNG, JPEG, WebP) and the size capped at 10 MB by the
 * Blob store itself. The file is not evidence until addEvidence
 * (src/lib/workflow/commands.ts) re-verifies it and records it.
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
  // Token requests only. Evidence is recorded by addEvidence, not by the upload-completed webhook.
  if (body?.type !== "blob.generate-client-token") return deny("Invalid upload request.", 400);

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { creativeId?: unknown; uploadKey?: unknown; fileName?: unknown };
        try {
          payload = JSON.parse(clientPayload ?? "{}");
        } catch {
          throw new UploadRejected("Invalid upload request.");
        }
        const { creativeId, uploadKey, fileName } = payload;
        if (typeof creativeId !== "string" || typeof fileName !== "string") throw new UploadRejected("Invalid upload request.");
        if (typeof uploadKey !== "string" || !UPLOAD_KEY_PATTERN.test(uploadKey)) throw new UploadRejected("Invalid upload request.");

        const creative = await findAccessibleCreative(user, creativeId);
        if (!creative) throw new UploadRejected("This submission no longer exists.");
        const allowed = authorize(user, "MANAGE_EVIDENCE", submissionFacts(creative));
        if (!allowed.ok) throw new UploadRejected(DENIAL_MESSAGE[allowed.reason], allowed.reason === "NOT_FOUND" ? 400 : 403);

        const kind = evidenceKindFor(fileName);
        if (!kind) throw new UploadRejected("Unsupported file type. Upload a PDF, PNG, JPEG or WebP file.");
        // The browser must ask for exactly the path the server would build.
        if (pathname !== evidencePathFor(creative.id, uploadKey, kind.extension)) throw new UploadRejected("Invalid upload request.");

        return {
          allowedContentTypes: [kind.mimeType],
          maximumSizeInBytes: EVIDENCE_MAX_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + TOKEN_LIFETIME_MS,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadRejected) return deny(error.message, error.status);
    console.error("Evidence upload token request failed", error instanceof Error ? error.name : "unknown error");
    return deny("The upload could not be started. Please try again.", 500);
  }
}
