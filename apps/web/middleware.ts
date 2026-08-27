import { NextResponse, type NextRequest } from "next/server";
import { refreshCookieName } from "./lib/auth/session-cookies";
import { privateRedirectTarget, routeAccess } from "./lib/routing/routes";

export function middleware(request: NextRequest): NextResponse {
  const access = routeAccess(request.nextUrl.pathname);
  const hasRefreshSession = request.cookies.has(refreshCookieName);
  if (access === "private" && !hasRefreshSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      privateRedirectTarget(request.nextUrl.pathname, request.nextUrl.search),
    );
    return NextResponse.redirect(loginUrl);
  }
  if (access === "auth" && hasRefreshSession) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/login", "/register"] };
