import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { evidenceKindFor } from "@/lib/evidence-files";
import { findAccessibleEvidenceFile } from "@/lib/review/access";
import { readBlob } from "@/lib/review/blob";

/*
 * Serves an evidence file from the private Blob store.
 *
 * Every request re-checks the session and scope: the submission must be one
 * the viewer can access, and a client only ever gets SHARED evidence. Missing
 * and forbidden files both return 404. Withdrawn evidence stays readable as
 * part of the record. PDFs download; images display inline.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, { params }: RouteContext<"/api/media/evidence/[evidenceId]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE });

  const { evidenceId } = await params;
  const evidence = await findAccessibleEvidenceFile(user, evidenceId);
  const kind = evidence?.fileName ? evidenceKindFor(evidence.fileName) : null;
  if (!evidence?.fileUrl || !evidence.mimeType || !kind || kind.mimeType !== evidence.mimeType) {
    return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  }

  let result;
  try {
    result = await readBlob(evidence.fileUrl, { ifNoneMatch: request.headers.get("if-none-match") });
  } catch (error) {
    console.error("Evidence read failed", error instanceof Error ? error.name : "unknown error");
    return new NextResponse("File unavailable", { status: 502, headers: NO_STORE });
  }
  if (!result) return new NextResponse("Not found", { status: 404, headers: NO_STORE });

  // ASCII-only file name for the header; the stored name is display text.
  const safeName = (evidence.fileName ?? `evidence.${kind.extension}`).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const headers = new Headers({
    "Content-Type": evidence.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    "Content-Disposition": `${kind.inline ? "inline" : "attachment"}; filename="${safeName}"`,
    "Cache-Control": "private, no-cache",
  });
  const etag = result.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers });
  const length = result.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new NextResponse(result.stream, { status: 200, headers });
}
