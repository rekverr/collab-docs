import { NextResponse, type NextRequest } from "next/server";

const authRoutes = new Set(["/login", "/register"]);

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hasRefreshSession = request.cookies.has("collab_docs_refresh");
  if (path.startsWith("/app") && !hasRefreshSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }
  if (authRoutes.has(path) && hasRefreshSession)
    return NextResponse.redirect(new URL("/app", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/login", "/register"] };
