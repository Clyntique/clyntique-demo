import { NextResponse, type NextRequest } from "next/server";
import { deleteSession } from "@/lib/auth/session";
import { freshDocumentRedirect } from "../fresh-document";

/*
 * Sign out. A plain form POST (not a server action), so the browser loads the
 * sign-in page as a new document and nothing of the previous user's
 * interface stays in the tab. The response also asks the browser to drop its
 * HTTP cache for this site, so Back can't show protected pages from it.
 * Same-origin only: a cross-site form can't sign someone out.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await deleteSession();
  return freshDocumentRedirect(request, "/auth/login");
}
