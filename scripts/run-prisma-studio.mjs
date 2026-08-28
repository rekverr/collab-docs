import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@collab-docs/database",
    "exec",
    "prisma",
    "studio",
    "--schema",
    "prisma/schema.prisma",
    "--port",
    "5555",
  ],
  { env: process.env, stdio: "inherit" },
);

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
