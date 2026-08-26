import { ApiError, isApiErrorBody } from "./errors";
import {
  parseAuthResponse,
  parseCurrentUser,
  parseDocument,
  parseDocumentTree,
  parseWorkspace,
  parseWorkspaces,
} from "./parsers";
import type {
  AuthResponse,
  CurrentUser,
  DocumentMetadata,
  DocumentTreeNode,
  WorkspaceSummary,
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
