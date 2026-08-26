import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "./policy.service";

export interface CollaborationAccess {
  documentId: string;
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
  ): Promise<CollaborationAccess> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null, archivedAt: null },
      select: { id: true, workspaceId: true },
    });
    if (document === null) throw new NotFoundException("Document not found");
    const access = await this.policy.requireWorkspaceCapability(
      user.id,
      document.workspaceId,
      "document.read",
    );
    return {
      documentId: document.id,
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      canWrite: this.policy.hasCapability(access.role, "document.edit"),
    };
  }
}
