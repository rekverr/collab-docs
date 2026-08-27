import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { QuotaExceededError } from "./quota-error";
import type { PlanLimits } from "./plan-catalog";

export interface WorkspaceUsage {
  members: number;
  documents: number;
  storageBytes: bigint;
}

@Injectable()
export class UsageQuotaService {
  async assertDocumentCapacity(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    const limits = await this.lockActiveLimits(transaction, workspaceId);
    const documents = await transaction.document.count({ where: { workspaceId, deletedAt: null } });
    assertBelowLimit("documents", documents, limits.documents);
  }

  async assertInvitationCapacity(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    const limits = await this.lockActiveLimits(transaction, workspaceId);
    const now = new Date();
    const [members, invitations] = await Promise.all([
      transaction.workspaceMember.count({ where: { workspaceId } }),
      transaction.workspaceInvitation.count({
        where: { workspaceId, status: "PENDING", expiresAt: { gt: now } },
      }),
    ]);
    assertBelowLimit("members", members + invitations, limits.members);
  }

  async assertMemberCapacity(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    const limits = await this.lockActiveLimits(transaction, workspaceId);
    const members = await transaction.workspaceMember.count({ where: { workspaceId } });
    assertBelowLimit("members", members, limits.members);
  }

  async reserveStorage(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    bytes: bigint,
  ): Promise<void> {
    const limits = await this.lockActiveLimits(transaction, workspaceId);
    const availableBeforeReservation = limits.storageBytes - bytes;
    if (availableBeforeReservation < 0n) throw new QuotaExceededError("storage");
    const reserved = await transaction.workspace.updateMany({
      where: {
        id: workspaceId,
        deletedAt: null,
        storageUsedBytes: { lte: availableBeforeReservation },
      },
      data: { storageUsedBytes: { increment: bytes } },
    });
    if (reserved.count !== 1) throw new QuotaExceededError("storage");
  }

  async assertStorageWithinLimit(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    const limits = await this.lockActiveLimits(transaction, workspaceId);
    const workspace = await transaction.workspace.findUnique({
      where: { id: workspaceId },
      select: { storageUsedBytes: true },
    });
    if (workspace === null || workspace.storageUsedBytes > limits.storageBytes) {
      throw new QuotaExceededError("storage");
    }
  }

  async usage(transaction: Prisma.TransactionClient, workspaceId: string): Promise<WorkspaceUsage> {
    const [members, documents, workspace] = await Promise.all([
      transaction.workspaceMember.count({ where: { workspaceId } }),
      transaction.document.count({ where: { workspaceId, deletedAt: null } }),
      transaction.workspace.findUnique({
        where: { id: workspaceId },
        select: { storageUsedBytes: true },
      }),
    ]);
    if (workspace === null) throw new UnprocessableEntityException("Workspace is unavailable");
    return { members, documents, storageBytes: workspace.storageUsedBytes };
  }

  assertPlanCanContainUsage(usage: WorkspaceUsage, limits: PlanLimits): void {
    if (usage.documents > limits.documents) throw new QuotaExceededError("documents");
    if (usage.members > limits.members) throw new QuotaExceededError("members");
    if (usage.storageBytes > limits.storageBytes) throw new QuotaExceededError("storage");
  }

  private async lockActiveLimits(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<PlanLimits> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Subscription" WHERE "workspaceId" = ${workspaceId}::uuid FOR UPDATE`,
    );
    const subscription = await transaction.subscription.findUnique({
      where: { workspaceId },
      select: { status: true, memberLimit: true, documentLimit: true, storageLimitBytes: true },
    });
    if (subscription === null || subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new UnprocessableEntityException("An active subscription is required");
    }
    return {
      members: subscription.memberLimit,
      documents: subscription.documentLimit,
      storageBytes: subscription.storageLimitBytes,
    };
  }
}

export function assertBelowLimit(
  resource: "documents" | "members",
  usage: number,
  limit: number,
): void {
  if (usage >= limit) throw new QuotaExceededError(resource);
}
