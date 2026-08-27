import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubscriptionStatus, type Prisma } from "@prisma/client";
import { QuotaExceededError } from "./quota-error";
import { UsageQuotaService } from "./usage-quota.service";

describe("UsageQuotaService", () => {
  it("rejects document creation at the plan document limit", async () => {
    const service = new UsageQuotaService();
    const transaction = quotaTransaction({ documents: 100, members: 1, invitations: 0 });

    await assert.rejects(
      service.assertDocumentCapacity(transaction, "workspace-1"),
      (error: unknown) =>
        error instanceof QuotaExceededError && error.code === "DOCUMENTS_LIMIT_REACHED",
    );
  });

  it("counts pending invitations against the member limit", async () => {
    const service = new UsageQuotaService();
    const transaction = quotaTransaction({ documents: 1, members: 4, invitations: 1 });

    await assert.rejects(
      service.assertInvitationCapacity(transaction, "workspace-1"),
      (error: unknown) =>
        error instanceof QuotaExceededError && error.code === "MEMBERS_LIMIT_REACHED",
    );
  });

  it("rejects storage reservation beyond the configured byte limit", async () => {
    const service = new UsageQuotaService();
    const transaction = quotaTransaction({ documents: 1, members: 1, invitations: 0 });

    await assert.rejects(
      service.reserveStorage(transaction, "workspace-1", 1025n),
      (error: unknown) =>
        error instanceof QuotaExceededError && error.code === "STORAGE_LIMIT_REACHED",
    );
  });
});

function quotaTransaction(input: {
  documents: number;
  members: number;
  invitations: number;
}): Prisma.TransactionClient {
  return {
    $queryRaw: async () => [],
    subscription: {
      findUnique: async () => ({
        status: SubscriptionStatus.ACTIVE,
        memberLimit: 5,
        documentLimit: 100,
        storageLimitBytes: 1024n,
      }),
    },
    document: { count: async () => input.documents },
    workspaceMember: { count: async () => input.members },
    workspaceInvitation: { count: async () => input.invitations },
    workspace: { updateMany: async () => ({ count: 1 }) },
  } as unknown as Prisma.TransactionClient;
}
