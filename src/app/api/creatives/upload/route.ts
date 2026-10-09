import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { getUploadLimits, limitFor, mediaKindFor, UPLOAD_KEY_PATTERN, uploadPathFor } from "@/lib/media";
import { findAccessibleCreative, submissionFacts } from "@/lib/review/access";
import { DENIAL_MESSAGE, authorize } from "@/lib/workflow/policy";
import { uploadsConfigured } from "@/lib/review/blob";

/*
 * Issues short-lived client upload tokens for creative files (Vercel Blob
 * client uploads), so large videos go straight from the browser to the
 * private Blob store instead of through a function body (4.5 MB limit).
 *
 * A token is issued only to a user allowed to upload to that creative: TEAM for
 * legacy creatives (not archived); the owning CLIENT for their own submission
 * while it is a draft or awaiting changes (src/lib/workflow/policy.ts), for one exact storage path built on the server, with
 * the content type fixed by the file extension and the size capped by type.
 * The resulting file is not part of the review until finalizeVersion
 * (lib/review/actions.ts) verifies it and records it in the database.
 */

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

function deny(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return deny("Please sign in again.", 401);
  if (!uploadsConfigured()) {
    return deny("File uploads are not configured yet. Connect a private Vercel Blob store.", 503);
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return deny("Invalid upload request.", 400);
  }
  // Only token requests are accepted here. Uploads are recorded by
  // finalizeVersion, not by the upload-completed webhook.
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
        if (typeof creativeId !== "string" || typeof fileName !== "string") {
          throw new UploadRejected("Invalid upload request.");
        }
        if (typeof uploadKey !== "string" || !UPLOAD_KEY_PATTERN.test(uploadKey)) {
          throw new UploadRejected("Invalid upload request.");
        }

        const creative = await findAccessibleCreative(user, creativeId);
        if (!creative) throw new UploadRejected("This creative no longer exists.");
        if (creative.workflow === "LEGACY_CLIENT_APPROVAL") {
          if (user.role !== "TEAM") throw new UploadRejected("Only the team can upload files for this creative.", 403);
          if (creative.status === "ARCHIVED") throw new UploadRejected("Archived creatives can't get new versions.");
        } else {
          const allowed = authorize(user, "UPLOAD_VERSION", submissionFacts(creative));
          if (!allowed.ok) throw new UploadRejected(DENIAL_MESSAGE[allowed.reason], allowed.reason === "NOT_FOUND" ? 400 : 403);
        }

        const kind = mediaKindFor(fileName);
        if (!kind) throw new UploadRejected("Unsupported file type. Upload a JPEG, PNG, WebP, MP4 or WebM file.");

        // The browser must ask for exactly the path the server would build.
        if (pathname !== uploadPathFor(creative.id, uploadKey, kind.extension)) {
          throw new UploadRejected("Invalid upload request.");
        }

        return {
          allowedContentTypes: [kind.mimeType],
          maximumSizeInBytes: limitFor(kind.mediaType, getUploadLimits()),
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + TOKEN_LIFETIME_MS,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadRejected) return deny(error.message, error.status);
    // Never log tokens or request bodies; the error name is enough to debug.
    console.error("Upload token request failed", error instanceof Error ? error.name : "unknown error");
    return deny("The upload could not be started. Please try again.", 500);
  }
}

class UploadRejected extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
