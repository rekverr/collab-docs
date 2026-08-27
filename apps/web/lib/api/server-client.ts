import { cookies } from "next/headers";
import { accessCookieName } from "../auth/session-cookies";
import { ApiError, isApiErrorBody } from "./errors";
import { parseDocumentTree, parseWorkspace, parseWorkspaceMembers } from "./parsers";
import type { DocumentTreeNode, WorkspaceMember, WorkspaceSummary } from "./types";

async function request<T>(path: string, parser: (value: unknown) => T, init: RequestInit = {}) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(accessCookieName)?.value;
  if (accessToken === undefined) {
    throw new ApiError(401, "SESSION_BOOTSTRAP_REQUIRED", "Restoring your session…");
  }
  const apiUrl = (process.env.INTERNAL_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body.code, body.message, body.details);
    }
    throw new ApiError(response.status, "HTTP_ERROR", "Workspace data is unavailable");
  }
  const body: unknown = await response.json();
  return parser(body);
}

export const serverWorkspaceApi = {
  get(workspaceId: string): Promise<WorkspaceSummary> {
    return request(`/workspaces/${encodeURIComponent(workspaceId)}`, parseWorkspace);
  },
  members(workspaceId: string): Promise<WorkspaceMember[]> {
    return request(`/workspaces/${encodeURIComponent(workspaceId)}/members`, parseWorkspaceMembers);
  },
  documents(workspaceId: string): Promise<DocumentTreeNode[]> {
    return request(
      `/workspaces/${encodeURIComponent(workspaceId)}/documents/tree`,
      parseDocumentTree,
    );
  },
  update(workspaceId: string, name: string): Promise<void> {
    return request(`/workspaces/${encodeURIComponent(workspaceId)}`, parseWorkspaceUpdate, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },
};

function parseWorkspaceUpdate(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Invalid workspace update response");
  }
  if (
    typeof Reflect.get(value, "id") !== "string" ||
    typeof Reflect.get(value, "name") !== "string"
  ) {
    throw new TypeError("Invalid workspace update response");
  }
}
