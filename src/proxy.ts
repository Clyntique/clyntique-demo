import { NextResponse, type NextRequest } from "next/server";
import { demoLoginEnabled } from "@/lib/auth/demo-config";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth/session-token";

// Optimistic redirects based on the signed session cookie only.
// The authoritative check is the DAL (src/lib/auth/dal.ts) in every page.

// Public auth pages: signed-in users are sent to their own home instead.
const AUTH_PAGES = ["/auth/login", "/auth/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let session = await decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  // A demo session is void once demo login is switched off: drop the cookie
  // so the user lands on sign-in instead of bouncing between pages.
  const staleDemo = Boolean(session?.demo && !demoLoginEnabled());
  if (staleDemo) session = null;

  const respond = (response: NextResponse) => {
    if (staleDemo) response.cookies.delete(SESSION_COOKIE);
    return response;
  };

  if (AUTH_PAGES.some((page) => pathname.startsWith(page))) {
    if (session) {
      const home = session.role === "TEAM" ? "/admin" : "/dashboard";
      return respond(NextResponse.redirect(new URL(home, request.nextUrl)));
    }
    return respond(NextResponse.next());
  }

  if (!session) {
    return respond(NextResponse.redirect(new URL("/auth/login", request.nextUrl)));
  }

  // Each role has its own area: TEAM under /admin, CLIENT under /dashboard.
  if (pathname.startsWith("/admin") && session.role !== "TEAM") {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }
  if (pathname.startsWith("/dashboard") && session.role !== "CLIENT") {
    return NextResponse.redirect(new URL("/admin", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/auth/login", "/auth/signup"],
};
