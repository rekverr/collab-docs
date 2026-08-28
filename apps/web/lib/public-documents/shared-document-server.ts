import { parseSharedPublicDocument, type SharedPublicDocument } from "./public-document";

export async function getSharedDocument(token: string): Promise<SharedPublicDocument | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const apiUrl = (process.env.INTERNAL_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  try {
    const response = await fetch(`${apiUrl}/shares/resolve`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return parseSharedPublicDocument(body);
  } catch {
    return null;
  }
}
