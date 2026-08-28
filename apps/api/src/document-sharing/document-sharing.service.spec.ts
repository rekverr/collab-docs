import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { DocumentAccessMode } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import type { ObjectStorageService } from "../attachments/object-storage.service";
import type { AppEnvironment } from "../common/config/environment";
import type { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { PolicyService } from "../permissions/policy.service";
import type { CollaborationControlService } from "../permissions/collaboration-control.service";
import type { PublicRevalidationService } from "../public-revalidation/public-revalidation.service";
import { DocumentSharingService } from "./document-sharing.service";

describe("DocumentSharingService shared attachments", () => {
  it("binds an attachment download to the active share-link document", async () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    const attachmentId = "22222222-2222-4222-8222-222222222222";
    let attachmentFilter: unknown;
    const prisma = {
      documentShareLink: {
        findUnique: async () => ({
          accessMode: DocumentAccessMode.VIEW,
          expiresAt: null,
          revokedAt: null,
          document: { id: documentId, deletedAt: null, archivedAt: null },
        }),
      },
      attachment: {
        findFirst: async (input: { where: unknown }) => {
          attachmentFilter = input.where;
          return { objectKey: "safe/key", fileName: "diagram.png", mimeType: "image/png" };
        },
      },
    } as unknown as PrismaService;
    const storage = {
      createDownloadUrl: async () => "https://storage.example.test/download",
    } as unknown as ObjectStorageService;
    const service = createService(prisma, storage);

    assert.equal(
      await service.sharedAttachmentUrl("a".repeat(43), attachmentId),
      "https://storage.example.test/download",
    );
    assert.deepEqual(attachmentFilter, {
      id: attachmentId,
      documentId,
      status: "READY",
    });
  });

  it("rejects revoked links before resolving attachment metadata", async () => {
    let attachmentQueried = false;
    const prisma = {
      documentShareLink: {
        findUnique: async () => ({
          accessMode: DocumentAccessMode.EDIT,
          expiresAt: null,
          revokedAt: new Date(),
          document: {
            id: "11111111-1111-4111-8111-111111111111",
            deletedAt: null,
            archivedAt: null,
          },
        }),
      },
      attachment: {
        findFirst: async () => {
          attachmentQueried = true;
          return null;
        },
      },
    } as unknown as PrismaService;

    await assert.rejects(
      createService(prisma, {} as ObjectStorageService).sharedAttachmentUrl(
        "a".repeat(43),
        "22222222-2222-4222-8222-222222222222",
      ),
      NotFoundException,
    );
    assert.equal(attachmentQueried, false);
  });
});

function createService(
  prisma: PrismaService,
  storage: ObjectStorageService,
): DocumentSharingService {
  const config = {
    getOrThrow: () => "http://localhost:3000",
  } as unknown as ConfigService<AppEnvironment, true>;
  return new DocumentSharingService(
    prisma,
    {} as PolicyService,
    storage,
    {} as PublicRevalidationService,
    {} as CollaborationControlService,
    config,
  );
}
