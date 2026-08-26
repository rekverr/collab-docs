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

export type DocumentProjectionBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "list"; style: "bullet" | "numbered"; items: string[] }
  | { id: string; type: "task"; text: string; checked: boolean }
  | {
      id: string;
      type: "image";
      source: { kind: "attachment"; attachmentId: string } | { kind: "url"; url: string };
      alt: string;
    }
  | { id: string; type: "code"; language: string; text: string };

export interface DocumentProjection {
  version: 1;
  blocks: DocumentProjectionBlock[];
  plainText: string;
}

export interface DocumentVersionAuthor {
  id: string;
  email: string;
  displayName: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  title: string;
  sourceSequence: string;
  restoredFromVersionId: string | null;
  author: DocumentVersionAuthor | null;
  createdAt: string;
}

export interface DocumentVersionPreview extends DocumentVersion {
  contentProjection: DocumentProjection;
}

export interface RestoreDocumentVersionResult {
  version: DocumentVersion;
  collaborationReloadRequested: boolean;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  requestId: string | null;
}
