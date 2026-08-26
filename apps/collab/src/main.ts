import { PrismaClient } from "@prisma/client";
import { ApiCollaborationAuthorizer } from "./authorization.js";
import { CollaborationServer } from "./collaboration-server.js";
import { BullMqProjectionPublisher } from "./downstream.js";
import { JsonLogger } from "./logger.js";
import { PrismaCollaborationPersistence } from "./prisma-persistence.js";

const port = parsePort(process.env.COLLAB_PORT ?? "3002");
const internalApiUrl = requireHttpUrl(process.env.INTERNAL_API_URL ?? "http://localhost:3001");
const redisUrl = requireRedisUrl(process.env.REDIS_URL ?? "redis://localhost:6379");
const compactAfterUpdates = parsePositiveInteger(
  process.env.CRDT_COMPACT_AFTER_UPDATES ?? "100",
  "CRDT_COMPACT_AFTER_UPDATES",
);
const logger = new JsonLogger();
const prisma = new PrismaClient();
await prisma.$connect();
const persistence = new PrismaCollaborationPersistence(
  prisma,
  new BullMqProjectionPublisher(redisUrl),
  { compactAfterUpdates },
);
const server = new CollaborationServer(
  { port },
  new ApiCollaborationAuthorizer(internalApiUrl),
  persistence,
  logger,
);

await server.start();

async function shutdown(signal: string): Promise<void> {
  logger.event("info", "collab_shutdown", { signal });
  await server.stop();
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
