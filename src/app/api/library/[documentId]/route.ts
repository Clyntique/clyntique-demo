import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { findAccessibleLibraryFile } from "@/lib/data/library";
import { libraryKindFor } from "@/lib/library-files";
import { readBlob } from "@/lib/review/blob";

/*
 * Serves a Content Library file from the private Blob store ("open the
 * original source"). Every request re-checks the session and the scope: a
 * client only gets their own workspace's documents, the team only Clyntique's
 * and the ones clients shared. Missing, deleted and forbidden all return 404.
 * Files download (never rendered inline), with the type verified at upload.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: RouteContext<"/api/library/[documentId]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });

  const { documentId } = await params;
  const doc = await findAccessibleLibraryFile(user, documentId);
  const kind = doc ? libraryKindFor(doc.fileName) : null;
  if (!doc?.fileUrl || !kind || kind.mimeType !== doc.mimeType) return new NextResponse("Not found", { status: 404, headers: NO_STORE });

  let result;
  try {
    result = await readBlob(doc.fileUrl, { range: null, ifNoneMatch: request.headers.get("if-none-match") });
  } catch (error) {
    console.error("Library read failed", error instanceof Error ? error.name : "unknown error");
    return new NextResponse("File unavailable", { status: 502, headers: NO_STORE });
  }
  if (!result) return new NextResponse("Not found", { status: 404, headers: NO_STORE });

  const safeName = doc.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || `document.${kind.extension}`;
  const headers = new Headers({
    "Content-Type": doc.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Cache-Control": "private, no-cache",
  });
  const etag = result.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers });
  const length = result.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new NextResponse(result.stream, { status: 200, headers });
}
