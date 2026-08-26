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

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  requestId: string | null;
}
