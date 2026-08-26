import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Y from "yjs";
import {
  DocumentReloadRequiredError,
  InMemoryCollaborationPersistence,
  reconstructDocument,
  type PersistedDocumentState,
} from "./persistence.js";
import { deriveDocumentProjection } from "./projection.js";

const documentId = "11111111-1111-4111-8111-111111111111";

describe("durable Yjs state", () => {
  it("reconstructs from a snapshot followed by ordered updates", () => {
    const source = new Y.Doc();
    source.getText("content").insert(0, "snapshot");
    const snapshot = Y.encodeStateAsUpdate(source);
    let incremental: Uint8Array = new Uint8Array();
    source.once("update", (update: Uint8Array) => {
      incremental = update;
    });
    source.getText("content").insert(8, "+update");
    const state: PersistedDocumentState = {
      sequence: 5n,
      snapshot: { sequence: 4n, state: snapshot },
      updates: [{ sequence: 5n, update: incremental }],
    };
    const recovered = reconstructDocument(state);
    assert.equal(recovered.getText("content").toString(), "snapshot+update");
  });

  it("treats duplicate update delivery as an idempotent success", async () => {
    const persistence = new InMemoryCollaborationPersistence();
    persistence.createDocument(documentId);
    const document = new Y.Doc();
    document.getText("content").insert(0, "once");
    const update = Y.encodeStateAsUpdate(document);
    const input = {
      documentId,
      actorUserId: "user",
      update,
      document,
      projection: deriveDocumentProjection(document),
      baseSequence: 0n,
    };
    const first = await persistence.storeUpdate(input);
    const duplicate = await persistence.storeUpdate(input);
    assert.deepEqual(first, { sequence: 1n, duplicate: false });
    assert.deepEqual(duplicate, { sequence: 1n, duplicate: true });
    assert.equal((await persistence.load(documentId)).updates.length, 1);
  });

  it("makes a complete snapshot before removing covered updates", async () => {
    const persistence = new InMemoryCollaborationPersistence();
    persistence.createDocument(documentId);
    const document = new Y.Doc();
    let update = captureUpdate(document, () => document.getText("content").insert(0, "A"));
    await persistence.storeUpdate({
      documentId,
      actorUserId: "user",
      update,
      document,
      projection: deriveDocumentProjection(document),
      baseSequence: 0n,
    });
    update = captureUpdate(document, () => document.getText("content").insert(1, "B"));
    await persistence.storeUpdate({
      documentId,
      actorUserId: "user",
      update,
      document,
      projection: deriveDocumentProjection(document),
      baseSequence: 1n,
    });
    const compacted = await persistence.compact(documentId);
    const compactedState = await persistence.load(documentId);
    assert.deepEqual(compacted, { compacted: true, sequence: 2n, removedUpdates: 2 });
    assert.equal(compactedState.snapshot?.sequence, 2n);
    assert.equal(compactedState.updates.length, 0);
    assert.equal(reconstructDocument(compactedState).getText("content").toString(), "AB");

    update = captureUpdate(document, () => document.getText("content").insert(2, "C"));
    await persistence.storeUpdate({
      documentId,
      actorUserId: "user",
      update,
      document,
      projection: deriveDocumentProjection(document),
      baseSequence: 2n,
    });
    const cold = reconstructDocument(await persistence.load(documentId));
    assert.equal(cold.getText("content").toString(), "ABC");
  });

  it("rejects a stale room sequence instead of overwriting externally restored state", async () => {
    const persistence = new InMemoryCollaborationPersistence();
    persistence.createDocument(documentId);
    const document = new Y.Doc();
    const firstUpdate = captureUpdate(document, () => document.getText("content").insert(0, "A"));
    await persistence.storeUpdate({
      documentId,
      actorUserId: "user",
      update: firstUpdate,
      document,
      projection: deriveDocumentProjection(document),
      baseSequence: 0n,
    });
    const staleUpdate = captureUpdate(document, () => document.getText("content").insert(1, "B"));

    assert.throws(
      () =>
        persistence.storeUpdate({
          documentId,
          actorUserId: "user",
          update: staleUpdate,
          document,
          projection: deriveDocumentProjection(document),
          baseSequence: 0n,
        }),
      DocumentReloadRequiredError,
    );
  });

  it("derives a normalized projection rather than client HTML", () => {
    const document = new Y.Doc();
    document.getArray("blocks").push([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        text: "Safe heading",
        html: "<script>alert(1)</script>",
      },
      { id: "task-1", type: "task", text: "Ship it", checked: true },
    ]);
    const projection = deriveDocumentProjection(document);
    assert.equal(projection.blocks.length, 2);
    assert.equal(projection.plainText, "Safe heading\nShip it");
    assert.equal(JSON.stringify(projection).includes("script"), false);
  });
});

function captureUpdate(document: Y.Doc, operation: () => void): Uint8Array {
  let captured: Uint8Array = new Uint8Array();
  document.once("update", (update: Uint8Array) => {
    captured = update;
  });
  operation();
  return captured;
}
