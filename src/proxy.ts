import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth/session-token";

// Optimistic redirects based on the signed session cookie only.
// The authoritative check is the DAL (src/lib/auth/dal.ts) in every page.

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/auth/login")) {
    if (session) {
      const home = session.role === "TEAM" ? "/admin" : "/dashboard";
      return NextResponse.redirect(new URL(home, request.nextUrl));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login", request.nextUrl));
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
  matcher: ["/dashboard/:path*", "/admin/:path*", "/auth/login"],
};
