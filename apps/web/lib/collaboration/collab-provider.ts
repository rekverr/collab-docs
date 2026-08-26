import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MAX_RECONNECT_DELAY_MS = 10_000;

export type CollaborationConnectionState =
  "connecting" | "connected" | "reconnecting" | "offline" | "permission-revoked" | "deleted";

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  color: string;
}

interface CollaborationProviderOptions {
  document: Y.Doc;
  documentId: string;
  url: string;
  user: CollaborationUser;
  readOnly: boolean;
  getAccessToken(): Promise<string>;
}

type StateListener = (state: CollaborationConnectionState) => void;

export class CollabWebSocketProvider {
  readonly awareness: awarenessProtocol.Awareness;

  private socket: WebSocket | null = null;
  private state: CollaborationConnectionState = "connecting";
  private readonly stateListeners = new Set<StateListener>();
  private reconnectAttempt = 0;
  private serverStateRequested = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(private readonly options: CollaborationProviderOptions) {
    this.awareness = new awarenessProtocol.Awareness(options.document);
    this.awareness.setLocalStateField("user", options.user);
    options.document.on("update", this.handleDocumentUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  connect(): void {
    if (this.destroyed || this.isTerminal() || this.socket !== null) return;
    this.setState(this.reconnectAttempt === 0 ? "connecting" : "reconnecting");

    const socket = new WebSocket(this.options.url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.serverStateRequested = false;

    socket.addEventListener("open", () => {
      void this.authenticate(socket);
    });
    socket.addEventListener("message", (event) => this.handleMessage(socket, event));
    socket.addEventListener("close", (event) => this.handleClose(socket, event));
    socket.addEventListener("error", () => {
      // The close event drives reconnect behavior without exposing token-bearing details.
    });
  }

  getState(): CollaborationConnectionState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    this.options.document.off("update", this.handleDocumentUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    this.awareness.setLocalState(null);
    this.socket?.close(1000, "Document navigation");
    this.socket = null;
    this.awareness.destroy();
    this.stateListeners.clear();
  }

  private async authenticate(socket: WebSocket): Promise<void> {
    try {
      const accessToken = await this.options.getAccessToken();
      if (this.destroyed || this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "auth",
          documentId: this.options.documentId,
          accessToken,
        }),
      );
    } catch {
      if (this.socket === socket) socket.close(4401, "Authentication failed");
    }
  }

  private handleMessage(socket: WebSocket, event: MessageEvent<unknown>): void {
    if (this.socket !== socket || !(event.data instanceof ArrayBuffer)) return;
    try {
      const decoder = decoding.createDecoder(new Uint8Array(event.data));
      const messageType = decoding.readVarUint(decoder);
      if (messageType === MESSAGE_SYNC) {
        const syncTypeDecoder = decoding.createDecoder(new Uint8Array(event.data));
        decoding.readVarUint(syncTypeDecoder);
        const syncType = decoding.readVarUint(syncTypeDecoder);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.options.document, this);
        if (
          encoding.length(encoder) > 1 &&
          socket.readyState === WebSocket.OPEN &&
          !(this.options.readOnly && syncType === 0)
        ) {
          socket.send(encoding.toUint8Array(encoder));
        }
        if (!this.serverStateRequested && socket.readyState === WebSocket.OPEN) {
          this.serverStateRequested = true;
          const stateVector = encoding.createEncoder();
          encoding.writeVarUint(stateVector, MESSAGE_SYNC);
          syncProtocol.writeSyncStep1(stateVector, this.options.document);
          socket.send(encoding.toUint8Array(stateVector));
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this,
        );
      } else {
        socket.close(1003, "Unsupported collaboration message");
        return;
      }

      if (this.state !== "connected") {
        this.reconnectAttempt = 0;
        this.setState("connected");
        this.sendCurrentAwareness();
      }
    } catch {
      socket.close(1003, "Invalid collaboration message");
    }
  }

  private readonly handleDocumentUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || this.options.readOnly) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.send(encoding.toUint8Array(encoder));
  };

  private readonly handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return;
    const clients = [...changes.added, ...changes.updated, ...changes.removed];
    if (clients.length === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients),
    );
    this.send(encoding.toUint8Array(encoder));
  };

  private handleClose(socket: WebSocket, event: CloseEvent): void {
    if (this.socket !== socket) return;
    this.socket = null;
    if (this.destroyed) return;

    const nextState = connectionStateFromClose(event.code, navigator.onLine);
    this.setState(nextState);
    if (nextState === "permission-revoked" || nextState === "deleted") return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer !== null || !navigator.onLine) return;
    const delay = Math.min(500 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private readonly handleOnline = (): void => {
    if (this.destroyed || this.isTerminal()) return;
    this.setState("reconnecting");
    this.scheduleReconnect();
  };

  private readonly handleOffline = (): void => {
    if (!this.isTerminal()) this.setState("offline");
  };

  private sendCurrentAwareness(): void {
    const clientIds = [...this.awareness.getStates().keys()];
    if (clientIds.length === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, clientIds),
    );
    this.send(encoding.toUint8Array(encoder));
  }

  private send(message: Uint8Array): void {
    if (this.socket?.readyState === WebSocket.OPEN && this.state === "connected") {
      this.socket.send(message);
    }
  }

  private setState(state: CollaborationConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private isTerminal(): boolean {
    return this.state === "permission-revoked" || this.state === "deleted";
  }
}

export function connectionStateFromClose(
  closeCode: number,
  online: boolean,
): CollaborationConnectionState {
  if (closeCode === 4403) return "permission-revoked";
  if (closeCode === 4404) return "deleted";
  return online ? "reconnecting" : "offline";
}

export function collaboratorColor(userId: string): string {
  const palette = ["#2563eb", "#7c3aed", "#c2410c", "#047857", "#be123c", "#0369a1"] as const;
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length] ?? "#2563eb";
}

export function isSafeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
