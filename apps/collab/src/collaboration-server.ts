import { createServer, type Server as HttpServer } from "node:http";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import { AuthorizationFailure, type CollaborationAuthorizer, type CollaborationIdentity } from "./authorization.js";
import type { StructuredLogger } from "./logger.js";
import { CollaborationMetrics } from "./metrics.js";
import type { CollaborationPersistence } from "./persistence.js";

const messageSync = 0;
const messageAwareness = 1;
const syncStep2 = 1;
const syncUpdate = 2;

interface AuthMessage { type: "auth"; documentId: string; accessToken: string }
interface ConnectionState {
  identity: CollaborationIdentity;
  accessToken: string;
  room: CollaborationRoom;
  awarenessClientIds: Set<number>;
  recheckTimer?: NodeJS.Timeout;
}

interface CollaborationRoom {
  documentId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Map<WebSocket, ConnectionState>;
}

export interface CollaborationServerOptions {
  port: number;
  host?: string;
  authenticationTimeoutMs?: number;
  authorizationRecheckMs?: number;
  maxMessageBytes?: number;
}

export class CollaborationServer {
  readonly metrics = new CollaborationMetrics();
  private readonly rooms = new Map<string, CollaborationRoom>();
  private readonly pendingRooms = new Map<string, Promise<CollaborationRoom>>();
  private readonly http: HttpServer;
  private readonly sockets: WebSocketServer;

  constructor(
    private readonly options: CollaborationServerOptions,
    private readonly authorizer: CollaborationAuthorizer,
    private readonly persistence: CollaborationPersistence,
    private readonly logger: StructuredLogger,
  ) {
    this.http = createServer((request, response) => {
      if (request.url === "/health") { response.writeHead(200, { "content-type": "application/json" }); response.end('{"status":"ok"}'); return; }
      if (request.url === "/metrics") { response.writeHead(200, { "content-type": "text/plain; version=0.0.4" }); response.end(this.metrics.render()); return; }
      response.writeHead(404); response.end();
    });
    this.sockets = new WebSocketServer({ server: this.http, maxPayload: options.maxMessageBytes ?? 1024 * 1024 });
    this.sockets.on("connection", (socket) => this.handleConnection(socket));
  }

