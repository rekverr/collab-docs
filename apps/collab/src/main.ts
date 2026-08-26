import { ApiCollaborationAuthorizer } from "./authorization.js";
import { CollaborationServer } from "./collaboration-server.js";
import { JsonLogger } from "./logger.js";
import { NoopCollaborationPersistence } from "./persistence.js";

const port = parsePort(process.env.COLLAB_PORT ?? "3002");
const internalApiUrl = requireHttpUrl(process.env.INTERNAL_API_URL ?? "http://localhost:3001");
const logger = new JsonLogger();
const server = new CollaborationServer(
  { port },
  new ApiCollaborationAuthorizer(internalApiUrl),
  new NoopCollaborationPersistence(),
  logger,
);

await server.start();

async function shutdown(signal: string): Promise<void> {
  logger.event("info", "collab_shutdown", { signal });
  await server.stop();
  process.exitCode = 0;
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("COLLAB_PORT must be a valid TCP port");
  return parsed;
}

function requireHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("INTERNAL_API_URL must use HTTP or HTTPS");
  return url.toString().replace(/\/$/, "");
}
