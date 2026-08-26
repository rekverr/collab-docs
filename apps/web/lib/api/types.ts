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
export type DocumentAccessMode = "VIEW" | "EDIT";

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

export interface CommentAuthor {
  id: string;
  email: string;
  displayName: string | null;
}

export interface DocumentComment {
  id: string;
  documentId: string;
  parentId: string | null;
  blockId: string | null;
  body: string;
  deleted: boolean;
  resolvedAt: string | null;
  resolvedBy: CommentAuthor | null;
  author: CommentAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface CommentThread extends DocumentComment {
  replies: DocumentComment[];
}

export type NotificationType =
  "WORKSPACE_INVITATION" | "DOCUMENT_SHARED" | "COMMENT_REPLY" | "MENTION" | "COMMENT_RESOLVED";

export interface UserNotification {
  id: string;
  type: NotificationType;
  workspaceId: string | null;
  workspaceName: string | null;
  documentId: string | null;
  documentTitle: string | null;
  commentId: string | null;
  actor: CommentAuthor | null;
  readAt: string | null;
  createdAt: string;
}

export type AttachmentStatus = "PENDING" | "READY" | "DELETED";

export interface Attachment {
  id: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  createdAt: string;
}

export interface AttachmentUploadRequest {
  attachment: Attachment;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export interface AttachmentDownload {
  url: string;
  expiresAt: string;
}

export interface DocumentShareLink {
  id: string;
  accessMode: DocumentAccessMode;
  expiresAt: string | null;
  revokedAt: string | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSharingState {
  documentId: string;
  published: boolean;
  publicSlug: string | null;
  publicUrl: string | null;
  links: DocumentShareLink[];
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  requestId: string | null;
}
