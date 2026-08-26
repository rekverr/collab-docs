import type * as Y from "yjs";

export interface CollaborationPersistence {
  load(documentId: string): Promise<readonly Uint8Array[]>;
  storeUpdate(documentId: string, update: Uint8Array): Promise<void>;
  roomClosed?(documentId: string, document: Y.Doc): Promise<void>;
}

export class NoopCollaborationPersistence implements CollaborationPersistence {
  load(): Promise<readonly Uint8Array[]> { return Promise.resolve([]); }
  storeUpdate(): Promise<void> { return Promise.resolve(); }
}
