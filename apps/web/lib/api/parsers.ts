import type { AuthResponse, CurrentUser, DocumentMetadata, DocumentPublicationState, DocumentTreeNode, WorkspaceRole, WorkspaceSummary } from "./types";

function record(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`Invalid ${label} response`);
  return value;
}

function field(value: object, key: string): unknown {
  const result: unknown = Reflect.get(value, key);
  return result;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`Invalid ${label} response`);
  return value;
}

export function parseCurrentUser(value: unknown): CurrentUser {
  const data = record(value, "user");
  const displayName = field(data, "displayName");
  if (displayName !== null && typeof displayName !== "string") throw new TypeError("Invalid user response");
  return { id: string(field(data, "id"), "user"), email: string(field(data, "email"), "user"), displayName };
}

export function parseAuthResponse(value: unknown): AuthResponse {
  const data = record(value, "authentication");
  return { accessToken: string(field(data, "accessToken"), "authentication"), user: parseCurrentUser(field(data, "user")) };
}

const roles: ReadonlySet<string> = new Set(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);

function isWorkspaceRole(value: string): value is WorkspaceRole { return roles.has(value); }

export function parseWorkspace(value: unknown): WorkspaceSummary {
  const data = record(value, "workspace");
  const role = string(field(data, "role"), "workspace");
  if (!isWorkspaceRole(role)) throw new TypeError("Invalid workspace response");
  return {
    id: string(field(data, "id"), "workspace"), name: string(field(data, "name"), "workspace"), slug: string(field(data, "slug"), "workspace"),
    ownerId: string(field(data, "ownerId"), "workspace"), role,
    createdAt: string(field(data, "createdAt"), "workspace"), updatedAt: string(field(data, "updatedAt"), "workspace"),
  };
}

export function parseWorkspaces(value: unknown): WorkspaceSummary[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid workspace list response");
  return value.map(parseWorkspace);
}

const publicationStates: ReadonlySet<string> = new Set(["PRIVATE", "PUBLISHED"]);

function isPublicationState(value: string): value is DocumentPublicationState { return publicationStates.has(value); }

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

export function parseDocument(value: unknown): DocumentMetadata {
  const data = record(value, "document");
  const publicationState = string(field(data, "publicationState"), "document");
  if (!isPublicationState(publicationState)) throw new TypeError("Invalid document response");
  return {
    id: string(field(data, "id"), "document"), workspaceId: string(field(data, "workspaceId"), "document"),
    parentId: nullableString(field(data, "parentId"), "document"), title: string(field(data, "title"), "document"),
    sortKey: string(field(data, "sortKey"), "document"), publicationState,
    archivedAt: nullableString(field(data, "archivedAt"), "document"), deletedAt: nullableString(field(data, "deletedAt"), "document"),
    createdAt: string(field(data, "createdAt"), "document"), updatedAt: string(field(data, "updatedAt"), "document"),
  };
}

export function parseDocumentTreeNode(value: unknown): DocumentTreeNode {
  const data = record(value, "document tree");
  const metadata = parseDocument(data);
  const children = field(data, "children");
  if (!Array.isArray(children)) throw new TypeError("Invalid document tree response");
  return { ...metadata, children: children.map(parseDocumentTreeNode) };
}

export function parseDocumentTree(value: unknown): DocumentTreeNode[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid document tree response");
  return value.map(parseDocumentTreeNode);
}
