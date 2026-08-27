import { spawnSync } from "node:child_process";
import { connect } from "node:net";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://collab_docs:local-development-only@127.0.0.1:5432/collab_docs?schema=collab_docs_e2e";
const testRedisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15";
const database = new URL(testDatabaseUrl);
const redis = new URL(testRedisUrl);

if (database.searchParams.get("schema") !== "collab_docs_e2e") {
  throw new Error("Refusing E2E setup: TEST_DATABASE_URL must use schema=collab_docs_e2e");
}
if (redis.pathname === "" || redis.pathname === "/" || redis.pathname === "/0") {
  throw new Error("Refusing E2E setup: TEST_REDIS_URL must use a non-default Redis database");
}

await requireTcp(database, "PostgreSQL");
await requireTcp(redis, "Redis");

run(
  [
    "--filter",
    "@collab-docs/database",
    "exec",
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    "prisma/schema.prisma",
  ],
  { DATABASE_URL: testDatabaseUrl },
);
run(["--filter", "@collab-docs/api", "build"], { DATABASE_URL: testDatabaseUrl });
run(["--filter", "@collab-docs/collab", "test:e2e"], {
  TEST_DATABASE_URL: testDatabaseUrl,
  TEST_REDIS_URL: testRedisUrl,
});

function run(argumentsValue, extraEnvironment) {
  const result = spawnSync("pnpm", argumentsValue, {
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function requireTcp(url, service) {
  const port = Number(url.port || (url.protocol === "postgresql:" ? 5432 : 6379));
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${service} is not reachable at ${url.hostname}:${port}`));
    }, 3_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", () => {
      clearTimeout(timer);
      reject(
        new Error(
          `${service} is not reachable at ${url.hostname}:${port}. Start it before pnpm test:e2e.`,
        ),
      );
    });
  });
}
