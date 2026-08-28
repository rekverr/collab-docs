import {
  accessCookieHeader,
  shouldUseSecureCookies,
} from "../../../../../lib/auth/session-cookies";

export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (authorization === null || accessToken === undefined) {
    return Response.json({ message: "Authentication is required" }, { status: 401 });
  }

  const apiUrl = (process.env.INTERNAL_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${apiUrl}/auth/me`, {
      method: "GET",
      headers: { accept: "application/json", authorization },
      cache: "no-store",
    });
    const body = await upstream.text();
    const headers = responseHeaders(upstream.headers);
    if (upstream.ok) {
      headers.append(
        "set-cookie",
        accessCookieHeader(accessToken, shouldUseSecureCookies(request)),
      );
    }
    return new Response(body, { status: upstream.status, headers });
  } catch {
    return Response.json({ message: "Authentication service is unavailable" }, { status: 502 });
  }
}

function responseHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of ["content-type", "x-request-id"]) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
}
