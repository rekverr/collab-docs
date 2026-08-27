import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { AttachmentStatus } from "@prisma/client";
import type { UsageQuotaService } from "../billing/usage-quota.service";
import type { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { PolicyService } from "../permissions/policy.service";
import type { ObjectStorageService } from "./object-storage.service";
import { AttachmentsService } from "./attachments.service";

describe("AttachmentsService authorization", () => {
  it("rechecks write permission inside upload finalization transaction", async () => {
    let permissionChecks = 0;
    let finalized = false;
    const attachment = {
      id: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      documentId: "33333333-3333-4333-8333-333333333333",
      uploadedById: "44444444-4444-4444-8444-444444444444",
      bucket: "attachments",
      objectKey: "safe/object/key",
      fileName: "image.png",
      mimeType: "image/png",
      sizeBytes: 100n,
      status: AttachmentStatus.PENDING,
      uploadExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    };
    const transaction = {
      attachment: {
        findUnique: async () => ({
          documentId: attachment.documentId,
          uploadedById: attachment.uploadedById,
          status: attachment.status,
        }),
        updateMany: async () => {
          finalized = true;
          return { count: 1 };
        },
      },
      document: { findFirst: async () => ({ workspaceId: attachment.workspaceId }) },
    };
    const prisma = {
      attachment: { findUnique: async () => attachment },
      document: { findFirst: async () => ({ workspaceId: attachment.workspaceId }) },
      $transaction: async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    } as unknown as PrismaService;
    const policy = {
      requireWorkspaceCapability: async () => {
        permissionChecks += 1;
        if (permissionChecks === 2) throw new NotFoundException("Workspace not found");
      },
    } as unknown as PolicyService;
    const storage = {
      statObject: async () => ({ sizeBytes: 100, mimeType: "image/png" }),
    } as unknown as ObjectStorageService;
    const quota = {
      assertStorageWithinLimit: async () => undefined,
    } as unknown as UsageQuotaService;
    const service = new AttachmentsService(prisma, policy, storage, quota);

    await assert.rejects(
      service.finalize(attachment.uploadedById, attachment.id),
      NotFoundException,
    );
    assert.equal(permissionChecks, 2);
    assert.equal(finalized, false);
  });
});
