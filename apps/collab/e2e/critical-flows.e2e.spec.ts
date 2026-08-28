import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { WebSocket, type RawData } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import { ApiCollaborationAuthorizer } from "../src/authorization.js";
import { CollaborationServer } from "../src/collaboration-server.js";
import { BullMqProjectionPublisher } from "../src/downstream.js";
import type { StructuredLogger } from "../src/logger.js";
import { PrismaCollaborationPersistence } from "../src/prisma-persistence.js";

interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; displayName: string | null };
}

interface WorkspaceResponse {
  id: string;
}

interface InvitationResponse {
  id: string;
}

interface PendingInvitationResponse {
  id: string;
  workspaceId: string;
  role: string;
  workspace: { name: string };
}

interface DocumentResponse {
  id: string;
  title: string;
}

interface PublicationResponse {
  publicSlug: string | null;
}

interface WebhookResponse {
  applied: boolean;
  subscription: { plan: string };
}

interface ShareLinkResponse {
  id: string;
  url: string | null;
}

const databaseUrl = requireIsolatedDatabaseUrl();
const redisUrl = requireIsolatedRedisUrl();
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
const logger: StructuredLogger = { event: () => undefined };
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

let apiApplication: Awaited<
  ReturnType<typeof import("../../api/src/bootstrap.js").createApiApplication>
>;
let apiUrl = "";
let webUrl = "";
let webProcess: ChildProcess | undefined;
let collabServer: CollaborationServer | undefined;
let collabUrl = "";
let owner!: AuthResponse;
let viewer!: AuthResponse;
let workspace!: WorkspaceResponse;
let document!: DocumentResponse;

