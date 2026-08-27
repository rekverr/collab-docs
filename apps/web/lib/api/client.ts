import { ApiError, isApiErrorBody } from "./errors";
import {
  parseAttachment,
  parseAttachmentDownload,
  parseAttachmentUpload,
  parseAuthResponse,
  parseChangePlanResult,
  parseCurrentUser,
  parseCommentThreads,
  parseDocument,
  parseDocumentShareLink,
  parseDocumentSharingState,
  parseDocumentComment,
  parseDocumentTree,
  parseDocumentVersion,
  parseDocumentVersionPreview,
  parseDocumentVersions,
  parseRestoreDocumentVersionResult,
  parseSearchDocumentsResponse,
  parseMentionCandidates,
  parseNotification,
  parseNotifications,
  parseWorkspace,
  parseWorkspaceSubscription,
  parseWorkspaces,
} from "./parsers";
import type {
  Attachment,
  AttachmentDownload,
  AttachmentUploadRequest,
  AuthResponse,
  BillingPlan,
  ChangePlanResult,
  CurrentUser,
  CommentAuthor,
  CommentThread,
  DocumentMetadata,
  DocumentAccessMode,
  DocumentShareLink,
  DocumentSharingState,
  DocumentComment,
  DocumentTreeNode,
  DocumentVersion,
  DocumentVersionPreview,
  RestoreDocumentVersionResult,
  SearchDocumentsResponse,
  UserNotification,
  WorkspaceSummary,
  WorkspaceSubscription,
} from "./types";

const apiBase = "/api/backend";

async function request<T>(
  path: string,
  parser: (value: unknown) => T,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    if (isApiErrorBody(value))
      throw new ApiError(response.status, value.code, value.message, value.details);
    throw new ApiError(response.status, "HTTP_ERROR", "The server returned an unexpected error");
  }
  if (response.status === 204) return parser(null);
  const body: unknown = await response.json();
  return parser(body);
}

function authorization(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}
function nothing(): void {
  return undefined;
}

