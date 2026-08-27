import type {
  Attachment,
  AttachmentDownload,
  AttachmentStatus,
  AttachmentUploadRequest,
  AuthResponse,
  BillingPlan,
  ChangePlanResult,
  CommentAuthor,
  CommentThread,
  CurrentUser,
  DocumentMetadata,
  DocumentAccessMode,
  DocumentProjection,
  DocumentProjectionBlock,
  DocumentPublicationState,
  DocumentTreeNode,
  DocumentShareLink,
  DocumentSharingState,
  DocumentVersion,
  DocumentVersionPreview,
  DocumentComment,
  NotificationType,
  RestoreDocumentVersionResult,
  SearchDocumentResult,
  SearchDocumentsResponse,
  SubscriptionStatus,
  UserNotification,
  WorkspaceRole,
  WorkspaceMember,
  WorkspaceSubscription,
  WorkspaceSummary,
} from "./types";

function record(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`Invalid ${label} response`);
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
  if (displayName !== null && typeof displayName !== "string")
    throw new TypeError("Invalid user response");
  return {
    id: string(field(data, "id"), "user"),
    email: string(field(data, "email"), "user"),
    displayName,
  };
}

export function parseAuthResponse(value: unknown): AuthResponse {
  const data = record(value, "authentication");
  return {
    accessToken: string(field(data, "accessToken"), "authentication"),
    user: parseCurrentUser(field(data, "user")),
  };
}

const roles: ReadonlySet<string> = new Set(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);

function isWorkspaceRole(value: string): value is WorkspaceRole {
  return roles.has(value);
}

export function parseWorkspace(value: unknown): WorkspaceSummary {
  const data = record(value, "workspace");
  const role = string(field(data, "role"), "workspace");
  if (!isWorkspaceRole(role)) throw new TypeError("Invalid workspace response");
  return {
    id: string(field(data, "id"), "workspace"),
    name: string(field(data, "name"), "workspace"),
    slug: string(field(data, "slug"), "workspace"),
    ownerId: string(field(data, "ownerId"), "workspace"),
    role,
    createdAt: string(field(data, "createdAt"), "workspace"),
    updatedAt: string(field(data, "updatedAt"), "workspace"),
  };
}

export function parseWorkspaces(value: unknown): WorkspaceSummary[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid workspace list response");
  return value.map(parseWorkspace);
}

const billingPlans: ReadonlySet<string> = new Set(["FREE", "PRO", "TEAM"]);
const subscriptionStatuses: ReadonlySet<string> = new Set(["ACTIVE", "PAST_DUE", "CANCELED"]);

function isBillingPlan(value: string): value is BillingPlan {
  return billingPlans.has(value);
}

function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return subscriptionStatuses.has(value);
}

function byteString(value: unknown): string {
  const result = string(value, "storage usage");
  if (!/^\d+$/.test(result)) throw new TypeError("Invalid storage usage response");
  return result;
}

function parseResourceUsage(value: unknown, label: string) {
  const data = record(value, label);
  const used = number(field(data, "used"), label);
  const limit = number(field(data, "limit"), label);
  if (!Number.isInteger(used) || !Number.isInteger(limit) || used < 0 || limit < 0) {
    throw new TypeError(`Invalid ${label} response`);
  }
  return { used, limit };
}

export function parseWorkspaceSubscription(value: unknown): WorkspaceSubscription {
  const data = record(value, "subscription");
  const plan = string(field(data, "plan"), "subscription");
  const status = string(field(data, "status"), "subscription");
  if (!isBillingPlan(plan) || !isSubscriptionStatus(status)) {
    throw new TypeError("Invalid subscription response");
  }
  return {
    id: string(field(data, "id"), "subscription"),
    workspaceId: string(field(data, "workspaceId"), "subscription"),
    plan,
    status,
    members: parseResourceUsage(field(data, "members"), "member usage"),
    documents: parseResourceUsage(field(data, "documents"), "document usage"),
    storage: {
      usedBytes: byteString(field(record(field(data, "storage"), "storage usage"), "usedBytes")),
      limitBytes: byteString(field(record(field(data, "storage"), "storage usage"), "limitBytes")),
    },
    currentPeriodStart: nullableString(field(data, "currentPeriodStart"), "subscription"),
    currentPeriodEnd: nullableString(field(data, "currentPeriodEnd"), "subscription"),
    updatedAt: string(field(data, "updatedAt"), "subscription"),
  };
}

