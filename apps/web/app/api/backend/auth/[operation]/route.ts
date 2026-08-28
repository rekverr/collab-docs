import {
  accessCookieHeader,
  readAccessToken,
  shouldUseSecureCookies,
} from "../../../../../lib/auth/session-cookies";

const operations = new Set(["login", "logout", "me", "refresh", "register"]);

export async function GET(
  request: Request,
  context: Readonly<{ params: Promise<{ operation: string }> }>,
): Promise<Response> {
  return proxyAuthRequest(request, (await context.params).operation);
}

export async function POST(
  request: Request,
  context: Readonly<{ params: Promise<{ operation: string }> }>,
): Promise<Response> {
  return proxyAuthRequest(request, (await context.params).operation);
}

async function proxyAuthRequest(request: Request, operation: string): Promise<Response> {
  if (!operations.has(operation)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  const apiUrl = (process.env.INTERNAL_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const headers = forwardedHeaders(request.headers);
  const body = request.method === "GET" ? undefined : await request.arrayBuffer();

  try {
    const upstream = await fetch(`${apiUrl}/auth/${operation}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    const responseBody = upstream.status === 204 ? null : await upstream.text();
    const accessToken =
      upstream.ok && operation !== "logout" && responseBody !== null
        ? readAccessToken(responseBody)
        : null;
    const outgoingHeaders = responseHeaders(upstream.headers);
    if (accessToken !== null) {
      outgoingHeaders.append(
        "set-cookie",
        accessCookieHeader(accessToken, shouldUseSecureCookies(request)),
      );
    }
    const refreshCookie = upstream.headers.get("set-cookie");
    if (refreshCookie !== null) outgoingHeaders.append("set-cookie", refreshCookie);
    if (operation === "logout") {
      outgoingHeaders.append(
        "set-cookie",
        accessCookieHeader("", shouldUseSecureCookies(request), true),
      );
    }
    return new Response(responseBody, { status: upstream.status, headers: outgoingHeaders });
  } catch {
    return Response.json({ message: "Authentication service is unavailable" }, { status: 502 });
  }
}

function forwardedHeaders(source: Headers): Headers {
  const headers = new Headers({ accept: "application/json" });
  for (const name of ["authorization", "content-type", "cookie", "user-agent", "x-request-id"]) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}

function responseHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of ["content-type", "x-request-id"]) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}