export const authApi = {
  register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResponse> {
    return request("/auth/register", parseAuthResponse, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  login(input: { email: string; password: string }): Promise<AuthResponse> {
    return request("/auth/login", parseAuthResponse, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  refresh(): Promise<AuthResponse> {
    return request("/auth/refresh", parseAuthResponse, { method: "POST" });
  },
  me(token: string): Promise<CurrentUser> {
    return request("/auth/me", parseCurrentUser, { headers: authorization(token) });
  },
  logout(): Promise<void> {
    return request("/auth/logout", nothing, { method: "POST" });
  },
};

export const workspaceApi = {
  list(token: string): Promise<WorkspaceSummary[]> {
    return request("/workspaces", parseWorkspaces, { headers: authorization(token) });
  },
  get(token: string, workspaceId: string): Promise<WorkspaceSummary> {
    return request(`/workspaces/${encodeURIComponent(workspaceId)}`, parseWorkspace, {
      headers: authorization(token),
    });
  },
  create(token: string, input: { name: string; slug: string }): Promise<WorkspaceSummary> {
    return request("/workspaces", parseWorkspace, {
      method: "POST",
      headers: authorization(token),
      body: JSON.stringify(input),
    });
  },
};

export const billingApi = {
  current(token: string, workspaceId: string): Promise<WorkspaceSubscription> {
    return request(
      `/workspaces/${encodeURIComponent(workspaceId)}/billing/subscription`,
      parseWorkspaceSubscription,
      { headers: authorization(token) },
    );
  },
  checkout(token: string, workspaceId: string, plan: BillingPlan): Promise<ChangePlanResult> {
    return request(
      `/workspaces/${encodeURIComponent(workspaceId)}/billing/checkout`,
      parseChangePlanResult,
      {
        method: "POST",
        headers: authorization(token),
        body: JSON.stringify({ plan }),
      },
    );
  },
};

export const documentApi = {
  tree(token: string, workspaceId: string): Promise<DocumentTreeNode[]> {
    return request(
      `/workspaces/${encodeURIComponent(workspaceId)}/documents/tree`,
      parseDocumentTree,
      { headers: authorization(token) },
    );
  },
  create(
    token: string,
    workspaceId: string,
    input: { title: string; parentId?: string },
  ): Promise<DocumentMetadata> {
    return request(`/workspaces/${encodeURIComponent(workspaceId)}/documents`, parseDocument, {
      method: "POST",
      headers: authorization(token),
      body: JSON.stringify(input),
    });
  },
  rename(token: string, documentId: string, title: string): Promise<DocumentMetadata> {
    return request(`/documents/${encodeURIComponent(documentId)}`, parseDocument, {
      method: "PATCH",
      headers: authorization(token),
      body: JSON.stringify({ title }),
    });
  },
  move(
    token: string,
    documentId: string,
    input: { parentId: string | null; beforeDocumentId?: string },
  ): Promise<DocumentMetadata> {
    return request(`/documents/${encodeURIComponent(documentId)}/move`, parseDocument, {
      method: "POST",
      headers: authorization(token),
      body: JSON.stringify(input),
    });
  },
  archive(token: string, documentId: string): Promise<DocumentMetadata> {
    return request(`/documents/${encodeURIComponent(documentId)}/archive`, parseDocument, {
      method: "POST",
      headers: authorization(token),
    });
  },
  delete(token: string, documentId: string): Promise<DocumentMetadata> {
    return request(`/documents/${encodeURIComponent(documentId)}`, parseDocument, {
      method: "DELETE",
      headers: authorization(token),
    });
  },
};

export const searchApi = {
  documents(
    token: string,
    workspaceId: string,
    input: { query: string; page: number; limit?: number; signal?: AbortSignal },
  ): Promise<SearchDocumentsResponse> {
    const parameters = new URLSearchParams({
      query: input.query,
      page: String(input.page),
      limit: String(input.limit ?? 10),
    });
    return request(
      `/workspaces/${encodeURIComponent(workspaceId)}/search?${parameters.toString()}`,
      parseSearchDocumentsResponse,
      { headers: authorization(token), signal: input.signal },
    );
  },
};

export const versionApi = {
  list(token: string, documentId: string): Promise<DocumentVersion[]> {
    return request(`/documents/${encodeURIComponent(documentId)}/versions`, parseDocumentVersions, {
      headers: authorization(token),
    });
  },
  create(token: string, documentId: string, title?: string): Promise<DocumentVersion> {
    return request(`/documents/${encodeURIComponent(documentId)}/versions`, parseDocumentVersion, {
      method: "POST",
      headers: authorization(token),
      body: JSON.stringify(title === undefined ? {} : { title }),
    });
  },
  preview(token: string, documentId: string, versionId: string): Promise<DocumentVersionPreview> {
    return request(
      `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}`,
      parseDocumentVersionPreview,
      { headers: authorization(token) },
    );
  },
  restore(
    token: string,
    documentId: string,
    versionId: string,
  ): Promise<RestoreDocumentVersionResult> {
    return request(
      `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/restore`,
      parseRestoreDocumentVersionResult,
      { method: "POST", headers: authorization(token) },
    );
  },
};

export const commentApi = {
  list(token: string, documentId: string): Promise<CommentThread[]> {
    return request(`/documents/${encodeURIComponent(documentId)}/comments`, parseCommentThreads, {
      headers: authorization(token),
    });
  },
  mentionCandidates(token: string, documentId: string): Promise<CommentAuthor[]> {
    return request(
      `/documents/${encodeURIComponent(documentId)}/comment-mention-candidates`,
      parseMentionCandidates,
      { headers: authorization(token) },
    );
  },
  create(
    token: string,
    documentId: string,
    input: { body: string; blockId?: string },
  ): Promise<DocumentComment> {
    return request(`/documents/${encodeURIComponent(documentId)}/comments`, parseDocumentComment, {
      method: "POST",
      headers: authorization(token),
      body: JSON.stringify(input),
    });
  },
  reply(token: string, commentId: string, body: string): Promise<DocumentComment> {
    return request(`/comments/${encodeURIComponent(commentId)}/replies`, parseDocumentComment, {
      method: "POST",
      headers: authorization(token),
      body: JSON.stringify({ body }),
    });
  },
  edit(token: string, commentId: string, body: string): Promise<DocumentComment> {
    return request(`/comments/${encodeURIComponent(commentId)}`, parseDocumentComment, {
      method: "PATCH",
      headers: authorization(token),
      body: JSON.stringify({ body }),
    });
  },
  delete(token: string, commentId: string): Promise<void> {
    return request(`/comments/${encodeURIComponent(commentId)}`, nothing, {
      method: "DELETE",
      headers: authorization(token),
    });
  },
  setResolved(token: string, commentId: string, resolved: boolean): Promise<DocumentComment> {
    return request(`/comments/${encodeURIComponent(commentId)}/resolution`, parseDocumentComment, {
      method: "PATCH",
      headers: authorization(token),
      body: JSON.stringify({ resolved }),
    });
  },
};

export const notificationApi = {
  list(token: string): Promise<UserNotification[]> {
    return request("/notifications", parseNotifications, { headers: authorization(token) });
  },
  markRead(token: string, notificationId: string): Promise<UserNotification> {
    return request(`/notifications/${encodeURIComponent(notificationId)}/read`, parseNotification, {
      method: "PATCH",
      headers: authorization(token),
    });
  },
};

export const attachmentApi = {
  requestUpload(
    token: string,
    documentId: string,
    input: { fileName: string; mimeType: string; sizeBytes: number },
  ): Promise<AttachmentUploadRequest> {
    return request(
      `/documents/${encodeURIComponent(documentId)}/attachments/upload-requests`,
      parseAttachmentUpload,
      {
        method: "POST",
        headers: authorization(token),
        body: JSON.stringify(input),
      },
    );
  },
  finalize(token: string, attachmentId: string): Promise<Attachment> {
    return request(`/attachments/${encodeURIComponent(attachmentId)}/finalize`, parseAttachment, {
      method: "POST",
      headers: authorization(token),
    });
  },
  download(token: string, attachmentId: string): Promise<AttachmentDownload> {
    return request(
      `/attachments/${encodeURIComponent(attachmentId)}/download`,
      parseAttachmentDownload,
      { headers: authorization(token) },
    );
  },
  delete(token: string, attachmentId: string): Promise<void> {
    return request(`/attachments/${encodeURIComponent(attachmentId)}`, nothing, {
      method: "DELETE",
      headers: authorization(token),
    });
  },
};

export const sharingApi = {
  state(token: string, documentId: string): Promise<DocumentSharingState> {
    return request(
      `/documents/${encodeURIComponent(documentId)}/sharing`,
      parseDocumentSharingState,
      { headers: authorization(token) },
    );
  },
  setPublished(
    token: string,
    documentId: string,
    published: boolean,
  ): Promise<DocumentSharingState> {
    return request(
      `/documents/${encodeURIComponent(documentId)}/publication`,
      parseDocumentSharingState,
      {
        method: "POST",
        headers: authorization(token),
        body: JSON.stringify({ published }),
      },
    );
  },
  createLink(
    token: string,
    documentId: string,
    input: { accessMode: DocumentAccessMode; expiresAt?: string },
  ): Promise<DocumentShareLink> {
    return request(
      `/documents/${encodeURIComponent(documentId)}/share-links`,
      parseDocumentShareLink,
      {
        method: "POST",
        headers: authorization(token),
        body: JSON.stringify(input),
      },
    );
  },
  revokeLink(token: string, linkId: string): Promise<DocumentShareLink> {
    return request(`/document-share-links/${encodeURIComponent(linkId)}`, parseDocumentShareLink, {
      method: "DELETE",
      headers: authorization(token),
    });
  },
  regenerateLink(token: string, linkId: string): Promise<DocumentShareLink> {
    return request(
      `/document-share-links/${encodeURIComponent(linkId)}/regenerate`,
      parseDocumentShareLink,
      { method: "POST", headers: authorization(token) },
    );
  },
};
