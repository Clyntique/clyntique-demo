import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { findAccessibleVersion } from "@/lib/review/access";
import { readBlob } from "@/lib/review/blob";

/*
 * Serves a creative version's file from the private Blob store.
 *
 * Every request re-checks the session and the creative's scope (a client never
 * gets a draft or another client's file). Missing and forbidden files both
 * return 404. Range requests are forwarded so videos can seek.
 */

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request, { params }: RouteContext<"/api/media/[versionId]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "private, no-store" } });

  const { versionId } = await params;
  const version = await findAccessibleVersion(user, versionId);
  if (!version || !version.mimeType) return notFound();

  let result;
  try {
    result = await readBlob(version.fileUrl, {
      range: request.headers.get("range"),
      ifNoneMatch: request.headers.get("if-none-match"),
    });
  } catch (error) {
    console.error("Media read failed", error instanceof Error ? error.name : "unknown error");
    return new NextResponse("File unavailable", { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!result) return notFound();

  const headers = new Headers({
    // The stored type was verified at upload time; never echo anything else.
    "Content-Type": version.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self'; sandbox",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-cache",
    "Accept-Ranges": "bytes",
  });
  const etag = result.headers.get("etag");
  if (etag) headers.set("ETag", etag);

  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers });

  const contentRange = result.headers.get("content-range");
  const contentLength = result.headers.get("content-length");
  if (contentRange) headers.set("Content-Range", contentRange);
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(result.stream, { status: contentRange ? 206 : 200, headers });
}
