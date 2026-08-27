export type CollaborationControlEvent =
  | { type: "document-access-changed"; documentId: string }
  | { type: "document-unavailable"; documentId: string }
  | { type: "document-restored"; documentId: string }
  | { type: "user-access-changed"; userId: string };

export function parseCollaborationControlEvent(message: string): CollaborationControlEvent | null {
  try {
    const value: unknown = JSON.parse(message);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const type: unknown = Reflect.get(value, "type");
    if (type === "user-access-changed") {
      const userId: unknown = Reflect.get(value, "userId");
      return typeof userId === "string" && isUuid(userId) ? { type, userId } : null;
    }
    const documentId: unknown = Reflect.get(value, "documentId");
    if (typeof documentId !== "string" || !isUuid(documentId)) return null;
    if (type === "restored" || type === "document-restored") {
      return { type: "document-restored", documentId };
    }
    if (type === "document-access-changed" || type === "document-unavailable") {
      return { type, documentId };
    }
    return null;
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
