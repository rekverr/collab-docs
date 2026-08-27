import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "../permissions/policy.service";
import { PublicRevalidationService } from "../public-revalidation/public-revalidation.service";
import { SearchIndexService } from "../search/search-index.service";
import { UsageQuotaService } from "../billing/usage-quota.service";
import {
  appendedSortKey,
  assertExactSiblingOrder,
  assertNoHierarchyCycle,
  assertValidParent,
  formatSortKey,
  sortKeyGap,
} from "./document-hierarchy";
import type {
  CreateDocumentDto,
  DocumentMetadataDto,
  DocumentTreeNodeDto,
  MoveDocumentDto,
  ReorderDocumentsDto,
  UpdateDocumentMetadataDto,
} from "./dto/document.dto";

const metadataSelect = {
  id: true,
  workspaceId: true,
  parentId: true,
  title: true,
  sortKey: true,
  publicationState: true,
  archivedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

type Database = PrismaService | Prisma.TransactionClient;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly revalidation: PublicRevalidationService,
    private readonly searchIndex: SearchIndexService,
    private readonly quota: UsageQuotaService,
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    input: CreateDocumentDto,
  ): Promise<DocumentMetadataDto> {
    const document = await this.prisma.$transaction(async (transaction) => {
      await this.policy.requireWorkspaceCapability(
        userId,
        workspaceId,
        "document.create",
        transaction,
      );
      await this.quota.assertDocumentCapacity(transaction, workspaceId);
      const parentId = input.parentId ?? null;
      if (parentId !== null) await this.requireActiveParent(transaction, parentId, workspaceId);
      const last = await transaction.document.findFirst({
        where: { workspaceId, parentId, deletedAt: null, archivedAt: null },
        orderBy: { sortKey: "desc" },
        select: { sortKey: true },
      });
      return transaction.document.create({
        data: {
          workspaceId,
          parentId,
          createdById: userId,
          updatedById: userId,
          title: input.title?.trim() ?? "Untitled",
          sortKey: appendedSortKey(last?.sortKey),
        },
        select: metadataSelect,
      });
    });
    await this.searchIndex.enqueueBestEffort(document.id, document.updatedAt.getTime());
    return document;
  }

  async get(userId: string, documentId: string): Promise<DocumentMetadataDto> {
    const document = await this.requireVisibleDocument(this.prisma, documentId);
    await this.policy.requireWorkspaceCapability(userId, document.workspaceId, "document.read");
    return document;
  }

  async tree(userId: string, workspaceId: string): Promise<DocumentTreeNodeDto[]> {
    await this.policy.requireWorkspaceCapability(userId, workspaceId, "document.read");
    const documents = await this.prisma.document.findMany({
      where: { workspaceId, deletedAt: null, archivedAt: null },
      orderBy: [{ sortKey: "asc" }, { id: "asc" }],
      select: metadataSelect,
    });
    const nodes = new Map(
      documents.map((document) => [
        document.id,
        { ...document, children: [] as DocumentTreeNodeDto[] },
      ]),
    );
    const roots: DocumentTreeNodeDto[] = [];
    for (const document of documents) {
      const node = nodes.get(document.id);
      if (node === undefined) continue;
      if (document.parentId === null) roots.push(node);
      else nodes.get(document.parentId)?.children.push(node);
    }
    return roots;
  }

  async update(
    userId: string,
    documentId: string,
    input: UpdateDocumentMetadataDto,
  ): Promise<DocumentMetadataDto> {
    const document = await this.prisma.$transaction(async (transaction) => {
      const document = await this.requireVisibleDocument(transaction, documentId);
      await this.policy.requireWorkspaceCapability(
        userId,
        document.workspaceId,
        "document.edit",
        transaction,
      );
      return transaction.document.update({
        where: { id: documentId },
        data: { title: input.title.trim(), updatedById: userId },
        select: metadataSelect,
      });
    });
    await this.searchIndex.enqueueBestEffort(document.id, document.updatedAt.getTime());
    return document;
  }

  move(userId: string, documentId: string, input: MoveDocumentDto): Promise<DocumentMetadataDto> {
    return this.prisma.$transaction(
      async (transaction) => {
        const document = await this.requireVisibleDocument(transaction, documentId);
        await this.policy.requireWorkspaceCapability(
          userId,
          document.workspaceId,
          "document.edit",
          transaction,
        );
        const parentId = input.parentId ?? null;
        if (parentId !== null) {
          const parent = await this.requireActiveParent(
            transaction,
            parentId,
            document.workspaceId,
          );
          assertValidParent(document, parent);
          await this.assertNoCycle(transaction, document.id, parent.id);
        }
        const sortKey = await this.destinationSortKey(
          transaction,
          document,
          parentId,
          input.beforeDocumentId,
        );
        return transaction.document.update({
          where: { id: document.id },
          data: { parentId, sortKey, updatedById: userId },
          select: metadataSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  reorder(
    userId: string,
    workspaceId: string,
    input: ReorderDocumentsDto,
  ): Promise<DocumentMetadataDto[]> {
    return this.prisma.$transaction(async (transaction) => {
      await this.policy.requireWorkspaceCapability(
        userId,
        workspaceId,
        "document.edit",
        transaction,
      );
      const parentId = input.parentId ?? null;
      if (parentId !== null) await this.requireActiveParent(transaction, parentId, workspaceId);
      const siblings = await transaction.document.findMany({
        where: { workspaceId, parentId, deletedAt: null, archivedAt: null },
        orderBy: [{ sortKey: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      assertExactSiblingOrder(
        siblings.map(({ id }) => id),
        input.orderedDocumentIds,
      );
      await Promise.all(
        input.orderedDocumentIds.map((id, index) =>
          transaction.document.update({
            where: { id },
            data: { sortKey: formatSortKey(BigInt(index + 1) * sortKeyGap), updatedById: userId },
          }),
        ),
      );
      return transaction.document.findMany({
        where: { workspaceId, parentId, deletedAt: null, archivedAt: null },
        orderBy: [{ sortKey: "asc" }, { id: "asc" }],
        select: metadataSelect,
      });
    });
  }

  archive(userId: string, documentId: string): Promise<DocumentMetadataDto> {
    return this.setLifecycle(userId, documentId, "archive");
  }

  delete(userId: string, documentId: string): Promise<DocumentMetadataDto> {
    return this.setLifecycle(userId, documentId, "delete");
  }

  async restore(userId: string, documentId: string): Promise<DocumentMetadataDto> {
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const document = await transaction.document.findUnique({
        where: { id: documentId },
        select: { ...metadataSelect, publicSlug: true },
      });
      if (document === null) throw new NotFoundException("Document not found");
      await this.policy.requireWorkspaceCapability(
        userId,
        document.workspaceId,
        "document.delete",
        transaction,
      );
      if (document.deletedAt !== null) {
        await this.quota.assertDocumentCapacity(transaction, document.workspaceId);
      }
      if (document.parentId !== null)
        await this.requireActiveParent(transaction, document.parentId, document.workspaceId);
      const restored = await transaction.document.update({
        where: { id: documentId },
        data: { archivedAt: null, deletedAt: null, updatedById: userId },
        select: { ...metadataSelect, publicSlug: true },
      });
      const { publicSlug, ...metadata } = restored;
      return { metadata, publicSlug };
    });
    if (outcome.publicSlug !== null) {
      await this.revalidation.enqueueBestEffort(
        documentId,
        outcome.metadata.updatedAt.getTime(),
        "restored",
      );
    }
    await this.searchIndex.enqueueBestEffort(documentId, outcome.metadata.updatedAt.getTime());
    return outcome.metadata;
  }

  private async setLifecycle(
    userId: string,
    documentId: string,
    action: "archive" | "delete",
  ): Promise<DocumentMetadataDto> {
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const document = await this.requireVisibleDocument(transaction, documentId);
      await this.policy.requireWorkspaceCapability(
        userId,
        document.workspaceId,
        "document.delete",
        transaction,
      );
      const now = new Date();
      const changed = await transaction.document.update({
        where: { id: documentId },
        data:
          action === "archive"
            ? { archivedAt: now, updatedById: userId }
            : { deletedAt: now, updatedById: userId },
        select: { ...metadataSelect, publicSlug: true },
      });
      const { publicSlug, ...metadata } = changed;
      return { metadata, publicSlug };
    });
    if (outcome.publicSlug !== null) {
      await this.revalidation.enqueueBestEffort(
        documentId,
        outcome.metadata.updatedAt.getTime(),
        action === "archive" ? "archived" : "deleted",
      );
    }
    await this.searchIndex.enqueueBestEffort(documentId, outcome.metadata.updatedAt.getTime());
    return outcome.metadata;
  }

  private async requireVisibleDocument(
    database: Database,
    documentId: string,
  ): Promise<DocumentMetadataDto> {
    const document = await database.document.findFirst({
      where: { id: documentId, deletedAt: null, archivedAt: null },
      select: metadataSelect,
    });
    if (document === null) throw new NotFoundException("Document not found");
    let parentId = document.parentId;
    while (parentId !== null) {
      const parent = await database.document.findFirst({
        where: { id: parentId, deletedAt: null, archivedAt: null },
        select: { parentId: true },
      });
      if (parent === null) throw new NotFoundException("Document not found");
      parentId = parent.parentId;
    }
    return document;
  }

  private async requireActiveParent(database: Database, parentId: string, workspaceId: string) {
    const parent = await database.document.findFirst({
      where: { id: parentId, workspaceId, deletedAt: null, archivedAt: null },
      select: { id: true, workspaceId: true, parentId: true },
    });
    if (parent === null)
      throw new UnprocessableEntityException(
        "Parent must be an active document in the same workspace",
      );
    return parent;
  }

  private async assertNoCycle(
    database: Database,
    documentId: string,
    parentId: string,
  ): Promise<void> {
    const parents = new Map<string, string | null>();
    let cursor: string | null = parentId;
    while (cursor !== null && !parents.has(cursor)) {
      const ancestor: { parentId: string | null } | null = await database.document.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (ancestor === null) break;
      parents.set(cursor, ancestor.parentId);
      cursor = ancestor.parentId;
    }
    assertNoHierarchyCycle(documentId, parentId, parents);
  }

  private async destinationSortKey(
    database: Database,
    document: DocumentMetadataDto,
    parentId: string | null,
    beforeId?: string,
  ): Promise<string> {
    const siblings = await database.document.findMany({
      where: {
        workspaceId: document.workspaceId,
        parentId,
        id: { not: document.id },
        deletedAt: null,
        archivedAt: null,
      },
      orderBy: [{ sortKey: "asc" }, { id: "asc" }],
      select: { id: true, sortKey: true },
    });
    if (beforeId === undefined) return appendedSortKey(siblings.at(-1)?.sortKey);
    const nextIndex = siblings.findIndex(({ id }) => id === beforeId);
    if (nextIndex < 0)
      throw new UnprocessableEntityException(
        "The reference document must be an active destination sibling",
      );
    const previousValue = nextIndex === 0 ? 0n : BigInt(siblings[nextIndex - 1]!.sortKey);
    const nextValue = BigInt(siblings[nextIndex]!.sortKey);
    if (nextValue - previousValue > 1n) return formatSortKey((previousValue + nextValue) / 2n);
    await Promise.all(
      siblings.map(({ id }, index) =>
        database.document.update({
          where: { id },
          data: { sortKey: formatSortKey(BigInt(index + 1) * sortKeyGap) },
        }),
      ),
    );
    return formatSortKey(
      nextIndex === 0 ? sortKeyGap / 2n : BigInt(nextIndex) * sortKeyGap + sortKeyGap / 2n,
    );
  }
}