describe("critical assessment flows", { concurrency: false }, () => {
  before(async () => {
    const [apiPort, webPort] = await Promise.all([availablePort(), availablePort()]);
    apiUrl = `http://127.0.0.1:${apiPort}`;
    webUrl = `http://127.0.0.1:${webPort}`;
    configureApiEnvironment(apiPort, apiUrl, webUrl);

    await prisma.$connect();
    await redis.connect();
    await resetIsolatedState();

    const createApiApplication = await loadBuiltApiFactory();
    apiApplication = await createApiApplication({ enableSwagger: false });
    await apiApplication.listen(apiPort, "127.0.0.1");

    webProcess = startWeb(webPort, apiUrl);
    await waitForHttp(`${webUrl}/`, 60_000);

    collabServer = createCollaborationServer(apiUrl);
    const collabPort = await collabServer.start();
    collabUrl = `ws://127.0.0.1:${collabPort}`;
  });

  after(async () => {
    await collabServer?.stop();
    await apiApplication?.close();
    await stopProcess(webProcess);
    if (redis.status !== "end") await redis.quit();
    await prisma.$disconnect();
  });

  it("enforces Viewer read-only access through REST and collaboration WebSocket", async () => {
    owner = await register("owner.e2e@example.com", "Assessment Owner");
    viewer = await register("viewer.e2e@example.com", "Assessment Viewer");
    workspace = await api<WorkspaceResponse>("/workspaces", {
      token: owner.accessToken,
      method: "POST",
      body: { name: "Assessment Workspace", slug: "assessment-e2e" },
    });
    document = await api<DocumentResponse>(`/workspaces/${workspace.id}/documents`, {
      token: owner.accessToken,
      method: "POST",
      body: { title: "Collaborative assessment" },
    });
    const invitation = await api<InvitationResponse>(`/workspaces/${workspace.id}/invitations`, {
      token: owner.accessToken,
      method: "POST",
      body: { email: viewer.user.email, role: "VIEWER" },
    });

    const pendingInvitations = await api<PendingInvitationResponse[]>(
      "/workspace-invitations/pending",
      { token: viewer.accessToken },
    );
    assert.deepEqual(
      pendingInvitations.map(({ id, workspaceId, role, workspace: pendingWorkspace }) => ({
        id,
        workspaceId,
        role,
        workspaceName: pendingWorkspace.name,
      })),
      [
        {
          id: invitation.id,
          workspaceId: workspace.id,
          role: "VIEWER",
          workspaceName: "Assessment Workspace",
        },
      ],
    );

    await api(`/workspace-invitations/${invitation.id}/accept`, {
      token: viewer.accessToken,
      method: "POST",
    });
    assert.deepEqual(
      await api<PendingInvitationResponse[]>("/workspace-invitations/pending", {
        token: viewer.accessToken,
      }),
      [],
    );
    assert.equal(
      (
        await api<Array<WorkspaceResponse & { role: string }>>("/workspaces", {
          token: viewer.accessToken,
        })
      ).some(({ id, role }) => id === workspace.id && role === "VIEWER"),
      true,
    );

    const readable = await api<DocumentResponse>(`/documents/${document.id}`, {
      token: viewer.accessToken,
    });
    assert.equal(readable.id, document.id);

    const restMutation = await fetch(`${apiUrl}/documents/${document.id}`, {
      method: "PATCH",
      headers: jsonHeaders(viewer.accessToken),
      body: JSON.stringify({ title: "Viewer mutation" }),
    });
    assert.equal(restMutation.status, 403);

    const viewerSocket = await openSocket(collabUrl);
    const viewerInitialState = onceBinaryMessage(viewerSocket);
    viewerSocket.send(authMessage(viewer.accessToken, document.id));
    await viewerInitialState;
    const unauthorized = new Y.Doc();
    unauthorized.getText("content").insert(0, "must not persist");
    viewerSocket.send(syncUpdateMessage(Y.encodeStateAsUpdate(unauthorized)));
    assert.equal(await onceClose(viewerSocket), 4403);
    assert.equal(await prisma.yjsUpdate.count({ where: { documentId: document.id } }), 0);
    unauthorized.destroy();
  });

  it("merges two independent Yjs clients and restores the same state after a cold restart", async () => {
    const firstDocument = blocksDocument("alpha", "Alpha change");
    const secondDocument = blocksDocument("beta", "Beta change");
    const first = new YjsSocketClient(collabUrl, document.id, owner.accessToken, firstDocument);
    const second = new YjsSocketClient(collabUrl, document.id, owner.accessToken, secondDocument);
    await Promise.all([first.connect(), second.connect()]);
    await waitFor(
      () => blockTexts(first.doc).length === 2 && blockTexts(second.doc).length === 2,
      10_000,
      "concurrent Yjs clients did not converge",
    );
    assert.deepEqual(new Set(blockTexts(first.doc)), new Set(["Alpha change", "Beta change"]));
    assert.deepEqual(new Set(blockTexts(second.doc)), new Set(["Alpha change", "Beta change"]));
    first.close();
    second.close();

    await collabServer?.stop();
    collabServer = createCollaborationServer(apiUrl);
    const restartedPort = await collabServer.start();
    collabUrl = `ws://127.0.0.1:${restartedPort}`;

    const recovered = new YjsSocketClient(collabUrl, document.id, owner.accessToken, new Y.Doc());
    await recovered.connect();
    await waitFor(
      () => blockTexts(recovered.doc).length === 2,
      10_000,
      "cold-loaded client did not receive durable state",
    );
    assert.deepEqual(new Set(blockTexts(recovered.doc)), new Set(["Alpha change", "Beta change"]));
    recovered.close();
  });

  it("serves updated public SSR content after asynchronous revalidation", async () => {
    const publication = await api<PublicationResponse>(`/documents/${document.id}/publication`, {
      token: owner.accessToken,
      method: "POST",
      body: { published: true },
    });
    assert.notEqual(publication.publicSlug, null);
    const publicPath = `/p/${publication.publicSlug}`;
    const initialHtml = await requestHtml(`${webUrl}${publicPath}`);
    assert.match(initialHtml, /Alpha change/);
    assert.match(initialHtml, /Beta change/);

    const editor = new YjsSocketClient(collabUrl, document.id, owner.accessToken, new Y.Doc());
    await editor.connect();
    await waitFor(() => blockTexts(editor.doc).length === 2, 10_000, "editor did not synchronize");
    editor.doc
      .getArray("blocks")
      .push([{ id: "published-update", type: "paragraph", text: "Updated after publication" }]);
    await waitFor(
      async () =>
        (await prisma.document.findUnique({
          where: { id: document.id },
          select: { projectionSequence: true },
        }))!.projectionSequence >= 3n,
      10_000,
      "updated projection was not persisted",
    );

    await waitFor(
      async () =>
        (await requestHtml(`${webUrl}${publicPath}`)).includes("Updated after publication"),
      20_000,
      "public page was not refreshed",
    );
    const updatedHtml = await requestHtml(`${webUrl}${publicPath}`);
    assert.match(updatedHtml, /Updated after publication/);
    editor.close();
  });

  it("applies a duplicate billing event exactly once", async () => {
    const payload = {
      eventId: "evt_assessment_duplicate",
      eventType: "customer.subscription.updated",
      plan: "PRO",
    };
    const path = `/workspaces/${workspace.id}/billing/mock-webhook`;
    const first = await api<WebhookResponse>(path, {
      token: owner.accessToken,
      method: "POST",
      body: payload,
    });
    const duplicate = await api<WebhookResponse>(path, {
      token: owner.accessToken,
      method: "POST",
      body: payload,
    });

    assert.equal(first.applied, true);
    assert.equal(duplicate.applied, false);
    assert.equal(duplicate.subscription.plan, "PRO");
    assert.equal(await prisma.billingEvent.count({ where: { eventId: payload.eventId } }), 1);
  });

  it("serves and revokes a document-scoped view share link", async () => {
    const link = await api<ShareLinkResponse>(`/documents/${document.id}/share-links`, {
      token: owner.accessToken,
      method: "POST",
      body: { accessMode: "VIEW" },
    });
    assert.notEqual(link.url, null);
    const sharePath = new URL(link.url!).pathname;
    const html = await requestHtml(`${webUrl}${sharePath}`);
    assert.match(html, /Updated after publication/);
    assert.doesNotMatch(html, /Assessment Workspace/);
    assert.doesNotMatch(html, /owner\.e2e@example\.com/);

    await api(`/document-share-links/${link.id}`, {
      token: owner.accessToken,
      method: "DELETE",
    });
    const revoked = await fetch(`${webUrl}${sharePath}`);
    assert.equal(revoked.status, 404);
  });
});

