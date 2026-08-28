export const accessCookieName = "collab_docs_access";
export const refreshCookieName = "collab_docs_refresh";

export function readAccessToken(body: string): string | null {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const accessToken: unknown = Reflect.get(value, "accessToken");
    return typeof accessToken === "string" && accessToken.length > 0 ? accessToken : null;
  } catch {
    return null;
  }
}

export function accessCookieHeader(value: string, secure: boolean, expired = false): string {
  return [
    `${accessCookieName}=${expired ? "" : encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    ...(expired ? ["Expires=Thu, 01 Jan 1970 00:00:00 GMT", "Max-Age=0"] : []),
  ].join("; ");
}

export function shouldUseSecureCookies(request: Request): boolean {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  if (forwardedProtocol !== undefined && forwardedProtocol.length > 0) {
    return forwardedProtocol.toLowerCase() === "https";
  }
  return new URL(request.url).protocol === "https:";
}
