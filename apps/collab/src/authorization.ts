export interface CollaborationIdentity {
  documentId: string;
  userId: string;
  email: string;
  displayName: string | null;
  canWrite: boolean;
}

export type AuthorizationFailureKind = "authentication" | "permission" | "document" | "unavailable";

export class AuthorizationFailure extends Error {
  constructor(
    readonly kind: AuthorizationFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationFailure";
  }
}

export interface CollaborationAuthorizer {
  authorize(
    accessToken: string,
    documentId: string,
    shareToken?: string,
  ): Promise<CollaborationIdentity>;
}

function field(value: object, key: string): unknown {
  const result: unknown = Reflect.get(value, key);
  return result;
}
function stringField(value: object, key: string): string {
  const result = field(value, key);
  if (typeof result !== "string")
    throw new AuthorizationFailure("unavailable", "Invalid authorization response");
  return result;
}

export class ApiCollaborationAuthorizer implements CollaborationAuthorizer {
  constructor(private readonly internalApiUrl: string) {}

  async authorize(
    accessToken: string,
    documentId: string,
    shareToken?: string,
  ): Promise<CollaborationIdentity> {
    let response: Response;
    try {
      response = await fetch(
        `${this.internalApiUrl}/internal/collaboration/documents/${encodeURIComponent(documentId)}/access`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
            ...(shareToken === undefined ? {} : { "x-document-share-token": shareToken }),
          },
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new AuthorizationFailure("unavailable", "Authorization service unavailable");
    }
    if (response.status === 401)
      throw new AuthorizationFailure("authentication", "Authentication failed");
    if (response.status === 403)
      throw new AuthorizationFailure("permission", "Document access denied");
    if (response.status === 404)
      throw new AuthorizationFailure("document", "Document is unavailable");
    if (!response.ok)
      throw new AuthorizationFailure("unavailable", "Authorization service unavailable");
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body))
      throw new AuthorizationFailure("unavailable", "Invalid authorization response");
    const displayName = field(body, "displayName");
    const canWrite = field(body, "canWrite");
    if (
      (displayName !== null && typeof displayName !== "string") ||
      typeof canWrite !== "boolean"
    ) {
      throw new AuthorizationFailure("unavailable", "Invalid authorization response");
    }
    const identity = {
      documentId: stringField(body, "documentId"),
      userId: stringField(body, "userId"),
      email: stringField(body, "email"),
      displayName,
      canWrite,
    };
    if (identity.documentId !== documentId)
      throw new AuthorizationFailure("permission", "Document access denied");
    return identity;
  }
}
