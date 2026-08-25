import type { WorkspaceRole } from "@prisma/client";

export const workspaceCapabilities = [
  "workspace.read",
  "workspace.manage",
  "member.invite",
  "member.manage",
  "billing.manage",
  "document.create",
  "document.read",
  "document.edit",
  "document.delete",
  "document.publish",
] as const;

export type WorkspaceCapability = (typeof workspaceCapabilities)[number];

export interface WorkspaceAccess {
  workspace: { id: string; ownerId: string; deletedAt: Date | null };
  role: WorkspaceRole;
}
