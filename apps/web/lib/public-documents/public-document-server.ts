import { cache } from "react";
import { parsePublicDocument, type PublicDocument } from "./public-document";
import { publicDocumentTag } from "./public-revalidation";

export { publicDocumentTag } from "./public-revalidation";

export const publicDocumentRevalidateSeconds = 300;

export const getPublicDocument = cache(async (slug: string): Promise<PublicDocument | null> => {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  const apiUrl = (process.env.INTERNAL_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const path = `/public-documents/${encodeURIComponent(slug)}`;
  try {
    const accessResponse = await fetch(`${apiUrl}${path}?publication-check=1`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!accessResponse.ok) return null;
    const accessBody: unknown = await accessResponse.json();
    const current = parsePublicDocument(accessBody);
    if (current.publicSlug !== slug) return null;

    try {
      const projectionResponse = await fetch(`${apiUrl}${path}`, {
        headers: { accept: "application/json" },
        next: {
          revalidate: publicDocumentRevalidateSeconds,
          tags: [publicDocumentTag(slug)],
        },
      });
      if (!projectionResponse.ok) return current;
      const projectionBody: unknown = await projectionResponse.json();
      const cached = parsePublicDocument(projectionBody);
      return cached.publicSlug === slug && cached.documentId === current.documentId
        ? cached
        : current;
    } catch {
      return current;
    }
  } catch {
    return null;
  }
});
