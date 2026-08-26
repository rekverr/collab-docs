import { createHash } from "node:crypto";
import { DocumentAccessMode } from "@prisma/client";

export interface ShareAccessRecord {
  accessMode: DocumentAccessMode;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isActiveShareLink(link: ShareAccessRecord, now = new Date()): boolean {
  return link.revokedAt === null && (link.expiresAt === null || link.expiresAt > now);
}

export function shareAllowsWrite(link: ShareAccessRecord, now = new Date()): boolean {
  return isActiveShareLink(link, now) && link.accessMode === DocumentAccessMode.EDIT;
}

export function shareAllowsRead(link: ShareAccessRecord, now = new Date()): boolean {
  return isActiveShareLink(link, now);
}