  async start(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(this.options.port, this.options.host ?? "0.0.0.0", () => { this.http.off("error", reject); resolve(); });
    });
    const address = this.http.address();
    if (address === null || typeof address === "string") throw new Error("Collaboration server did not bind a TCP port");
    this.logger.event("info", "collab_listening", { port: address.port });
    return address.port;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets.clients) socket.close(1001, "Server shutting down");
    for (const room of this.rooms.values()) this.destroyRoom(room);
    await new Promise<void>((resolve) => this.sockets.close(() => resolve()));
    if (this.http.listening) await new Promise<void>((resolve, reject) => this.http.close((error) => error === undefined ? resolve() : reject(error)));
  }

  terminateDocument(documentId: string, reason = "Document access revoked"): void {
    const room = this.rooms.get(documentId);
    if (room === undefined) return;
    for (const socket of room.connections.keys()) socket.close(4403, reason);
  }

  activeRoomCount(): number { return this.rooms.size; }

  private handleConnection(socket: WebSocket): void {
    this.metrics.connectionsTotal += 1;
    this.metrics.activeConnections += 1;
    let state: ConnectionState | undefined;
    let closed = false;
    let authenticating = false;
    const authTimer = setTimeout(() => this.fail(socket, 4401, "Authentication required", "auth_timeout"), this.options.authenticationTimeoutMs ?? 5000);

    socket.on("message", (data, isBinary) => {
      if (state === undefined) {
        if (authenticating) { this.protocolFailure(socket, "duplicate_auth_message"); return; }
        if (isBinary) { this.protocolFailure(socket, "binary_before_auth"); return; }
        authenticating = true;
        void this.authenticate(socket, rawData(data), authTimer).then((authenticated) => { if (!closed && authenticated !== undefined) state = authenticated; });
        return;
      }
      if (!isBinary) { this.protocolFailure(socket, "text_after_auth"); return; }
      this.handleProtocolMessage(socket, state, rawData(data));
    });
    socket.on("error", () => { this.logger.event("warn", "collab_socket_error"); });
    socket.on("close", (code) => {
      closed = true;
      clearTimeout(authTimer);
      this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
      this.metrics.disconnectsTotal += 1;
      if (state !== undefined) this.leaveRoom(socket, state);
      this.logger.event("info", "collab_disconnect", { code, authenticated: state !== undefined });
    });
  }

  private async authenticate(socket: WebSocket, bytes: Uint8Array, authTimer: NodeJS.Timeout): Promise<ConnectionState | undefined> {
    let message: AuthMessage;
    try { message = parseAuthMessage(new TextDecoder().decode(bytes)); }
    catch { this.protocolFailure(socket, "invalid_auth_message"); return undefined; }
    try {
      const identity = await this.authorizer.authorize(message.accessToken, message.documentId);
      if (socket.readyState !== WebSocket.OPEN) return undefined;
      const room = await this.getRoom(message.documentId);
      if (socket.readyState !== WebSocket.OPEN) { if (room.connections.size === 0) this.destroyRoom(room); return undefined; }
      const state: ConnectionState = { identity, accessToken: message.accessToken, room, awarenessClientIds: new Set() };
      room.connections.set(socket, state);
      clearTimeout(authTimer);
      this.sendInitialState(socket, room);
      this.scheduleAuthorizationRecheck(socket, state);
      this.logger.event("info", "collab_connected", { documentId: message.documentId, userId: identity.userId, canWrite: identity.canWrite, activeRooms: this.rooms.size });
      return state;
    } catch (error: unknown) {
      if (error instanceof AuthorizationFailure && error.kind === "authentication") {
        this.metrics.authFailuresTotal += 1; this.fail(socket, 4401, "Authentication failed", "auth_failure");
      } else if (error instanceof AuthorizationFailure && error.kind === "permission") {
        this.metrics.permissionFailuresTotal += 1; this.fail(socket, 4403, "Document access denied", "permission_failure");
      } else {
        this.fail(socket, 1013, "Authorization temporarily unavailable", "authorization_unavailable");
      }
      return undefined;
    }
  }

  private handleProtocolMessage(socket: WebSocket, state: ConnectionState, bytes: Uint8Array): void {
    try {
      const inspect = decoding.createDecoder(bytes);
      const type = decoding.readVarUint(inspect);
      if (type === messageSync) {
        const syncType = decoding.readVarUint(inspect);
        const viewerWrite = !state.identity.canWrite && (syncType === syncUpdate || (syncType === syncStep2 && !isEmptySyncStep2(inspect)));
        if (viewerWrite) {
          this.metrics.rejectedWritesTotal += 1;
          this.logger.event("warn", "collab_write_rejected", { documentId: state.identity.documentId, userId: state.identity.userId });
          socket.close(4403, "Document is read-only");
          return;
        }
        const decoder = decoding.createDecoder(bytes);
        decoding.readVarUint(decoder);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, state.room.doc, state);
        if (encoding.length(encoder) > 1) socket.send(encoding.toUint8Array(encoder));
        return;
      }
      if (type === messageAwareness) {
        const update = sanitizeAwarenessUpdate(decoding.readVarUint8Array(inspect), state);
        awarenessProtocol.applyAwarenessUpdate(state.room.awareness, update, state);
        return;
      }
      throw new Error("unknown message type");
    } catch {
      this.protocolFailure(socket, "invalid_protocol_message");
    }
  }

  private async getRoom(documentId: string): Promise<CollaborationRoom> {
    const existing = this.rooms.get(documentId);
    if (existing !== undefined) return existing;
    const pending = this.pendingRooms.get(documentId);
    if (pending !== undefined) return pending;
    const creation = this.createRoom(documentId);
    this.pendingRooms.set(documentId, creation);
    try { return await creation; } finally { this.pendingRooms.delete(documentId); }
  }

  private async createRoom(documentId: string): Promise<CollaborationRoom> {
    const doc = new Y.Doc();
    for (const update of await this.persistence.load(documentId)) Y.applyUpdate(doc, update, "persistence-load");
    const awareness = new awarenessProtocol.Awareness(doc);
    const room: CollaborationRoom = { documentId, doc, awareness, connections: new Map() };
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "persistence-load") return;
      void this.persistence.storeUpdate(documentId, update).catch(() => this.logger.event("error", "collab_persistence_failure", { documentId }));
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, messageSync); syncProtocol.writeUpdate(encoder, update);
      this.broadcast(room, encoding.toUint8Array(encoder));
    });
    awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const clients = [...added, ...updated, ...removed];
      if (clients.length === 0) return;
      if (isConnectionState(origin)) {
        for (const id of [...added, ...updated]) origin.awarenessClientIds.add(id);
        for (const id of removed) origin.awarenessClientIds.delete(id);
      }
      const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients));
      this.broadcast(room, encoding.toUint8Array(encoder));
    });
    this.rooms.set(documentId, room);
    this.metrics.activeRooms = this.rooms.size;
    this.logger.event("info", "collab_room_opened", { documentId, activeRooms: this.rooms.size });
    return room;
  }

  private sendInitialState(socket: WebSocket, room: CollaborationRoom): void {
    const sync = encoding.createEncoder(); encoding.writeVarUint(sync, messageSync); syncProtocol.writeSyncStep1(sync, room.doc); socket.send(encoding.toUint8Array(sync));
    const clients = [...room.awareness.getStates().keys()];
    if (clients.length > 0) {
      const awareness = encoding.createEncoder(); encoding.writeVarUint(awareness, messageAwareness);
      encoding.writeVarUint8Array(awareness, awarenessProtocol.encodeAwarenessUpdate(room.awareness, clients)); socket.send(encoding.toUint8Array(awareness));
    }
  }

  private broadcast(room: CollaborationRoom, message: Uint8Array): void {
    for (const socket of room.connections.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }

  private leaveRoom(socket: WebSocket, state: ConnectionState): void {
    if (state.recheckTimer !== undefined) clearInterval(state.recheckTimer);
    state.room.connections.delete(socket);
    if (state.awarenessClientIds.size > 0) awarenessProtocol.removeAwarenessStates(state.room.awareness, [...state.awarenessClientIds], state);
    if (state.room.connections.size === 0) this.destroyRoom(state.room);
  }

  private destroyRoom(room: CollaborationRoom): void {
    if (!this.rooms.delete(room.documentId)) return;
    void this.persistence.roomClosed?.(room.documentId, room.doc);
    room.awareness.destroy(); room.doc.destroy();
    this.metrics.activeRooms = this.rooms.size;
    this.logger.event("info", "collab_room_closed", { documentId: room.documentId, activeRooms: this.rooms.size });
  }

  private scheduleAuthorizationRecheck(socket: WebSocket, state: ConnectionState): void {
    const interval = this.options.authorizationRecheckMs ?? 30_000;
    if (interval <= 0) return;
    state.recheckTimer = setInterval(() => {
      void this.authorizer.authorize(state.accessToken, state.identity.documentId).then((identity) => {
        if (identity.userId !== state.identity.userId) socket.close(4403, "Document access revoked");
        else state.identity = identity;
      }).catch(() => socket.close(4403, "Document access revoked"));
    }, interval);
  }

  private protocolFailure(socket: WebSocket, reason: string): void {
    this.metrics.protocolFailuresTotal += 1;
    this.fail(socket, 1003, "Invalid collaboration protocol", reason);
  }

  private fail(socket: WebSocket, code: number, message: string, event: string): void {
    this.logger.event("warn", event);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(code, message);
  }
}

