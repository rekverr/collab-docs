export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
}

export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export interface AuthResponse {
  accessToken: string;
  user: CurrentUser;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export type DocumentPublicationState = "PRIVATE" | "PUBLISHED";

export interface DocumentMetadata {
  id: string;
  workspaceId: string;
  parentId: string | null;
  title: string;
  sortKey: string;
  publicationState: DocumentPublicationState;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTreeNode extends DocumentMetadata {
  children: DocumentTreeNode[];
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  requestId: string | null;
}
