export type RouteAccess = "auth" | "private" | "public";

const authRoutes = new Set(["/login", "/register"]);

export function routeAccess(pathname: string): RouteAccess {
  if (authRoutes.has(pathname)) return "auth";
  if (pathname === "/app" || pathname.startsWith("/app/")) return "private";
  return "public";
}

export function privateRedirectTarget(pathname: string, search: string): string {
  const target = `${pathname}${search}`;
  return target.startsWith("/app") ? target : "/app";
}