function createCollaborationServer(internalApiUrl: string): CollaborationServer {
  const persistence = new PrismaCollaborationPersistence(
    prisma,
    new BullMqProjectionPublisher(redisUrl),
    { compactAfterUpdates: 50, versionEveryUpdates: 50 },
  );
  return new CollaborationServer(
    { port: 0, host: "127.0.0.1", authenticationTimeoutMs: 2_000 },
    new ApiCollaborationAuthorizer(internalApiUrl),
    persistence,
    logger,
  );
}

type CreateApiApplication = typeof import("../../api/src/bootstrap.js").createApiApplication;

async function loadBuiltApiFactory(): Promise<CreateApiApplication> {
  const builtBootstrapPath = "../../api/dist/bootstrap.js";
  const moduleValue: unknown = await import(builtBootstrapPath);
  if (typeof moduleValue !== "object" || moduleValue === null) {
    throw new Error("Compiled API bootstrap module is invalid");
  }
  const factory: unknown = Reflect.get(moduleValue, "createApiApplication");
  if (typeof factory !== "function") {
    throw new Error("Build apps/api before running the E2E suite");
  }
  return factory as CreateApiApplication;
}

class YjsSocketClient {
  readonly doc: Y.Doc;
  private socket: WebSocket | undefined;
  private readonly remoteOrigin = Symbol("remote-yjs-update");

  constructor(
    private readonly url: string,
    private readonly documentId: string,
    private readonly accessToken: string,
    document: Y.Doc,
  ) {
    this.doc = document;
  }

  async connect(): Promise<void> {
    const socket = await openSocket(this.url);
    this.socket = socket;
    let initialSyncReceived = false;
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        this.receive(bytes(data));
        initialSyncReceived = true;
      }
    });
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== this.remoteOrigin && socket.readyState === WebSocket.OPEN) {
        socket.send(syncUpdateMessage(update));
      }
    });
    socket.send(authMessage(this.accessToken, this.documentId));
    await waitFor(() => initialSyncReceived, 2_000, "Initial Yjs sync did not arrive");
    socket.send(syncStepOneMessage(this.doc));
  }

  close(): void {
    this.socket?.close();
    this.doc.destroy();
  }

  private receive(message: Uint8Array): void {
    const decoder = decoding.createDecoder(message);
    if (decoding.readVarUint(decoder) !== 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.readSyncMessage(decoder, encoder, this.doc, this.remoteOrigin);
    if (encoding.length(encoder) > 1 && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encoding.toUint8Array(encoder));
    }
  }
}

async function register(email: string, displayName: string): Promise<AuthResponse> {
  return api<AuthResponse>("/auth/register", {
    method: "POST",
    body: { email, displayName, password: "AssessmentPass123" },
  });
}

