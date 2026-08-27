import { PrismaClient } from "@prisma/client";
import { ApiCollaborationAuthorizer } from "./authorization.js";
import { CollaborationServer } from "./collaboration-server.js";
import { BullMqProjectionPublisher } from "./downstream.js";
import { JsonLogger } from "./logger.js";
import { PrismaCollaborationPersistence } from "./prisma-persistence.js";
import { Redis } from "ioredis";
import { parseCollaborationControlEvent } from "./control-events.js";

const port = parsePort(process.env.COLLAB_PORT ?? "3002");
const internalApiUrl = requireHttpUrl(process.env.INTERNAL_API_URL ?? "http://localhost:3001");
const redisUrl = requireRedisUrl(process.env.REDIS_URL ?? "redis://localhost:6379");
const compactAfterUpdates = parsePositiveInteger(
  process.env.CRDT_COMPACT_AFTER_UPDATES ?? "100",
  "CRDT_COMPACT_AFTER_UPDATES",
);
const versionEveryUpdates = parsePositiveInteger(
  process.env.DOCUMENT_VERSION_EVERY_UPDATES ?? "50",
  "DOCUMENT_VERSION_EVERY_UPDATES",
);
const logger = new JsonLogger();
const prisma = new PrismaClient();
await prisma.$connect();
const persistence = new PrismaCollaborationPersistence(
  prisma,
  new BullMqProjectionPublisher(redisUrl),
  { compactAfterUpdates, versionEveryUpdates },
);
const server = new CollaborationServer(
  { port },
  new ApiCollaborationAuthorizer(internalApiUrl),
  persistence,
  logger,
);

await server.start();
const controlSubscriber = new Redis(redisUrl, {
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
});
controlSubscriber.on("error", (error: Error) => {
  logger.event("error", "collab_control_redis_error", { errorType: error.name });
});
controlSubscriber.on("message", (channel: string, message: string) => {
  if (channel !== "collab:document-control") return;
  const event = parseCollaborationControlEvent(message);
  if (event === null) return;
  if (event.type === "document-unavailable") {
    server.terminateDocument(event.documentId, "Document was deleted", 4404);
  } else if (event.type === "document-restored") {
    server.terminateDocument(event.documentId, "Document restored; reconnecting", 4410);
  } else if (event.type === "document-access-changed") {
    void server.reauthorizeDocument(event.documentId);
  } else {
    void server.reauthorizeUser(event.userId);
  }
});
await controlSubscriber.subscribe("collab:document-control");

async function shutdown(signal: string): Promise<void> {
  logger.event("info", "collab_shutdown", { signal });
  await server.stop();
  await controlSubscriber.quit();
  await prisma.$disconnect();
  process.exitCode = 0;
}

function requireRedisUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:")
    throw new Error("REDIS_URL must use Redis protocol");
  return url.toString();
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535)
    throw new Error("COLLAB_PORT must be a valid TCP port");
  return parsed;
}

function requireHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("INTERNAL_API_URL must use HTTP or HTTPS");
  return url.toString().replace(/\/$/, "");
}
