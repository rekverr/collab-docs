# Architecture

Collab Docs is a pnpm workspace with three deployable applications and shared packages.

- `apps/web`: Next.js App Router UI, public rendering, and cache invalidation endpoints.
- `apps/api`: NestJS REST API, business rules, authorization, and BullMQ workers.
- `apps/collab`: dedicated authenticated WebSocket service for Yjs rooms.
- `packages/database`: Prisma schema and generated PostgreSQL client.
- `packages/contracts`: transport-neutral shared enums and contracts.
- `packages/config`: small, non-secret configuration constants shared across runtimes.

PostgreSQL is the durable system of record. Redis and BullMQ carry retryable asynchronous work. MinIO provides local S3-compatible object storage. Permissions, membership, billing, and quotas use strongly consistent database reads and transactions. Search indexing, derived projections, and public-page revalidation are eventually consistent and may retry independently.

The API workers and collaboration publisher use the same `collab-docs` BullMQ key prefix. This is an explicit cross-service protocol detail: projection jobs emitted by the standalone collaboration process must enter the exact queues consumed by NestJS workers.

The API and collaboration service are separate because REST request lifecycles differ from long-lived, stateful document rooms. Neither service may trust authorization supplied by the web client.