interface ApiOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? bearerHeaders(options.token) : jsonHeaders(options.token),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const body: unknown = response.status === 204 ? undefined : await response.json();
  assert.equal(
    response.ok,
    true,
    `${options.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(body)}`,
  );
  return body as T;
}

function bearerHeaders(token?: string): Record<string, string> {
  return token === undefined ? {} : { authorization: `Bearer ${token}` };
}

function jsonHeaders(token?: string): Record<string, string> {
  return { "content-type": "application/json", ...bearerHeaders(token) };
}

function authMessage(accessToken: string, documentId: string): string {
  return JSON.stringify({ type: "auth", accessToken, documentId });
}

function syncStepOneMessage(document: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, document);
  return encoding.toUint8Array(encoder);
}

function syncUpdateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function blocksDocument(id: string, text: string): Y.Doc {
  const result = new Y.Doc();
  result.getArray("blocks").push([{ id, type: "paragraph", text }]);
  return result;
}

function blockTexts(documentValue: Y.Doc): string[] {
  return documentValue
    .getArray<Record<string, unknown>>("blocks")
    .toArray()
    .map((block) => block.text)
    .filter((text): text is string => typeof text === "string");
}

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

function onceBinaryMessage(socket: WebSocket): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data, isBinary) =>
      isBinary ? resolve(bytes(data)) : reject(new Error("Expected binary WebSocket message")),
    );
    socket.once("error", reject);
  });
}

function onceClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", (code) => resolve(code)));
}

function bytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function requestHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200, `Expected ${url} to return a public page`);
  return response.text();
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not reserve a port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return address.port;
}

function startWeb(port: number, internalApiUrl: string): ChildProcess {
  const child = spawn(
    "pnpm",
    ["--filter", "@collab-docs/web", "exec", "next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        INTERNAL_API_URL: internalApiUrl,
        REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-8_000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-8_000);
  });
  child.once("exit", (code) => {
    if (code !== null && code !== 0)
      process.stderr.write(`Next.js E2E server exited ${code}:\n${output}\n`);
  });
  return child;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  await waitFor(
    async () => {
      try {
        return (await fetch(url)).status < 500;
      } catch {
        return false;
      }
    },
    timeoutMs,
    `Server did not become ready: ${url}`,
  );
}

async function stopProcess(processValue: ChildProcess | undefined): Promise<void> {
  if (processValue === undefined || processValue.exitCode !== null) return;
  processValue.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => processValue.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (processValue.exitCode === null) processValue.kill("SIGKILL");
}

async function resetIsolatedState(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE TABLE "User" CASCADE`;
  await redis.flushdb();
}

function configureApiEnvironment(port: number, internalApiUrl: string, publicWebUrl: string): void {
  Object.assign(process.env, {
    NODE_ENV: "test",
    API_PORT: String(port),
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: "e2e-access-secret-that-is-at-least-32-characters",
    JWT_REFRESH_SECRET: "e2e-refresh-secret-that-is-at-least-32-characters",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_PUBLIC_ENDPOINT: "http://127.0.0.1:9000",
    S3_ACCESS_KEY: "e2e-minio-access",
    S3_SECRET_KEY: "e2e-minio-secret",
    S3_BUCKET: "collab-docs-e2e",
    S3_REGION: "us-east-1",
    WEB_URL: publicWebUrl,
    API_URL: internalApiUrl,
    INTERNAL_API_URL: internalApiUrl,
    COLLAB_URL: "ws://127.0.0.1:3002",
    REVALIDATION_SECRET: "e2e-revalidation-secret-that-is-at-least-32-characters",
  });
}

function requireIsolatedDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (value === undefined) throw new Error("TEST_DATABASE_URL is required for E2E tests");
  const parsed = new URL(value);
  if (parsed.searchParams.get("schema") !== "collab_docs_e2e") {
    throw new Error("TEST_DATABASE_URL must use the isolated collab_docs_e2e schema");
  }
  return value;
}

function requireIsolatedRedisUrl(): string {
  const value = process.env.TEST_REDIS_URL;
  if (value === undefined) throw new Error("TEST_REDIS_URL is required for E2E tests");
  const parsed = new URL(value);
  if (parsed.pathname === "" || parsed.pathname === "/" || parsed.pathname === "/0") {
    throw new Error("TEST_REDIS_URL must use a non-default Redis database");
  }
  return value;
}
