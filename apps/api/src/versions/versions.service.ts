import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { JobsOptions, Queue } from "bullmq";
import { JsonLogger } from "../common/logging/json-logger.service";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { RedisService } from "../infrastructure/redis/redis.service";
import { PolicyService } from "../permissions/policy.service";
import type {
  CreateDocumentVersionDto,
  DocumentVersionDto,
  DocumentVersionPreviewDto,
  RestoreDocumentVersionResultDto,
} from "./dto/version.dto";
import {
  createRestoreState,
  encodeVersionState,
  isEmptyYjsUpdate,
  reconstructVersionState,
} from "./version-state";

const versionSelect = {
  id: true,
  documentId: true,
  title: true,
  sourceSequence: true,
  restoredFromVersionId: true,
  createdAt: true,
  author: { select: { id: true, email: true, displayName: true } },
} satisfies Prisma.DocumentVersionSelect;

const emptyProjection: Prisma.InputJsonObject = { version: 1, blocks: [], plainText: "" };

@Injectable()
export class VersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly redis: RedisService,
    private readonly logger: JsonLogger,
    @InjectQueue("document-search-index") private readonly searchQueue: Queue,
    @InjectQueue("public-document-revalidation") private readonly revalidationQueue: Queue,
  ) {}

  async create(
    userId: string,
    documentId: string,
    input: CreateDocumentVersionDto,
  ): Promise<DocumentVersionDto> {
    const version = await this.prisma.$transaction(
      async (transaction) => {
        await lockDocument(transaction, documentId);
        const document = await requireActiveDocument(transaction, documentId);
        await this.policy.requireWorkspaceCapability(
          userId,
          document.workspaceId,
          "document.edit",
          transaction,
        );
        const state = await loadCurrentState(transaction, documentId);
        assertProjectionSynchronized(document, state.sequence);
        const yjsDocument = await reconstructVersionState(state);
        const created = await transaction.documentVersion.create({
          data: {
            documentId,
            authorId: userId,
            sourceSequence: state.sequence,
            title: input.title?.trim() ?? document.title,
            yjsState: Buffer.from(await encodeVersionState(yjsDocument)),
            contentProjection: projectionInput(document.contentProjection),
          },
          select: versionSelect,
        });
        yjsDocument.destroy();
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return mapVersion(version);
  }

  async list(userId: string, documentId: string): Promise<DocumentVersionDto[]> {
    await this.requireCapability(userId, documentId, "document.read");
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: versionSelect,
    });
    return versions.map(mapVersion);
  }

  async preview(
    userId: string,
    documentId: string,
    versionId: string,
  ): Promise<DocumentVersionPreviewDto> {
    await this.requireCapability(userId, documentId, "document.read");
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      select: { ...versionSelect, contentProjection: true },
    });
    if (version === null) throw new NotFoundException("Document version not found");
    return {
      ...mapVersion(version),
      contentProjection: projectionObject(version.contentProjection),
    };
  }

  async restore(
    userId: string,
    documentId: string,
    versionId: string,
  ): Promise<RestoreDocumentVersionResultDto> {
    const restored = await this.prisma.$transaction(
      async (transaction) => {
        await lockDocument(transaction, documentId);
        const document = await requireActiveDocument(transaction, documentId);
        await this.policy.requireWorkspaceCapability(
          userId,
          document.workspaceId,
          "document.edit",
          transaction,
        );
        const version = await transaction.documentVersion.findFirst({
          where: { id: versionId, documentId },
          select: { yjsState: true, contentProjection: true, title: true },
        });
        if (version === null) throw new NotFoundException("Document version not found");

        const currentState = await loadCurrentState(transaction, documentId);
        assertProjectionSynchronized(document, currentState.sequence);
        const current = await reconstructVersionState(currentState);
        const restored = await createRestoreState(current, bytes(version.yjsState));
        const update = restored.update;
        const emptyUpdate = await isEmptyYjsUpdate(update);
        const sequence = emptyUpdate ? currentState.sequence : currentState.sequence + 1n;
        if (!emptyUpdate) {
          await transaction.yjsUpdate.create({
            data: {
              documentId,
              actorUserId: userId,
              sequence,
              updateHash: hash(update),
              update: Buffer.from(update),
            },
          });
        }
        const projection = projectionInput(version.contentProjection);
        await transaction.document.update({
          where: { id: documentId },
          data: {
            contentProjection: projection,
            projectionSequence: sequence,
            projectionUpdatedAt: new Date(),
            updatedById: userId,
          },
        });
        const created = await transaction.documentVersion.create({
          data: {
            documentId,
            authorId: userId,
            restoredFromVersionId: versionId,
            sourceSequence: sequence,
            title: `Restored: ${version.title}`.slice(0, 500),
            yjsState: Buffer.from(await encodeVersionState(restored.document)),
            contentProjection: projection,
          },
          select: versionSelect,
        });
        restored.document.destroy();
        return {
          version: created,
          sequence,
          changed: !emptyUpdate,
          published: document.publicationState === "PUBLISHED",
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const [collaborationReloadRequested] = await Promise.all([
      this.requestCollaborationReload(documentId),
      restored.changed
        ? this.enqueueProjectionWork(documentId, restored.sequence, restored.published)
        : Promise.resolve(),
    ]);
    return { version: mapVersion(restored.version), collaborationReloadRequested };
  }

  private async requireCapability(
    userId: string,
    documentId: string,
    capability: "document.read" | "document.edit",
  ): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null, archivedAt: null },
      select: { workspaceId: true },
    });
    if (document === null) throw new NotFoundException("Document not found");
    await this.policy.requireWorkspaceCapability(userId, document.workspaceId, capability);
  }

  private async requestCollaborationReload(documentId: string): Promise<boolean> {
    try {
      await this.redis.client.publish(
        "collab:document-control",
        JSON.stringify({ type: "restored", documentId }),
      );
      return true;
    } catch (error: unknown) {
      this.logger.event("error", "document_restore_reload_publish_failed", {
        documentId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return false;
    }
  }

  private async enqueueProjectionWork(
    documentId: string,
    sequence: bigint,
    published: boolean,
  ): Promise<void> {
    const sequenceText = sequence.toString();
    const options: JobsOptions = {
      jobId: `${documentId}-${sequenceText}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
    };
    try {
      await this.searchQueue.add("index-document", { documentId, sequence: sequenceText }, options);
      if (published) {
        await this.revalidationQueue.add(
          "revalidate-document",
          { documentId, sequence: sequenceText },
          options,
        );
      }
    } catch (error: unknown) {
      this.logger.event("error", "document_restore_projection_enqueue_failed", {
        documentId,
        sequence: sequenceText,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}

type VersionRecord = Prisma.DocumentVersionGetPayload<{ select: typeof versionSelect }>;

function mapVersion(version: VersionRecord): DocumentVersionDto {
  return {
    id: version.id,
    documentId: version.documentId,
    title: version.title,
    sourceSequence: version.sourceSequence.toString(),
    restoredFromVersionId: version.restoredFromVersionId,
    author: version.author,
    createdAt: version.createdAt,
  };
}

async function requireActiveDocument(transaction: Prisma.TransactionClient, documentId: string) {
  const document = await transaction.document.findFirst({
    where: { id: documentId, deletedAt: null, archivedAt: null },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      contentProjection: true,
      projectionSequence: true,
      publicationState: true,
    },
  });
  if (document === null) throw new NotFoundException("Document not found");
  return document;
}

async function loadCurrentState(transaction: Prisma.TransactionClient, documentId: string) {
  const snapshot = await transaction.yjsSnapshot.findFirst({
    where: { documentId },
    orderBy: { sequence: "desc" },
    select: { sequence: true, state: true },
  });
  const updates = await transaction.yjsUpdate.findMany({
    where: { documentId, sequence: { gt: snapshot?.sequence ?? -1n } },
    orderBy: { sequence: "asc" },
    select: { sequence: true, update: true },
  });
  return {
    sequence: updates.at(-1)?.sequence ?? snapshot?.sequence ?? 0n,
    snapshot: snapshot === null ? null : bytes(snapshot.state),
    updates: updates.map(({ update }) => bytes(update)),
  };
}

function assertProjectionSynchronized(
  document: { projectionSequence: bigint; contentProjection: Prisma.JsonValue | null },
  stateSequence: bigint,
): void {
  if (document.projectionSequence !== stateSequence) {
    throw new ConflictException("Document projection is not synchronized with its CRDT state");
  }
  if (stateSequence > 0n && document.contentProjection === null) {
    throw new ConflictException("Document projection is missing for its CRDT state");
  }
}

async function lockDocument(
  transaction: Prisma.TransactionClient,
  documentId: string,
): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${documentId}, 0))`;
}

function projectionInput(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (value === null) return emptyProjection;
  return toPrismaJsonObject(projectionObject(value));
}

function projectionObject(value: Prisma.JsonValue): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConflictException("Stored document projection is invalid");
  }
  return value;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ConflictException("Stored projection is invalid");
    return value;
  }
  if (Array.isArray(value)) return value.map(toPrismaJson);
  if (typeof value === "object") return toPrismaJsonObject(value);
  throw new ConflictException("Stored projection is invalid");
}

function toPrismaJsonObject(value: object): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, entry] of Object.entries(value)) result[key] = toPrismaJson(entry);
  return result;
}

function bytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
