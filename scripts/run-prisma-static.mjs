import { spawnSync } from "node:child_process";

const operation = process.argv[2];
if (operation !== "generate" && operation !== "validate") {
  throw new Error("Expected Prisma generate or validate operation");
}

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", operation, "--schema", "prisma/schema.prisma"],
  {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:5432/collab_docs_build",
    },
    stdio: "inherit",
  },
);

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
