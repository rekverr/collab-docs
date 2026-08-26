import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { WorkspaceAccess, WorkspaceCapability } from "./permission.types";

interface PolicyMembership {
  role: WorkspaceRole;
  workspace: { id: string; ownerId: string; deletedAt: Date | null };
}

export interface PolicyDatabase {
  workspaceMember: {
    findUnique(args: {
      where: { workspaceId_userId: { workspaceId: string; userId: string } };
      select: { role: true; workspace: { select: { id: true; ownerId: true; deletedAt: true } } };
    }): Promise<PolicyMembership | null>;
  };
}

const roleCapabilities: Readonly<Record<WorkspaceRole, ReadonlySet<WorkspaceCapability>>> = {
  OWNER: new Set([
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
  ]),
  ADMIN: new Set([
    "workspace.read",
    "workspace.manage",
    "member.invite",
    "member.manage",
    "document.create",
    "document.read",
    "document.edit",
    "document.delete",
    "document.publish",
  ]),
  EDITOR: new Set(["workspace.read", "document.create", "document.read", "document.edit"]),
  VIEWER: new Set(["workspace.read", "document.read"]),
};

@Injectable()
export class PolicyService {
  constructor(@Inject(PrismaService) private readonly prisma: PolicyDatabase) {}

  hasCapability(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
    return roleCapabilities[role].has(capability);
  }

  assertCapability(role: WorkspaceRole, capability: WorkspaceCapability): void {
    if (!this.hasCapability(role, capability))
      throw new ForbiddenException("You do not have permission to perform this action");
  }

  assertCanAssignRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): void {
    this.assertCapability(actorRole, "member.manage");
    if (targetRole === WorkspaceRole.OWNER)
      throw new ForbiddenException(
        "Workspace ownership cannot be assigned through membership management",
      );
    if (actorRole !== WorkspaceRole.OWNER && targetRole === WorkspaceRole.ADMIN) {
      throw new ForbiddenException("Only the workspace owner can manage administrators");
    }
  }

  async requireWorkspaceCapability(
    userId: string,
    workspaceId: string,
    capability: WorkspaceCapability,
    database: PolicyDatabase = this.prisma,
  ): Promise<WorkspaceAccess> {
    const membership = await database.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        role: true,
        workspace: { select: { id: true, ownerId: true, deletedAt: true } },
      },
    });
    if (membership === null || membership.workspace.deletedAt !== null) {
      throw new NotFoundException("Workspace not found");
    }
    this.assertCapability(membership.role, capability);
    return { workspace: membership.workspace, role: membership.role };
  }
}
