import {
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import type { WorkspaceCapability } from "../permissions/permission.types";

export const maximumAttachmentSizeBytes = 10 * 1024 * 1024;

const supportedMimeTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

export type AttachmentAction = "create" | "finalize" | "read" | "delete";

export function attachmentCapability(action: AttachmentAction): WorkspaceCapability {
  return action === "read" ? "document.read" : "document.edit";
}

export function assertSupportedAttachment(mimeType: string, sizeBytes: number): void {
  if (!supportedMimeTypes.has(mimeType)) {
    throw new UnsupportedMediaTypeException("Unsupported attachment MIME type");
  }
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > maximumAttachmentSizeBytes
  ) {
    throw new PayloadTooLargeException(
      `Attachment size must be between 1 and ${maximumAttachmentSizeBytes} bytes`,
    );
  }
}

export function hasStorageQuota(
  usedBytes: bigint,
  limitBytes: bigint,
  requestedBytes: bigint,
): boolean {
  return requestedBytes > 0n && usedBytes <= limitBytes - requestedBytes;
}

export function assertUploadOwner(userId: string, uploadedById: string): void {
  if (userId !== uploadedById) {
    throw new ForbiddenException("Only the upload requester can finalize this attachment");
  }
}

export function normalizeFileName(fileName: string): string {
  const withoutPath = fileName.replaceAll("\\", "/").split("/").at(-1) ?? "upload";
  const normalized = withoutPath.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (normalized === "" ? "upload" : normalized).slice(0, 255);
}