export function parseChangePlanResult(value: unknown): ChangePlanResult {
  const data = record(value, "plan change");
  const applied = field(data, "applied");
  if (typeof applied !== "boolean") throw new TypeError("Invalid plan change response");
  return {
    checkoutId: string(field(data, "checkoutId"), "plan change"),
    eventId: string(field(data, "eventId"), "plan change"),
    applied,
    subscription: parseWorkspaceSubscription(field(data, "subscription")),
  };
}

export function parseWorkspaceMember(value: unknown): WorkspaceMember {
  const data = record(value, "workspace member");
  const role = string(field(data, "role"), "workspace member");
  if (!isWorkspaceRole(role)) throw new TypeError("Invalid workspace member response");
  return {
    id: string(field(data, "id"), "workspace member"),
    role,
    user: parseCurrentUser(field(data, "user")),
    createdAt: string(field(data, "createdAt"), "workspace member"),
    updatedAt: string(field(data, "updatedAt"), "workspace member"),
  };
}

export function parseWorkspaceMembers(value: unknown): WorkspaceMember[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid workspace member list response");
  return value.map(parseWorkspaceMember);
}

const publicationStates: ReadonlySet<string> = new Set(["PRIVATE", "PUBLISHED"]);

function isPublicationState(value: string): value is DocumentPublicationState {
  return publicationStates.has(value);
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`Invalid ${label} response`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Invalid ${label} response`);
  }
  return value;
}

export function parseDocument(value: unknown): DocumentMetadata {
  const data = record(value, "document");
  const publicationState = string(field(data, "publicationState"), "document");
  if (!isPublicationState(publicationState)) throw new TypeError("Invalid document response");
  return {
    id: string(field(data, "id"), "document"),
    workspaceId: string(field(data, "workspaceId"), "document"),
    parentId: nullableString(field(data, "parentId"), "document"),
    title: string(field(data, "title"), "document"),
    sortKey: string(field(data, "sortKey"), "document"),
    publicationState,
    archivedAt: nullableString(field(data, "archivedAt"), "document"),
    deletedAt: nullableString(field(data, "deletedAt"), "document"),
    createdAt: string(field(data, "createdAt"), "document"),
    updatedAt: string(field(data, "updatedAt"), "document"),
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

export function parseSearchDocumentResult(value: unknown): SearchDocumentResult {
  const data = record(value, "search result");
  return {
    documentId: string(field(data, "documentId"), "search result"),
    workspaceId: string(field(data, "workspaceId"), "search result"),
    parentId: nullableString(field(data, "parentId"), "search result"),
    title: string(field(data, "title"), "search result"),
    snippet: nullableString(field(data, "snippet"), "search result"),
    rank: number(field(data, "rank"), "search result"),
    updatedAt: string(field(data, "updatedAt"), "search result"),
  };
}

export function parseSearchDocumentsResponse(value: unknown): SearchDocumentsResponse {
  const data = record(value, "search response");
  const items = field(data, "items");
  const page = number(field(data, "page"), "search response");
  const limit = number(field(data, "limit"), "search response");
  const hasMore = field(data, "hasMore");
  if (!Array.isArray(items) || !Number.isInteger(page) || !Number.isInteger(limit)) {
    throw new TypeError("Invalid search response");
  }
  if (typeof hasMore !== "boolean") throw new TypeError("Invalid search response");
  return { items: items.map(parseSearchDocumentResult), page, limit, hasMore };
}

export function parseDocumentVersion(value: unknown): DocumentVersion {
  const data = record(value, "document version");
  const authorValue = field(data, "author");
  const author =
    authorValue === null
      ? null
      : (() => {
          const authorData = record(authorValue, "document version author");
          return {
            id: string(field(authorData, "id"), "document version author"),
            email: string(field(authorData, "email"), "document version author"),
            displayName: nullableString(
              field(authorData, "displayName"),
              "document version author",
            ),
          };
        })();
  return {
    id: string(field(data, "id"), "document version"),
    documentId: string(field(data, "documentId"), "document version"),
    title: string(field(data, "title"), "document version"),
    sourceSequence: string(field(data, "sourceSequence"), "document version"),
    restoredFromVersionId: nullableString(field(data, "restoredFromVersionId"), "document version"),
    author,
    createdAt: string(field(data, "createdAt"), "document version"),
  };
}

export function parseDocumentVersions(value: unknown): DocumentVersion[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid document version list response");
  return value.map(parseDocumentVersion);
}

export function parseDocumentVersionPreview(value: unknown): DocumentVersionPreview {
  const data = record(value, "document version preview");
  return {
    ...parseDocumentVersion(data),
    contentProjection: parseDocumentProjection(field(data, "contentProjection")),
  };
}

export function parseRestoreDocumentVersionResult(value: unknown): RestoreDocumentVersionResult {
  const data = record(value, "document version restore");
  const reloadRequested = field(data, "collaborationReloadRequested");
  if (typeof reloadRequested !== "boolean") {
    throw new TypeError("Invalid document version restore response");
  }
  return {
    version: parseDocumentVersion(field(data, "version")),
    collaborationReloadRequested: reloadRequested,
  };
}

function parseDocumentProjection(value: unknown): DocumentProjection {
  const data = record(value, "document projection");
  const version = field(data, "version");
  const blocks = field(data, "blocks");
  if (version !== 1 || !Array.isArray(blocks)) {
    throw new TypeError("Invalid document projection response");
  }
  return {
    version,
    blocks: blocks.map(parseProjectionBlock),
    plainText: string(field(data, "plainText"), "document projection"),
  };
}

function parseProjectionBlock(value: unknown): DocumentProjectionBlock {
  const data = record(value, "document projection block");
  const id = string(field(data, "id"), "document projection block");
  const type = string(field(data, "type"), "document projection block");
  if (type === "paragraph") {
    return { id, type, text: string(field(data, "text"), "paragraph block") };
  }
  if (type === "heading") {
    const level = field(data, "level");
    if (level !== 1 && level !== 2 && level !== 3) throw new TypeError("Invalid heading block");
    return { id, type, level, text: string(field(data, "text"), "heading block") };
  }
  if (type === "list") {
    const style = field(data, "style");
    const items = field(data, "items");
    if ((style !== "bullet" && style !== "numbered") || !Array.isArray(items)) {
      throw new TypeError("Invalid list block");
    }
    return { id, type, style, items: items.map((item) => string(item, "list item")) };
  }
  if (type === "task") {
    const checked = field(data, "checked");
    if (typeof checked !== "boolean") throw new TypeError("Invalid task block");
    return { id, type, checked, text: string(field(data, "text"), "task block") };
  }
  if (type === "code") {
    return {
      id,
      type,
      language: string(field(data, "language"), "code block"),
      text: string(field(data, "text"), "code block"),
    };
  }
  if (type === "image") {
    const sourceData = record(field(data, "source"), "image source");
    const kind = string(field(sourceData, "kind"), "image source");
    const source: Extract<DocumentProjectionBlock, { type: "image" }>["source"] | null =
      kind === "url"
        ? { kind: "url", url: string(field(sourceData, "url"), "image source") }
        : kind === "attachment"
          ? {
              kind: "attachment",
              attachmentId: string(field(sourceData, "attachmentId"), "image source"),
            }
          : null;
    if (source === null) throw new TypeError("Invalid image source");
    return { id, type, source, alt: string(field(data, "alt"), "image block") };
  }
  throw new TypeError("Unsupported document projection block");
}

export function parseCommentAuthor(value: unknown): CommentAuthor {
  const data = record(value, "comment author");
  return {
    id: string(field(data, "id"), "comment author"),
    email: string(field(data, "email"), "comment author"),
    displayName: nullableString(field(data, "displayName"), "comment author"),
  };
}

export function parseDocumentComment(value: unknown): DocumentComment {
  const data = record(value, "comment");
  const resolvedBy = field(data, "resolvedBy");
  return {
    id: string(field(data, "id"), "comment"),
    documentId: string(field(data, "documentId"), "comment"),
    parentId: nullableString(field(data, "parentId"), "comment"),
    blockId: nullableString(field(data, "blockId"), "comment"),
    body: string(field(data, "body"), "comment"),
    deleted: boolean(field(data, "deleted"), "comment"),
    resolvedAt: nullableString(field(data, "resolvedAt"), "comment"),
    resolvedBy: resolvedBy === null ? null : parseCommentAuthor(resolvedBy),
    author: parseCommentAuthor(field(data, "author")),
    createdAt: string(field(data, "createdAt"), "comment"),
    updatedAt: string(field(data, "updatedAt"), "comment"),
  };
}

export function parseCommentThreads(value: unknown): CommentThread[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid comment thread list response");
  return value.map((entry) => {
    const data = record(entry, "comment thread");
    const replies = field(data, "replies");
    if (!Array.isArray(replies)) throw new TypeError("Invalid comment replies response");
    return { ...parseDocumentComment(data), replies: replies.map(parseDocumentComment) };
  });
}

export function parseMentionCandidates(value: unknown): CommentAuthor[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid mention candidate list response");
  return value.map(parseCommentAuthor);
}

const notificationTypes: ReadonlySet<string> = new Set([
  "WORKSPACE_INVITATION",
  "DOCUMENT_SHARED",
  "COMMENT_REPLY",
  "MENTION",
  "COMMENT_RESOLVED",
]);

function isNotificationType(value: string): value is NotificationType {
  return notificationTypes.has(value);
}

export function parseNotification(value: unknown): UserNotification {
  const data = record(value, "notification");
  const type = string(field(data, "type"), "notification");
  if (!isNotificationType(type)) throw new TypeError("Invalid notification type");
  const actor = field(data, "actor");
  return {
    id: string(field(data, "id"), "notification"),
    type,
    workspaceId: nullableString(field(data, "workspaceId"), "notification"),
    workspaceName: nullableString(field(data, "workspaceName"), "notification"),
    documentId: nullableString(field(data, "documentId"), "notification"),
    documentTitle: nullableString(field(data, "documentTitle"), "notification"),
    commentId: nullableString(field(data, "commentId"), "notification"),
    actor: actor === null ? null : parseCommentAuthor(actor),
    readAt: nullableString(field(data, "readAt"), "notification"),
    createdAt: string(field(data, "createdAt"), "notification"),
  };
}

export function parseNotifications(value: unknown): UserNotification[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid notification list response");
  return value.map(parseNotification);
}

const attachmentStatuses: ReadonlySet<string> = new Set(["PENDING", "READY", "DELETED"]);

function isAttachmentStatus(value: string): value is AttachmentStatus {
  return attachmentStatuses.has(value);
}

export function parseAttachment(value: unknown): Attachment {
  const data = record(value, "attachment");
  const status = string(field(data, "status"), "attachment");
  if (!isAttachmentStatus(status)) throw new TypeError("Invalid attachment status");
  return {
    id: string(field(data, "id"), "attachment"),
    documentId: string(field(data, "documentId"), "attachment"),
    fileName: string(field(data, "fileName"), "attachment"),
    mimeType: string(field(data, "mimeType"), "attachment"),
    sizeBytes: number(field(data, "sizeBytes"), "attachment"),
    status,
    createdAt: string(field(data, "createdAt"), "attachment"),
  };
}

export function parseAttachmentUpload(value: unknown): AttachmentUploadRequest {
  const data = record(value, "attachment upload");
  const headersData = record(field(data, "requiredHeaders"), "attachment upload headers");
  const requiredHeaders = Object.fromEntries(
    Object.entries(headersData).map(([key, headerValue]) => [
      key,
      string(headerValue, "attachment upload header"),
    ]),
  );
  return {
    attachment: parseAttachment(field(data, "attachment")),
    uploadUrl: string(field(data, "uploadUrl"), "attachment upload"),
    expiresAt: string(field(data, "expiresAt"), "attachment upload"),
    requiredHeaders,
  };
}

export function parseAttachmentDownload(value: unknown): AttachmentDownload {
  const data = record(value, "attachment download");
  return {
    url: string(field(data, "url"), "attachment download"),
    expiresAt: string(field(data, "expiresAt"), "attachment download"),
  };
}

function parseDocumentAccessMode(value: unknown): DocumentAccessMode {
  if (value !== "VIEW" && value !== "EDIT") throw new TypeError("Invalid share access mode");
  return value;
}

export function parseDocumentShareLink(value: unknown): DocumentShareLink {
  const data = record(value, "document share link");
  return {
    id: string(field(data, "id"), "document share link"),
    accessMode: parseDocumentAccessMode(field(data, "accessMode")),
    expiresAt: nullableString(field(data, "expiresAt"), "document share link"),
    revokedAt: nullableString(field(data, "revokedAt"), "document share link"),
    url: nullableString(field(data, "url"), "document share link"),
    createdAt: string(field(data, "createdAt"), "document share link"),
    updatedAt: string(field(data, "updatedAt"), "document share link"),
  };
}

export function parseDocumentSharingState(value: unknown): DocumentSharingState {
  const data = record(value, "document sharing state");
  const links = field(data, "links");
  if (!Array.isArray(links)) throw new TypeError("Invalid document share links");
  return {
    documentId: string(field(data, "documentId"), "document sharing state"),
    published: boolean(field(data, "published"), "document sharing state"),
    publicSlug: nullableString(field(data, "publicSlug"), "document sharing state"),
    publicUrl: nullableString(field(data, "publicUrl"), "document sharing state"),
    links: links.map(parseDocumentShareLink),
  };
}
