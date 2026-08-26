import type * as Y from "yjs";
import { createHash } from "node:crypto";
import * as Yjs from "yjs";
import type { DocumentProjection } from "./projection.js";

export interface PersistedUpdate { sequence: bigint; update: Uint8Array }
export interface PersistedDocumentState {
  snapshot: { sequence: bigint; state: Uint8Array } | null;
  updates: readonly PersistedUpdate[];
}
export interface StoredUpdate { sequence: bigint; duplicate: boolean }
export interface PersistUpdateInput {
  documentId: string;
  actorUserId: string;
  update: Uint8Array;
  document: Y.Doc;
  projection: DocumentProjection;
}
export interface CompactionResult { compacted: boolean; sequence: bigint; removedUpdates: number }

export interface CollaborationPersistence {
  load(documentId: string): Promise<PersistedDocumentState>;
  storeUpdate(input: PersistUpdateInput): Promise<StoredUpdate>;
  compact(documentId: string): Promise<CompactionResult>;
  roomClosed?(documentId: string): Promise<void>;
  close?(): Promise<void>;
}

export class DocumentUnavailableError extends Error {
  constructor() { super("Document is unavailable"); this.name = "DocumentUnavailableError"; }
}

export function reconstructDocument(state: PersistedDocumentState): Yjs.Doc {
  const document = new Yjs.Doc();
  if (state.snapshot !== null) Yjs.applyUpdate(document, state.snapshot.state);
  for (const update of state.updates) Yjs.applyUpdate(document, update.update);
  return document;
}

interface MemoryRecord {
  active: boolean;
  snapshot: { sequence: bigint; state: Uint8Array } | null;
  updates: Array<PersistedUpdate & { hash: string }>;
}

export class InMemoryCollaborationPersistence implements CollaborationPersistence {
  private readonly records = new Map<string, MemoryRecord>();

  createDocument(documentId: string): void {
    this.records.set(documentId, { active: true, snapshot: null, updates: [] });
  }

  deleteDocument(documentId: string): void {
    const record = this.records.get(documentId);
    if (record !== undefined) record.active = false;
  }

  load(documentId: string): Promise<PersistedDocumentState> {
    const record = this.require(documentId);
    return Promise.resolve({ snapshot: cloneSnapshot(record.snapshot), updates: record.updates.map(({ sequence, update }) => ({ sequence, update: update.slice() })) });
  }

  storeUpdate(input: PersistUpdateInput): Promise<StoredUpdate> {
    const record = this.require(input.documentId);
    const updateHash = createHash("sha256").update(input.update).digest("hex");
    const existing = record.updates.find(({ hash }) => hash === updateHash);
    if (existing !== undefined) return Promise.resolve({ sequence: existing.sequence, duplicate: true });
    const sequence = maxSequence(record) + 1n;
    record.updates.push({ sequence, update: input.update.slice(), hash: updateHash });
    return Promise.resolve({ sequence, duplicate: false });
  }

  compact(documentId: string): Promise<CompactionResult> {
    const record = this.require(documentId);
    if (record.updates.length === 0) return Promise.resolve({ compacted: false, sequence: record.snapshot?.sequence ?? 0n, removedUpdates: 0 });
    const document = reconstructDocument({ snapshot: record.snapshot, updates: record.updates });
    const sequence = record.updates.at(-1)!.sequence;
    const durableSnapshot = { sequence, state: Yjs.encodeStateAsUpdate(document) };
    record.snapshot = durableSnapshot;
    const removedUpdates = record.updates.filter((update) => update.sequence <= durableSnapshot.sequence).length;
    record.updates = record.updates.filter((update) => update.sequence > durableSnapshot.sequence);
    document.destroy();
    return Promise.resolve({ compacted: true, sequence, removedUpdates });
  }

  private require(documentId: string): MemoryRecord {
    const record = this.records.get(documentId);
    if (record === undefined || !record.active) throw new DocumentUnavailableError();
    return record;
  }
}

function maxSequence(record: MemoryRecord): bigint {
  const updateSequence = record.updates.at(-1)?.sequence ?? 0n;
  const snapshotSequence = record.snapshot?.sequence ?? 0n;
  return updateSequence > snapshotSequence ? updateSequence : snapshotSequence;
}

function cloneSnapshot(snapshot: MemoryRecord["snapshot"]): MemoryRecord["snapshot"] {
  return snapshot === null ? null : { sequence: snapshot.sequence, state: snapshot.state.slice() };
}
