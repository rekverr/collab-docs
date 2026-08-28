# Testing

The suite prioritizes authorization, consistency, persistence, and public-delivery invariants rather than blanket coverage or large HTML snapshots.

## Unit coverage

Existing focused tests cover:

- centralized workspace capability resolution and outsider/Viewer denial;
- document hierarchy validation, including self-parenting, cross-workspace parents, and cycles;
- document, member/invitation, and storage plan limits;
- billing webhook idempotency and billing authorization;
- Yjs reconstruction from snapshot plus ordered updates, duplicate update delivery, compaction, and stale-room rejection.

Additional focused suites cover authentication rotation, share access, attachments, comments/mentions, search authorization/indexing, public rendering sanitization, and protected revalidation.

Run all unit tests from the repository root:

```bash
pnpm test
```

## Critical integration/E2E suite

The E2E suite uses the real Nest HTTP application, PostgreSQL through Prisma, a dedicated Redis database, the real collaboration WebSocket server, two independent Yjs clients, and a real Next.js Server Component request. It proves:

1. registration → workspace/document creation → Viewer invitation/acceptance → Viewer read access → REST and WebSocket write denial;
2. concurrent independent Yjs changes converge, survive durable persistence, and are restored after a collaboration-server cold restart;
3. publication returns SSR content, a later durable projection update enters BullMQ, the protected Next.js revalidation endpoint is processed, and a later public request contains the update;
4. two deliveries of one billing event create one durable event and apply the plan change once.

The runner is intentionally destructive only inside PostgreSQL schema `collab_docs_e2e` and a non-default Redis database. It refuses the normal schema and Redis DB 0.

Start the required local infrastructure, then run:

```bash
docker compose up -d postgres redis
pnpm test:e2e
```

Defaults match Docker Compose:

```text
TEST_DATABASE_URL=postgresql://collab_docs:local-development-only@localhost:5432/collab_docs?schema=collab_docs_e2e
TEST_REDIS_URL=redis://localhost:6379/15
```

Override those variables in `.env`, CI, or the process environment for another local PostgreSQL/Redis instance. `pnpm test:e2e` loads `.env` when present, applies committed Prisma migrations to the isolated schema, and builds the reusable Nest bootstrap before starting the tests. MinIO is not required because the critical flows do not upload objects.

## Validation commands

Use these root commands for the complete assessment checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The E2E suite runs serially because its four flows intentionally build on one realistic workspace lifecycle. Assertions inspect response status, durable rows, Yjs state, and selected rendered content; they do not use brittle full-page snapshots.
