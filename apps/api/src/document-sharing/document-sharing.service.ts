import { randomBytes } from "node:crypto";
import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentAccessMode, DocumentPublicationState, Prisma } from "@prisma/client";
import type { AppEnvironment } from "../common/config/environment";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "../permissions/policy.service";
import type {
  CreateShareLinkDto,
  DocumentSharingStateDto,
  PublishedDocumentDto,
  SharedDocumentDto,
  ShareLinkDto,
} from "./dto/document-sharing.dto";
import { hashShareToken, isActiveShareLink } from "./share-access";

const shareLinkSelect = {
  id: true,
  documentId: true,
  accessMode: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentShareLinkSelect;

@Injectable()
export class DocumentSharingService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.webUrl = config.getOrThrow("WEB_URL", { infer: true }).replace(/\/$/, "");
  }

  async state(userId: string, documentId: string): Promise<DocumentSharingStateDto> {
    const document = await this.requireManageableDocument(this.prisma, userId, documentId);
    const links = await this.prisma.documentShareLink.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: shareLinkSelect,
    });
    return this.mapState(document, links);
  }

  async setPublication(
    userId: string,
    documentId: string,
    published: boolean,
  ): Promise<DocumentSharingStateDto> {
    const document = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireManageableDocument(transaction, userId, documentId);
      return transaction.document.update({
        where: { id: documentId },
        data: published
          ? {
              publicationState: DocumentPublicationState.PUBLISHED,
              publishedAt: current.publishedAt ?? new Date(),
              publicSlug: current.publicSlug ?? stablePublicSlug(current.title, current.id),
              updatedById: userId,
            }
          : {
              publicationState: DocumentPublicationState.PRIVATE,
              publishedAt: null,
              updatedById: userId,
            },
        select: manageableDocumentSelect,
      });
    });
    const links = await this.prisma.documentShareLink.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: shareLinkSelect,
    });
    return this.mapState(document, links);
  }

  async createLink(
    userId: string,
    documentId: string,
    input: CreateShareLinkDto,
  ): Promise<ShareLinkDto> {
    const expiresAt = parseFutureExpiration(input.expiresAt);
    const token = secureToken();
    const link = await this.prisma.$transaction(async (transaction) => {
      await this.requireManageableDocument(transaction, userId, documentId);
      return transaction.documentShareLink.create({
        data: {
          documentId,
          tokenHash: hashShareToken(token),
          accessMode: input.accessMode,
          createdById: userId,
          expiresAt,
        },
        select: shareLinkSelect,
      });
    });
    return mapLink(link, this.shareUrl(token));
  }

  async revokeLink(userId: string, linkId: string): Promise<ShareLinkDto> {
    const link = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireManageableLink(transaction, userId, linkId);
      if (current.revokedAt !== null) return current;
      return transaction.documentShareLink.update({
        where: { id: linkId },
        data: { revokedAt: new Date() },
        select: shareLinkSelect,
      });
    });
    return mapLink(link, null);
  }

  async regenerateLink(userId: string, linkId: string): Promise<ShareLinkDto> {
    const token = secureToken();
    const replacement = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireManageableLink(transaction, userId, linkId);
      await transaction.documentShareLink.update({
        where: { id: current.id },
        data: { revokedAt: current.revokedAt ?? new Date() },
      });
      return transaction.documentShareLink.create({
        data: {
          documentId: current.documentId,
          tokenHash: hashShareToken(token),
          accessMode: current.accessMode,
          createdById: userId,
          expiresAt:
            current.expiresAt !== null && current.expiresAt > new Date() ? current.expiresAt : null,
        },
        select: shareLinkSelect,
      });
    });
    return mapLink(replacement, this.shareUrl(token));
  }

  async resolveShare(token: string): Promise<SharedDocumentDto> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new NotFoundException("Shared document not found");
    }
    const tokenHash = hashShareToken(token);
    const link = await this.prisma.documentShareLink.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        accessMode: true,
        expiresAt: true,
        revokedAt: true,
        document: {
          select: {
            id: true,
            title: true,
            contentProjection: true,
            deletedAt: true,
            archivedAt: true,
          },
        },
      },
    });
    if (
      link === null ||
      !isActiveShareLink(link) ||
      link.document.deletedAt !== null ||
      link.document.archivedAt !== null
    ) {
      throw new NotFoundException("Shared document not found");
    }
    await this.prisma.documentShareLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      documentId: link.document.id,
      title: link.document.title,
      accessMode: link.accessMode,
      expiresAt: link.expiresAt,
      contentProjection: link.document.contentProjection,
    };
  }

  async resolvePublished(publicSlug: string): Promise<PublishedDocumentDto> {
    const document = await this.prisma.document.findFirst({
      where: {
        publicSlug,
        publicationState: DocumentPublicationState.PUBLISHED,
        deletedAt: null,
        archivedAt: null,
      },
      select: {
        id: true,
        title: true,
        publicSlug: true,
        contentProjection: true,
        projectionUpdatedAt: true,
      },
    });
    if (document === null || document.publicSlug === null) {
      throw new NotFoundException("Published document not found");
    }
    return {
      documentId: document.id,
      title: document.title,
      publicSlug: document.publicSlug,
      contentProjection: document.contentProjection,
      projectionUpdatedAt: document.projectionUpdatedAt,
    };
  }

  private async requireManageableDocument(
    database: PrismaService | Prisma.TransactionClient,
    userId: string,
    documentId: string,
  ): Promise<ManageableDocument> {
    const document = await database.document.findFirst({
      where: { id: documentId, deletedAt: null, archivedAt: null },
      select: manageableDocumentSelect,
    });
    if (document === null) throw new NotFoundException("Document not found");
    await this.policy.requireWorkspaceCapability(
      userId,
      document.workspaceId,
      "document.publish",
      database,
    );
    return document;
  }

  private async requireManageableLink(
    database: Prisma.TransactionClient,
    userId: string,
    linkId: string,
  ): Promise<ShareLinkRecord> {
    const link = await database.documentShareLink.findUnique({
      where: { id: linkId },
      select: shareLinkSelect,
    });
    if (link === null) throw new NotFoundException("Share link not found");
    await this.requireManageableDocument(database, userId, link.documentId);
    return link;
  }

  private mapState(
    document: ManageableDocument,
    links: ShareLinkRecord[],
  ): DocumentSharingStateDto {
    return {
      documentId: document.id,
      published: document.publicationState === DocumentPublicationState.PUBLISHED,
      publicSlug: document.publicSlug,
      publicUrl:
        document.publicationState !== DocumentPublicationState.PUBLISHED ||
        document.publicSlug === null
          ? null
          : `${this.webUrl}/public/${document.publicSlug}`,
      links: links.map((link) => mapLink(link, null)),
    };
  }

  private shareUrl(token: string): string {
    return `${this.webUrl}/share/${encodeURIComponent(token)}`;
  }
}

const manageableDocumentSelect = {
  id: true,
  workspaceId: true,
  title: true,
  publicationState: true,
  publicSlug: true,
  publishedAt: true,
} satisfies Prisma.DocumentSelect;

type ManageableDocument = Prisma.DocumentGetPayload<{ select: typeof manageableDocumentSelect }>;
type ShareLinkRecord = Prisma.DocumentShareLinkGetPayload<{ select: typeof shareLinkSelect }>;

function mapLink(link: ShareLinkRecord, url: string | null): ShareLinkDto {
  return { ...link, url };
}

function secureToken(): string {
  return randomBytes(32).toString("base64url");
}

function stablePublicSlug(title: string, documentId: string): string {
  const base = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return `${base === "" ? "document" : base}-${documentId.replaceAll("-", "")}`;
}

function parseFutureExpiration(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new UnprocessableEntityException("Share link expiration must be in the future");
  }
  return expiresAt;
}
