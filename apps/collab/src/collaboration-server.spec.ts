import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { WebSocket, type RawData } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import {
  AuthorizationFailure,
  type CollaborationAuthorizer,
  type CollaborationIdentity,
} from "./authorization.js";
import { CollaborationServer } from "./collaboration-server.js";
import type { StructuredLogger } from "./logger.js";
import { InMemoryCollaborationPersistence } from "./persistence.js";

const documentId = "11111111-1111-4111-8111-111111111111";
const editor: CollaborationIdentity = {
  documentId,
  userId: "editor",
  email: "editor@example.com",
  displayName: "Editor",
  canWrite: true,
};
const viewer: CollaborationIdentity = {
  documentId,
  userId: "viewer",
  email: "viewer@example.com",
  displayName: "Viewer",
  canWrite: false,
};

class FakeAuthorizer implements CollaborationAuthorizer {
  constructor(private readonly identities: Readonly<Record<string, CollaborationIdentity>>) {}
  authorize(token: string, requestedDocumentId: string): Promise<CollaborationIdentity> {
    const identity = this.identities[token];
    if (identity === undefined || identity.documentId !== requestedDocumentId)
      return Promise.reject(new AuthorizationFailure("permission", "denied"));
    return Promise.resolve(identity);
  }
}

class MemoryPersistence extends InMemoryCollaborationPersistence {
  constructor() {
    super();
    this.createDocument(documentId);
  }
}

const silentLogger: StructuredLogger = { event: () => undefined };
const servers: CollaborationServer[] = [];
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  for (const server of servers.splice(0)) await server.stop();
});

async function start(
  identities: Readonly<Record<string, CollaborationIdentity>>,
): Promise<{ server: CollaborationServer; url: string }> {
  const server = new CollaborationServer(
    { port: 0, host: "127.0.0.1", authenticationTimeoutMs: 1000, authorizationRecheckMs: 0 },
    new FakeAuthorizer(identities),
    new MemoryPersistence(),
    silentLogger,
  );
  servers.push(server);
  const port = await server.start();
  return { server, url: `ws://127.0.0.1:${port}` };
}

async function connect(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  clients.push(socket);
  await onceOpen(socket);
  return socket;
}

function authenticate(socket: WebSocket, token: string): void {
  socket.send(JSON.stringify({ type: "auth", documentId, accessToken: token }));
}

describe("authenticated Yjs collaboration", () => {
  it("accepts an authorized connection", async () => {
    const { server, url } = await start({ valid: editor });
    const socket = await connect(url);
    const initial = onceBinaryMessage(socket);
    authenticate(socket, "valid");
    await initial;
    assert.equal(server.activeRoomCount(), 1);
    assert.equal(server.metrics.activeConnections, 1);
  });

  it("rejects an unauthorized connection before room join", async () => {
    const { server, url } = await start({});
    const socket = await connect(url);
    const closed = onceClose(socket);
    authenticate(socket, "invalid");
    const code = await closed;
    assert.equal(code, 4403);
    assert.equal(server.activeRoomCount(), 0);
    assert.equal(server.metrics.permissionFailuresTotal, 1);
  });

  it("rejects a Viewer Yjs write", async () => {
    const { server, url } = await start({ viewer });
    const socket = await connect(url);
    const initial = onceBinaryMessage(socket);
    authenticate(socket, "viewer");
    await initial;
    const clientDocument = new Y.Doc();
    clientDocument.getText("content").insert(0, "not allowed");
    socket.send(syncUpdateMessage(Y.encodeStateAsUpdate(clientDocument)));
    const code = await onceClose(socket);
    assert.equal(code, 4403);
    assert.equal(server.metrics.rejectedWritesTotal, 1);
  });

  it("places two clients in one room and synchronizes a Yjs update", async () => {
    const { server, url } = await start({
      first: editor,
      second: { ...editor, userId: "editor-2", email: "second@example.com" },
    });
    const first = await connect(url);
    const second = await connect(url);
    const firstInitial = onceBinaryMessage(first);
    const secondInitial = onceBinaryMessage(second);
    authenticate(first, "first");
    authenticate(second, "second");
    await Promise.all([firstInitial, secondInitial]);
    const source = new Y.Doc();
    source.getText("content").insert(0, "concurrent-safe");
    const received = onceBinaryMessage(second);
    first.send(syncUpdateMessage(Y.encodeStateAsUpdate(source)));
    const target = new Y.Doc();
    applySyncMessage(target, await received);
    assert.equal(target.getText("content").toString(), "concurrent-safe");
    assert.equal(server.activeRoomCount(), 1);
  });
});

function syncUpdateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function applySyncMessage(document: Y.Doc, message: Uint8Array): void {
  const decoder = decoding.createDecoder(message);
  assert.equal(decoding.readVarUint(decoder), 0);
  syncProtocol.readSyncMessage(decoder, encoding.createEncoder(), document, null);
}

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function onceBinaryMessage(socket: WebSocket): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data, isBinary) =>
      isBinary ? resolve(bytes(data)) : reject(new Error("Expected binary message")),
    );
    socket.once("error", reject);
  });
}

function bytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function onceClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", (code) => resolve(code)));
}