function parseAuthMessage(value: string): AuthMessage {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("invalid auth message");
  const type: unknown = Reflect.get(parsed, "type");
  const documentId: unknown = Reflect.get(parsed, "documentId");
  const accessToken: unknown = Reflect.get(parsed, "accessToken");
  if (type !== "auth" || typeof documentId !== "string" || typeof accessToken !== "string" || documentId.length > 128 || accessToken.length > 4096) {
    throw new Error("invalid auth message");
  }
  return { type, documentId, accessToken };
}

function rawData(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function isConnectionState(value: unknown): value is ConnectionState {
  return typeof value === "object" && value !== null && Reflect.get(value, "awarenessClientIds") instanceof Set;
}

function isEmptySyncStep2(decoder: decoding.Decoder): boolean {
  try {
    const update = decoding.readVarUint8Array(decoder);
    const decoded = Y.decodeUpdate(update);
    return decoded.structs.length === 0 && decoded.ds.clients.size === 0;
  } catch { return false; }
}

function sanitizeAwarenessUpdate(update: Uint8Array, state: ConnectionState): Uint8Array {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  if (count > 16 || state.awarenessClientIds.size + count > 16) throw new Error("too many awareness clients");
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, count);
  for (let index = 0; index < count; index += 1) {
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const rawState = decoding.readVarString(decoder);
    for (const connection of state.room.connections.values()) {
      if (connection !== state && connection.awarenessClientIds.has(clientId)) throw new Error("awareness client belongs to another connection");
    }
    const parsed: unknown = JSON.parse(rawState);
    let sanitized: string;
    if (parsed === null) sanitized = "null";
    else {
      if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid awareness state");
      sanitized = JSON.stringify(Object.assign({}, parsed, {
        user: { id: state.identity.userId, email: state.identity.email, displayName: state.identity.displayName },
      }));
    }
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarString(encoder, sanitized);
  }
  return encoding.toUint8Array(encoder);
}
