import { randomBytes, createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InvitationStatus, Plan, Prisma, SubscriptionStatus, WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "../permissions/policy.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { planCatalog } from "../billing/plan-catalog";
import { UsageQuotaService } from "../billing/usage-quota.service";
import { CollaborationControlService } from "../permissions/collaboration-control.service";
import type {
  CreateWorkspaceDto,
  InviteWorkspaceMemberDto,
  UpdateWorkspaceDto,
} from "./dto/workspace.dto";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly quota: UsageQuotaService,
    private readonly collaborationControl: CollaborationControlService,
  ) {}

  create(userId: string, input: CreateWorkspaceDto) {
    const limits = planCatalog[Plan.FREE];
    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({
        data: { name: input.name.trim(), slug: input.slug, ownerId: userId },
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await transaction.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: WorkspaceRole.OWNER, addedById: userId },
      });
      await transaction.subscription.create({
        data: {
          workspaceId: workspace.id,
          plan: Plan.FREE,
          status: SubscriptionStatus.ACTIVE,
          memberLimit: limits.members,
          documentLimit: limits.documents,
          storageLimitBytes: limits.storageBytes,
        },
      });
      return { ...workspace, role: WorkspaceRole.OWNER };
    });
  }

  async list(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId, workspace: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    return memberships.map(({ role, workspace }) => ({ ...workspace, role }));
  }

  async get(userId: string, workspaceId: string) {
    const access = await this.policy.requireWorkspaceCapability(
      userId,
      workspaceId,
      "workspace.read",
    );
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true, ownerId: true, createdAt: true, updatedAt: true },
    });
    if (workspace === null) throw new NotFoundException("Workspace not found");
    return { ...workspace, role: access.role };
  }

  update(userId: string, workspaceId: string, input: UpdateWorkspaceDto) {
    return this.prisma.$transaction(async (transaction) => {
      await this.policy.requireWorkspaceCapability(
        userId,
        workspaceId,
        "workspace.manage",
        transaction,
      );
      return transaction.workspace.update({
        where: { id: workspaceId },
        data: { ...(input.name === undefined ? {} : { name: input.name.trim() }) },
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }

  async listMembers(userId: string, workspaceId: string) {
    await this.policy.requireWorkspaceCapability(userId, workspaceId, "workspace.read");
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  invite(userId: string, workspaceId: string, input: InviteWorkspaceMemberDto) {
    const email = input.email.trim().toLowerCase();
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + invitationLifetimeMs);
    return this.prisma.$transaction(async (transaction) => {
      const access = await this.policy.requireWorkspaceCapability(
        userId,
        workspaceId,
        "member.invite",
        transaction,
      );
      this.policy.assertCanAssignRole(access.role, input.role);
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${email}`}, 0))`;
      const existingUser = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser !== null) {
        const membership = await transaction.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
        });
        if (membership !== null) throw new ConflictException("User is already a workspace member");
      }
      const pending = await transaction.workspaceInvitation.findFirst({
        where: {
          workspaceId,
          email,
          status: InvitationStatus.PENDING,
        },
        select: { id: true },
      });
      if (pending !== null)
        throw new ConflictException("A pending invitation already exists for this email");
      await this.quota.assertInvitationCapacity(transaction, workspaceId);
      const invitation = await transaction.workspaceInvitation.create({
        data: { workspaceId, email, role: input.role, tokenHash, expiresAt, invitedById: userId },
        select: {
          id: true,
          workspaceId: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      return { ...invitation, token: rawToken };
    });
  }

  accept(user: AuthenticatedUser, rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    return this.acceptInvitation(user, { tokenHash });
  }

  acceptById(user: AuthenticatedUser, invitationId: string) {
    return this.acceptInvitation(user, { id: invitationId });
  }

  async listPendingForUser(user: AuthenticatedUser) {
    return this.prisma.workspaceInvitation.findMany({
      where: {
        email: user.email.trim().toLowerCase(),
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
        workspace: { deletedAt: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        workspace: { select: { name: true } },
        invitedBy: { select: { email: true, displayName: true } },
      },
    });
  }

  async listPendingForWorkspace(userId: string, workspaceId: string) {
    await this.policy.requireWorkspaceCapability(userId, workspaceId, "member.invite");
    return this.prisma.workspaceInvitation.findMany({
      where: { workspaceId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  decline(user: AuthenticatedUser, invitationId: string): Promise<void> {
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.workspaceInvitation.findUnique({
        where: { id: invitationId },
      });
      if (invitation === null) throw new NotFoundException("Invitation not found");
      if (invitation.status !== InvitationStatus.PENDING)
        throw new ConflictException("Invitation has already been used");
      if (invitation.expiresAt <= now)
        throw new UnprocessableEntityException("Invitation has expired");
      if (invitation.email !== user.email.trim().toLowerCase())
        throw new ForbiddenException("Invitation belongs to another account");
      const declined = await transaction.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING, expiresAt: { gt: now } },
        data: { status: InvitationStatus.REVOKED, revokedAt: now },
      });
      if (declined.count !== 1) throw new ConflictException("Invitation has already been used");
    });
  }

  private acceptInvitation(
    user: AuthenticatedUser,
    where: Prisma.WorkspaceInvitationWhereUniqueInput,
  ) {
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.workspaceInvitation.findUnique({ where });
      if (invitation === null) throw new NotFoundException("Invitation not found");
      if (invitation.status !== InvitationStatus.PENDING)
        throw new ConflictException("Invitation has already been used");
      if (invitation.expiresAt <= now)
        throw new UnprocessableEntityException("Invitation has expired");
      if (invitation.email !== user.email.trim().toLowerCase())
        throw new ForbiddenException("Invitation belongs to another account");
      const existing = await transaction.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
      });
      if (existing !== null) throw new ConflictException("User is already a workspace member");
      await this.quota.assertMemberCapacity(transaction, invitation.workspaceId);
      const claimed = await transaction.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING, expiresAt: { gt: now } },
        data: { status: InvitationStatus.ACCEPTED, acceptedById: user.id, acceptedAt: now },
      });
      if (claimed.count !== 1) throw new ConflictException("Invitation has already been used");
      const membership = await transaction.workspaceMember.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: invitation.role,
          addedById: invitation.invitedById,
        },
        select: { id: true, workspaceId: true, userId: true, role: true, createdAt: true },
      });
      return membership;
    });
  }

  async updateMemberRole(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    role: WorkspaceRole,
  ) {
    const membership = await this.prisma.$transaction(async (transaction) => {
      const access = await this.policy.requireWorkspaceCapability(
        actorId,
        workspaceId,
        "member.manage",
        transaction,
      );
      this.policy.assertCanAssignRole(access.role, role);
      const target = await transaction.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
      if (target === null) throw new NotFoundException("Workspace member not found");
      if (target.role === WorkspaceRole.OWNER || target.userId === access.workspace.ownerId)
        throw new ForbiddenException("The workspace owner role cannot be changed");
      if (access.role !== WorkspaceRole.OWNER && target.role === WorkspaceRole.ADMIN)
        throw new ForbiddenException("Only the workspace owner can manage administrators");
      return transaction.workspaceMember.update({
        where: { id: target.id },
        data: { role },
        select: { id: true, workspaceId: true, userId: true, role: true, updatedAt: true },
      });
    });
    await this.collaborationControl.userAccessChanged(targetUserId);
    return membership;
  }

  async removeMember(actorId: string, workspaceId: string, targetUserId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const access = await this.policy.requireWorkspaceCapability(
        actorId,
        workspaceId,
        "member.manage",
        transaction,
      );
      const target = await transaction.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
      if (target === null) throw new NotFoundException("Workspace member not found");
      if (target.role === WorkspaceRole.OWNER || target.userId === access.workspace.ownerId)
        throw new ForbiddenException("The workspace owner cannot be removed");
      if (access.role !== WorkspaceRole.OWNER && target.role === WorkspaceRole.ADMIN)
        throw new ForbiddenException("Only the workspace owner can manage administrators");
      await transaction.workspaceMember.delete({ where: { id: target.id } });
    });
    await this.collaborationControl.userAccessChanged(targetUserId);
  }
}
