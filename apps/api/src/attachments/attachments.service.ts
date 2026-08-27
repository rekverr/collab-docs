import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AttachmentStatus, Prisma } from "@prisma/client";
import { QuotaExceededError } from "../billing/quota-error";
import { UsageQuotaService } from "../billing/usage-quota.service";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "../permissions/policy.service";
import {
  assertSupportedAttachment,
  assertUploadOwner,
  attachmentCapability,
  normalizeFileName,
} from "./attachment-rules";
import type {
  AttachmentDownloadDto,
  AttachmentDto,
  AttachmentUploadDto,
  RequestAttachmentUploadDto,
} from "./dto/attachment.dto";
import { ObjectStorageService } from "./object-storage.service";

const uploadLifetimeMs = 10 * 60 * 1000;
const downloadLifetimeMs = 5 * 60 * 1000;

const attachmentSelect = {
  id: true,
  workspaceId: true,
  documentId: true,
  uploadedById: true,
  bucket: true,
  objectKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  uploadExpiresAt: true,
  createdAt: true,
} satisfies Prisma.AttachmentSelect;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly storage: ObjectStorageService,
    private readonly quota: UsageQuotaService,
  ) {}

  async requestUpload(
    userId: string,
    documentId: string,
    input: RequestAttachmentUploadDto,
  ): Promise<AttachmentUploadDto> {
    assertSupportedAttachment(input.mimeType, input.sizeBytes);
    const attachmentId = randomUUID();
    const expiresAt = new Date(Date.now() + uploadLifetimeMs);
    const attachment = await this.prisma.$transaction(async (transaction) => {
      const document = await this.requireDocumentAccess(transaction, userId, documentId, "create");
      const requestedBytes = BigInt(input.sizeBytes);
      await this.quota.reserveStorage(transaction, document.workspaceId, requestedBytes);
      return transaction.attachment.create({
        data: {
          id: attachmentId,
          workspaceId: document.workspaceId,
          documentId,
          uploadedById: userId,
          bucket: this.storage.bucketName(),
          objectKey: objectKey(document.workspaceId, documentId, attachmentId),
          fileName: normalizeFileName(input.fileName),
          mimeType: input.mimeType,
          sizeBytes: requestedBytes,
          uploadExpiresAt: expiresAt,
        },
        select: attachmentSelect,
      });
    });

    try {
      return {
        attachment: mapAttachment(attachment),
        uploadUrl: await this.storage.createUploadUrl(attachment.objectKey, attachment.mimeType),
        expiresAt,
        requiredHeaders: { "content-type": attachment.mimeType },
      };
    } catch {
      await this.releaseReservation(attachment.id);
      throw new UnprocessableEntityException("Could not create an attachment upload URL");
    }
  }

  async finalize(userId: string, attachmentId: string): Promise<AttachmentDto> {
    const attachment = await this.requireAttachment(attachmentId);
    await this.requireDocumentAccess(this.prisma, userId, attachment.documentId, "finalize");
    assertUploadOwner(userId, attachment.uploadedById);
    if (attachment.status === AttachmentStatus.READY) return mapAttachment(attachment);
    if (attachment.status !== AttachmentStatus.PENDING) {
      throw new NotFoundException("Attachment not found");
    }
    if (attachment.uploadExpiresAt === null || attachment.uploadExpiresAt <= new Date()) {
      await this.discardUpload(attachment);
      throw new ConflictException("Attachment upload request expired");
    }

    let uploaded: { sizeBytes: number; mimeType: string | undefined };
    try {
      uploaded = await this.storage.statObject(attachment.objectKey);
    } catch {
      throw new UnprocessableEntityException("Uploaded object was not found");
    }
    if (
      uploaded.sizeBytes !== Number(attachment.sizeBytes) ||
      uploaded.mimeType !== attachment.mimeType
    ) {
      await this.discardUpload(attachment);
      throw new UnprocessableEntityException("Uploaded object does not match its declaration");
    }

    let finalized: { count: number };
    try {
      finalized = await this.prisma.$transaction(async (transaction) => {
        await this.quota.assertStorageWithinLimit(transaction, attachment.workspaceId);
        return transaction.attachment.updateMany({
          where: { id: attachment.id, status: AttachmentStatus.PENDING },
          data: { status: AttachmentStatus.READY, finalizedAt: new Date(), uploadExpiresAt: null },
        });
      });
    } catch (error: unknown) {
      if (!(error instanceof QuotaExceededError)) throw error;
      await this.discardUpload(attachment);
      throw error;
    }
    if (finalized.count !== 1) {
      const current = await this.requireAttachment(attachment.id);
      if (current.status === AttachmentStatus.READY) return mapAttachment(current);
      throw new ConflictException("Attachment state changed during finalization");
    }
    return mapAttachment({ ...attachment, status: AttachmentStatus.READY, uploadExpiresAt: null });
  }

  async download(userId: string, attachmentId: string): Promise<AttachmentDownloadDto> {
    const attachment = await this.requireAttachment(attachmentId);
    await this.requireDocumentAccess(this.prisma, userId, attachment.documentId, "read");
    if (attachment.status !== AttachmentStatus.READY) {
      throw new NotFoundException("Attachment not found");
    }
    return {
      url: await this.storage.createDownloadUrl(
        attachment.objectKey,
        attachment.fileName,
        attachment.mimeType,
      ),
      expiresAt: new Date(Date.now() + downloadLifetimeMs),
    };
  }

  async delete(userId: string, attachmentId: string): Promise<void> {
    const attachment = await this.requireAttachment(attachmentId);
    await this.requireDocumentAccess(this.prisma, userId, attachment.documentId, "delete");
    if (attachment.status === AttachmentStatus.DELETED) {
      throw new NotFoundException("Attachment not found");
    }
    await this.storage.deleteObject(attachment.objectKey);
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.attachment.updateMany({
        where: { id: attachment.id, status: { not: AttachmentStatus.DELETED } },
        data: {
          status: AttachmentStatus.DELETED,
          deletedAt: new Date(),
          uploadExpiresAt: null,
        },
      });
      if (removed.count === 1) {
        await transaction.workspace.update({
          where: { id: attachment.workspaceId },
          data: { storageUsedBytes: { decrement: attachment.sizeBytes } },
        });
      }
    });
  }

  private async requireDocumentAccess(
    database: PrismaService | Prisma.TransactionClient,
    userId: string,
    documentId: string,
    action: Parameters<typeof attachmentCapability>[0],
  ): Promise<{ workspaceId: string }> {
    const document = await database.document.findFirst({
      where: { id: documentId, deletedAt: null, archivedAt: null },
      select: { workspaceId: true },
    });
    if (document === null) throw new NotFoundException("Document not found");
    await this.policy.requireWorkspaceCapability(
      userId,
      document.workspaceId,
      attachmentCapability(action),
      database,
    );
    return document;
  }

  private async requireAttachment(attachmentId: string): Promise<AttachmentRecord> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: attachmentSelect,
    });
    if (attachment === null) throw new NotFoundException("Attachment not found");
    return attachment;
  }

  private async discardUpload(attachment: AttachmentRecord): Promise<void> {
    await this.storage.deleteObject(attachment.objectKey);
    await this.releaseReservation(attachment.id);
  }

  private async releaseReservation(attachmentId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const attachment = await transaction.attachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, workspaceId: true, sizeBytes: true, status: true },
      });
      if (attachment === null || attachment.status !== AttachmentStatus.PENDING) return;
      const removed = await transaction.attachment.updateMany({
        where: { id: attachmentId, status: AttachmentStatus.PENDING },
        data: { status: AttachmentStatus.DELETED, deletedAt: new Date(), uploadExpiresAt: null },
      });
      if (removed.count === 1) {
        await transaction.workspace.update({
          where: { id: attachment.workspaceId },
          data: { storageUsedBytes: { decrement: attachment.sizeBytes } },
        });
      }
    });
  }
}

type AttachmentRecord = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

function objectKey(workspaceId: string, documentId: string, attachmentId: string): string {
  return `workspaces/${workspaceId}/documents/${documentId}/attachments/${attachmentId}`;
}

function mapAttachment(attachment: AttachmentRecord): AttachmentDto {
  return {
    id: attachment.id,
    documentId: attachment.documentId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: Number(attachment.sizeBytes),
    status: attachment.status,
    createdAt: attachment.createdAt,
  };
}
