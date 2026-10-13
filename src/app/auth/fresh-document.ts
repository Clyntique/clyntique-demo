import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/*
 * Redirects (303) as a full document load and asks the browser to clear its
 * HTTP cache for this site. Used when the signed-in account changes (sign in,
 * sign out), so pages loaded for the previous account can't be shown again
 * from the browser's cache or history.
 */
export function freshDocumentRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
  response.headers.set("Clear-Site-Data", '"cache"');
  response.headers.set("Cache-Control", "no-store");
  return response;
}
