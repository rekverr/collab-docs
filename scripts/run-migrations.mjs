import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
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
  { env: process.env, stdio: "inherit" },
);

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
