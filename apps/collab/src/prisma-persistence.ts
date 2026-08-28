import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import * as Y from "yjs";
import type { ProjectionPublisher } from "./downstream.js";
import type {
  CollaborationPersistence,
  CompactionResult,
  PersistedDocumentState,
  PersistUpdateInput,
  StoredUpdate,
} from "./persistence.js";
import { DocumentUnavailableError } from "./persistence.js";
import { DocumentReloadRequiredError } from "./persistence.js";

export interface PrismaPersistenceOptions {
  compactAfterUpdates?: number;
  retainedSnapshots?: number;
  versionEveryUpdates?: number;
}

export class PrismaCollaborationPersistence implements CollaborationPersistence {
  private readonly compactAfterUpdates: number;
  private readonly retainedSnapshots: number;
  private readonly versionEveryUpdates: number;
  private readonly localCompactions = new Map<string, Promise<CompactionResult>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly publisher: ProjectionPublisher,
    options: PrismaPersistenceOptions = {},
  ) {
    this.compactAfterUpdates = options.compactAfterUpdates ?? 100;
    this.retainedSnapshots = options.retainedSnapshots ?? 3;
    this.versionEveryUpdates = options.versionEveryUpdates ?? 50;
  }

  load(documentId: string): Promise<PersistedDocumentState> {
    return this.prisma.$transaction(async (transaction) => {
      await lockDocument(transaction, documentId);
      await requireActiveDocument(transaction, documentId);
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
        snapshot:
          snapshot === null ? null : { sequence: snapshot.sequence, state: bytes(snapshot.state) },
        updates: updates.map((update) => ({
          sequence: update.sequence,
          update: bytes(update.update),
        })),
      };
    }, documentTransactionOptions);
  }

  async storeUpdate(input: PersistUpdateInput): Promise<StoredUpdate> {
    const updateHash = hash(input.update);
    const projection = toPrismaJsonObject(input.projection);
    const result = await this.prisma.$transaction(async (transaction) => {
      await lockDocument(transaction, input.documentId);
      const document = await requireActiveDocument(transaction, input.documentId);
      const existing = await transaction.yjsUpdate.findUnique({
        where: { documentId_updateHash: { documentId: input.documentId, updateHash } },
        select: { sequence: true },
      });
      if (existing !== null) {
        if (
          document.projectionSequence !== input.baseSequence &&
          existing.sequence !== document.projectionSequence
        ) {
          throw new DocumentReloadRequiredError();
        }
        return {
          sequence: document.projectionSequence,
          duplicate: true,
          published: document.publicationState === "PUBLISHED",
        };
      }
      if (document.projectionSequence !== input.baseSequence) {
        throw new DocumentReloadRequiredError();
      }
      const maximum = await transaction.yjsUpdate.aggregate({
        where: { documentId: input.documentId },
        _max: { sequence: true },
      });
      const latestSnapshot = await transaction.yjsSnapshot.findFirst({
        where: { documentId: input.documentId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const sequence = maxBigInt(maximum._max.sequence ?? 0n, latestSnapshot?.sequence ?? 0n) + 1n;
      await transaction.yjsUpdate.create({
        data: {
          documentId: input.documentId,
          actorUserId: input.actorUserId,
          sequence,
          updateHash,
          update: Buffer.from(input.update),
        },
      });
      await transaction.document.update({
        where: { id: input.documentId },
        data: {
          contentProjection: projection,
          projectionSequence: sequence,
          projectionUpdatedAt: new Date(),
        },
      });
      if (sequence % BigInt(this.versionEveryUpdates) === 0n) {
        await transaction.documentVersion.create({
          data: {
            documentId: input.documentId,
            authorId: input.actorUserId,
            sourceSequence: sequence,
            title: document.title,
            yjsState: Buffer.from(Y.encodeStateAsUpdate(input.document)),
            contentProjection: projection,
          },
        });
      }
      return { sequence, duplicate: false, published: document.publicationState === "PUBLISHED" };
    }, documentTransactionOptions);

    await this.publisher.publish({
      documentId: input.documentId,
      sequence: result.sequence,
      projection: input.projection,
      published: result.published,
    });
    if (!result.duplicate && result.sequence % BigInt(this.compactAfterUpdates) === 0n)
      await this.compact(input.documentId);
    return { sequence: result.sequence, duplicate: result.duplicate };
  }

  compact(documentId: string): Promise<CompactionResult> {
    const pending = this.localCompactions.get(documentId);
    if (pending !== undefined) return pending;
    const compaction = this.performCompaction(documentId);
    this.localCompactions.set(documentId, compaction);
    void compaction.then(
      () => this.localCompactions.delete(documentId),
      () => this.localCompactions.delete(documentId),
    );
    return compaction;
  }

  async roomClosed(documentId: string): Promise<void> {
    await this.compact(documentId);
  }

  async close(): Promise<void> {
    await Promise.all([...this.localCompactions.values()]);
    await this.publisher.close?.();
  }

  private async performCompaction(documentId: string): Promise<CompactionResult> {
    const durable = await this.prisma.$transaction(async (transaction) => {
      await lockDocument(transaction, documentId);
      await requireActiveDocument(transaction, documentId);
      const latest = await transaction.yjsSnapshot.findFirst({
        where: { documentId },
        orderBy: { sequence: "desc" },
        select: { id: true, sequence: true, state: true },
      });
      const updates = await transaction.yjsUpdate.findMany({
        where: { documentId, sequence: { gt: latest?.sequence ?? -1n } },
        orderBy: { sequence: "asc" },
        select: { sequence: true, update: true },
      });
      if (updates.length === 0)
        return latest === null
          ? null
          : { id: latest.id, sequence: latest.sequence, created: false };
      const document = new Y.Doc();
      if (latest !== null) Y.applyUpdate(document, bytes(latest.state));
      for (const update of updates) Y.applyUpdate(document, bytes(update.update));
      const sequence = updates.at(-1)!.sequence;
      const state = Y.encodeStateAsUpdate(document);
      const snapshot = await transaction.yjsSnapshot.create({
        data: {
          documentId,
          sequence,
          state: Buffer.from(state),
          stateVector: Buffer.from(Y.encodeStateVector(document)),
          contentHash: hash(state),
        },
        select: { id: true, sequence: true },
      });
      document.destroy();
      return { ...snapshot, created: true };
    }, documentTransactionOptions);

    if (durable === null) return { compacted: false, sequence: 0n, removedUpdates: 0 };
    if (!durable.created)
      return { compacted: false, sequence: durable.sequence, removedUpdates: 0 };

    const removedUpdates = await this.prisma.$transaction(async (transaction) => {
      await lockDocument(transaction, documentId);
      const snapshot = await transaction.yjsSnapshot.findUnique({
        where: { id: durable.id },
        select: { id: true },
      });
      if (snapshot === null) throw new Error("Durable compaction snapshot disappeared");
      await transaction.yjsUpdate.updateMany({
        where: { documentId, sequence: { lte: durable.sequence } },
        data: { compactedBySnapshotId: durable.id, compactedAt: new Date() },
      });
      const deleted = await transaction.yjsUpdate.deleteMany({
        where: { documentId, compactedBySnapshotId: durable.id },
      });
      const retained = await transaction.yjsSnapshot.findMany({
        where: { documentId },
        orderBy: { sequence: "desc" },
        take: this.retainedSnapshots,
        select: { id: true },
      });
      await transaction.yjsSnapshot.deleteMany({
        where: { documentId, id: { notIn: retained.map(({ id }) => id) } },
      });
      return deleted.count;
    }, documentTransactionOptions);
    return { compacted: true, sequence: durable.sequence, removedUpdates };
  }
}

type Transaction = Prisma.TransactionClient;

// The advisory lock serializes each document. READ COMMITTED ensures statements issued after
// waiting for that lock observe the update/compaction that just committed instead of failing P2034.
const documentTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const;

async function lockDocument(transaction: Transaction, documentId: string): Promise<void> {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${documentId}, 0))`;
}

async function requireActiveDocument(transaction: Transaction, documentId: string) {
  const document = await transaction.document.findFirst({
    where: { id: documentId, deletedAt: null, archivedAt: null },
    select: { id: true, title: true, publicationState: true, projectionSequence: true },
  });
  if (document === null) throw new DocumentUnavailableError();
  return document;
}

function bytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Projection contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map(toPrismaJson);
  if (typeof value === "object") return toPrismaJsonObject(value);
  throw new TypeError("Projection contains an unsupported value");
}

function toPrismaJsonObject(value: object): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, entry] of Object.entries(value)) result[key] = toPrismaJson(entry);
  return result;
}
