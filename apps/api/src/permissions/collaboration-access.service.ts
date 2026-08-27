import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentAccessMode } from "@prisma/client";
import { hashShareToken, isActiveShareLink } from "../document-sharing/share-access";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "./policy.service";

export interface CollaborationAccess {
  documentId: string;
  workspaceId: string;
  userId: string;
  email: string;
  displayName: string | null;
  canWrite: boolean;
}

@Injectable()
export class CollaborationAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  async resolve(
    user: { id: string; email: string; displayName: string | null },
    documentId: string,
    shareToken?: string,
  ): Promise<CollaborationAccess> {
    if (shareToken !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(shareToken)) {
      throw new BadRequestException("Invalid document share token");
    }
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null, archivedAt: null },
      select: { id: true, workspaceId: true, workspace: { select: { deletedAt: true } } },
    });
    if (document === null || document.workspace.deletedAt !== null) {
      throw new NotFoundException("Document not found");
    }
    const [membership, grant, shareLink] = await Promise.all([
      this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: document.workspaceId, userId: user.id } },
        select: { role: true },
      }),
      this.prisma.documentAccessGrant.findUnique({
        where: { documentId_userId: { documentId, userId: user.id } },
        select: { accessMode: true, expiresAt: true, revokedAt: true },
      }),
      shareToken === undefined
        ? null
        : this.prisma.documentShareLink.findUnique({
            where: { tokenHash: hashShareToken(shareToken) },
            select: { documentId: true, accessMode: true, expiresAt: true, revokedAt: true },
          }),
    ]);
    const now = new Date();
    const grantActive =
      grant !== null &&
      grant.revokedAt === null &&
      (grant.expiresAt === null || grant.expiresAt > now);
    const shareActive =
      shareLink !== null &&
      shareLink.documentId === documentId &&
      isActiveShareLink(shareLink, now);
    const memberCanRead =
      membership !== null && this.policy.hasCapability(membership.role, "document.read");
    if (!memberCanRead && !grantActive && !shareActive) {
      throw new NotFoundException("Document not found");
    }
    return {
      documentId: document.id,
      workspaceId: document.workspaceId,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      canWrite:
        (membership !== null && this.policy.hasCapability(membership.role, "document.edit")) ||
        (grantActive && grant.accessMode === DocumentAccessMode.EDIT) ||
        (shareActive && shareLink.accessMode === DocumentAccessMode.EDIT),
    };
  }
}
