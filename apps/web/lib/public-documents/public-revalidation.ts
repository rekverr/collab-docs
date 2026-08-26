import { timingSafeEqual } from "node:crypto";

export const publicRevalidationHeader = "x-revalidation-secret";

export interface PublicRevalidationPayload {
  documentId: string;
  publicSlug: string;
}

export interface PublicRevalidationDependencies {
  secret: string | undefined;
  revalidatePath(path: string): void;
  revalidateTag(tag: string): void;
}

export function publicDocumentPath(slug: string): string {
  return `/p/${slug}`;
}

export function publicDocumentTag(slug: string): string {
  return `public-document:${slug}`;
}

export async function handlePublicRevalidationRequest(
  request: Request,
  dependencies: PublicRevalidationDependencies,
): Promise<Response> {
  if (dependencies.secret === undefined || dependencies.secret.length < 32) {
    return Response.json({ message: "Revalidation is unavailable" }, { status: 503 });
  }
  if (!secretsMatch(request.headers.get(publicRevalidationHeader), dependencies.secret)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 });
  }
  const payload = parsePayload(body);
  if (payload === null) {
    return Response.json({ message: "Invalid request body" }, { status: 400 });
  }

  dependencies.revalidateTag(publicDocumentTag(payload.publicSlug));
  dependencies.revalidatePath(publicDocumentPath(payload.publicSlug));
  return Response.json({ revalidated: true });
}

function parsePayload(value: unknown): PublicRevalidationPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const documentId: unknown = Reflect.get(value, "documentId");
  const publicSlug: unknown = Reflect.get(value, "publicSlug");
  if (
    typeof documentId !== "string" ||
    documentId.length < 1 ||
    documentId.length > 200 ||
    typeof publicSlug !== "string" ||
    !/^[a-z0-9-]{1,160}$/.test(publicSlug)
  ) {
    return null;
  }
  return { documentId, publicSlug };
}

function secretsMatch(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
  );
}
