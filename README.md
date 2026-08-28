# Collab Docs

Collab Docs is a collaborative, Notion-like workspace application built as a pnpm monorepo. It demonstrates hybrid Next.js rendering, server-enforced permissions, durable Yjs collaboration, asynchronous PostgreSQL search indexing, idempotent mock billing, safe public rendering, and Docker-based local operation.

The implementation intentionally favors correctness and explainable architecture over feature breadth or visual polish.

## Architecture

The repository contains three deployable applications:

- `apps/web` — Next.js App Router UI, private workspace shell, collaborative editor, public Server Component rendering, and the protected cache-revalidation endpoint.
- `apps/api` — NestJS REST API, authentication, authorization, workspaces, document metadata, comments, versions, attachments, sharing, billing, search, BullMQ workers, Swagger, health, and metrics.
- `apps/collab` — authenticated Yjs/WebSocket rooms, awareness, write authorization, durable CRDT updates, projections, snapshots, compaction, and live revocation handling.

Shared packages:

- `packages/database` — Prisma schema, generated client, and reviewed migrations.
- `packages/contracts` — transport-neutral shared contracts.
- `packages/config` — small non-secret shared configuration helpers.

PostgreSQL is the durable system of record. Redis supports rate limits, BullMQ jobs, and collaboration control events. MinIO supplies local S3-compatible object storage.

```text
browser
  ├─ HTTP/SSR ───────────────> Next.js web
  ├─ REST via /api/backend ──> NestJS API ──> PostgreSQL / Redis / MinIO
  └─ Yjs WebSocket ──────────> collab ──────> PostgreSQL / Redis

durable projection ─> BullMQ search worker ─> PostgreSQL FTS
published change ───> BullMQ revalidation worker ─> Next.js tag/path invalidation
```

## Repository structure

```text
.
├── apps
│   ├── api
│   ├── collab
│   └── web
├── packages
│   ├── config
│   ├── contracts
│   └── database
├── docs
├── scripts
├── .github/workflows/ci.yml
├── .env.example
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

## Requirements

- Node.js 22 or newer.
- Corepack and pnpm 11.
- Docker with Compose for the normal local environment.

## Docker startup

Create local configuration and start the complete stack:

```bash
cp .env.example .env
docker compose up --build
```

`.env.example` is the local development profile. `.env.staging.example` documents the separate staging shape and contains placeholders only; deploy it through the target platform's secret manager rather than committing populated credentials.

Compose starts PostgreSQL, Redis, MinIO, a one-shot MinIO bucket initializer, a one-shot Prisma migration service, the API, collaboration service, and web application. Application containers use Compose service names (`postgres`, `redis`, `minio`, `api`, `collab`, and `web`); browser-facing URLs continue to use `localhost`.

Local endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/api/docs`
- API health: `http://localhost:3001/health`
- API metrics: `http://localhost:3001/metrics`
- Collaboration health: `http://localhost:3002/health`
- Collaboration metrics: `http://localhost:3002/metrics`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`

Persistent named volumes retain PostgreSQL, Redis, and MinIO data. `docker compose down` stops services without deleting those volumes.

## Host-machine development

Start only infrastructure, apply migrations, then run all applications in watch mode:

```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres redis minio minio-init
pnpm db:migrate
pnpm dev
```

The root development and migration scripts load `.env`. Do not place production credentials in this repository.

## Database and migrations

Prisma targets PostgreSQL. The schema is in `packages/database/prisma/schema.prisma`; migrations are in `packages/database/prisma/migrations`.

Use committed migrations for schema evolution:

```bash
pnpm db:migrate
DATABASE_URL="postgresql://..." pnpm --filter @collab-docs/database exec prisma migrate dev --schema prisma/schema.prisma
```

`prisma db push` is not the delivery strategy. The migration set includes tenant-aware hierarchy constraints, CRDT idempotency keys and sequence indexes, attachment lifecycle fields, notification deduplication, and a generated PostgreSQL `tsvector` with GIN indexing.

## Authentication and permissions

Authentication uses short-lived access JWTs and longer-lived rotating refresh JWTs. Refresh sessions are persisted with hashed tokens, family reuse detection, revocation, and HttpOnly SameSite cookies. Login is rate-limited through independent account and IP Redis buckets.

Workspace roles are `OWNER`, `ADMIN`, `EDITOR`, and `VIEWER`. A centralized policy service resolves capabilities such as workspace management, membership management, billing, and document create/read/edit/delete/publish. Every REST resource and collaboration-room join performs authoritative server-side checks. Direct IDs do not bypass workspace or document access.

Invitations contain a cryptographically random raw token delivered once; only its hash is stored. Owner invariants and membership changes are transactionally enforced. Viewer writes are rejected by both REST services and the WebSocket protocol.

The workspace dashboard includes member listing, invitations, role changes, and removal controls permitted by the current role. Since email delivery is intentionally omitted, the invitation URL is displayed once for manual delivery and opens the authenticated acceptance route.

## Server and Client Components

Server Components are the default for public documents, metadata, private initial data, and independently streamed dashboard sections. Private API calls use server-only HttpOnly access state and `no-store` caching.

Client Components are kept to interaction boundaries: authentication/forms, document drag-and-drop, search, the TipTap/Yjs editor, WebSocket lifecycle, presence, comments, versions, uploads, and billing controls. The complete workspace layout is not client-only.

Server Actions are used only for ordinary form mutations such as workspace settings. Yjs updates, presence, and WebSocket operations never use Server Actions.

## Public SSR, ISR, and revalidation

Published documents are served at `/p/[slug]` by a Next.js Server Component. Metadata and supported blocks are rendered from an allowlisted normalized projection without unrestricted `dangerouslySetInnerHTML` or the editor bundle.

Document share links open at `/share/[token]`. View links are uncached, server-rendered, and `noindex`; editable links require an authenticated identity and then connect the Yjs editor with document-scoped token authorization. Share-token attachment redirects verify the active link and exact document before issuing a short-lived object-storage URL.

Public projections use tagged ISR caching with a 300-second fallback. Every public request first performs an uncached publication/lifecycle probe. After a durable published projection changes, the collab service enqueues an idempotent BullMQ job. The API worker calls the protected `/api/internal/revalidate` endpoint with `REVALIDATION_SECRET`, invalidating both `public-document:{slug}` and `/p/{slug}`. Editing does not wait for this eventual cache update.

Unpublish, archive, delete, and restore operations enqueue the corresponding invalidation work.

## CRDT synchronization and persistence

Yjs is the authoritative concurrent content state. One collaboration room exists per active document. Clients authenticate before joining, exchange standard Yjs sync and awareness frames, reconnect after transport loss, and clean up awareness on disconnect.

Incoming non-empty updates are reauthorized, applied to the room, persisted, projected, and only then broadcast as durable. Duplicate updates are identified by `(documentId, updateHash)`.

Cold loading performs:

1. latest durable `YjsSnapshot`;
2. ordered `YjsUpdate` rows after the snapshot sequence;
3. reconstruction of the `Y.Doc`;
4. exposure of the live room.

Compaction takes a PostgreSQL advisory lock, writes a complete snapshot first, then removes only covered updates. Compaction snapshots are operational state and remain separate from user-visible document versions. Deleted/archived documents reject persistence and active rooms are terminated or reauthorized through Redis control events plus periodic checks.

## Search

Search uses PostgreSQL Full-Text Search with the language-neutral `simple` configuration. Title terms receive weight A and normalized projection text receives weight B.

Projection and metadata changes enqueue idempotent BullMQ indexing jobs. Conditional upserts prevent stale jobs from overwriting newer indexes; deleted and archived documents are removed. Search authorization remains strongly consistent: the query joins current membership, workspace lifecycle, and active document hierarchy before returning results.

## Billing and quotas

Billing is a mock Stripe-like workflow with `FREE`, `PRO`, and `TEAM` plans. Configurable limits cover active documents, members plus pending invitations, and attachment storage.

Webhook processing is durably idempotent. The unique provider event row and subscription mutation commit in one serializable transaction. Replaying an identical event returns `applied: false`; reusing an event ID with different data is rejected. Quota exhaustion returns stable HTTP 422 domain errors rather than HTTP 500.

Only users with `billing.manage` can change plans or simulate webhook delivery.

## Attachments and MinIO

The browser requests a presigned upload URL after authentication, document-write authorization, MIME/size validation, and transactional quota reservation. It uploads directly to MinIO rather than proxying large bodies through NestJS. Finalization verifies object metadata and current permissions before marking the attachment ready.

Object keys are generated server-side. Permanent S3 credentials never reach the browser. Download/delete operations recheck access, and public attachments are bound to a currently published document before a short-lived redirect is issued.

## Consistency model

Strong consistency is required for authentication, memberships, permission resolution, document lifecycle, sharing, billing state, and quota checks. These decisions use authoritative database reads and transactions.

Eventual consistency is used for normalized projections, search indexing, and public-page revalidation. Eventual state is never used as an authorization source.

## Security and operations

- DTO validation covers bodies, UUID params, enums, pagination, MIME/size declarations, public slugs, and share tokens.
- Public rendering accepts an exact normalized block schema and rejects scripts, event fields, unsafe schemes, credential-bearing URLs, and unsafe remote images.
- Share-link creation and login are Redis-rate-limited.
- API errors hide stack traces, SQL details, paths, and database internals.
- Structured logs include correlation IDs where applicable and redact tokens, authorization fields, credentials, and document content.
- Prisma tagged templates or parameterized `Prisma.sql` fragments are used for raw SQL.
- `/health` checks PostgreSQL and Redis; API and collaboration services expose Prometheus-style `/metrics`.

See `docs/security.md` for the detailed authorization, caching, live-revocation, and XSS boundaries.

## API documentation

Swagger/OpenAPI is generated from the actual NestJS controllers and DTOs:

```text
http://localhost:3001/api/docs
```

It covers authentication, workspaces, members and invitations, documents, sharing/publication, versions, comments, attachments, search, and mock billing/webhook endpoints. Bearer access tokens and the refresh cookie are declared as security schemes.

## Tests and CI

Run delivery validation from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
docker compose config
docker compose build
```

Unit tests focus on permission resolution, hierarchy cycles, quotas, billing idempotency, CRDT reconstruction/duplicates/compaction, authentication rotation, search authorization, sharing, attachments, comments, safe rendering, and revalidation.

The E2E suite uses a dedicated PostgreSQL schema (`collab_docs_e2e`) and Redis DB 15. It covers Viewer REST/WebSocket denial, two-client Yjs convergence and cold recovery, public SSR plus asynchronous revalidation, and duplicate billing delivery. The runner refuses the normal database schema and Redis DB 0.

GitHub Actions installs with the frozen lockfile, runs lint, typecheck, unit tests, PostgreSQL/Redis-backed E2E, application builds, Compose validation, and Docker image builds.

## Known limitations

- Billing and checkout are intentionally simulated; there is no real payment provider or webhook signature verification.
- Share-link delivery and workspace invitations have no email transport.
- Offline editing is limited to Yjs reconnect behavior; there is no durable browser-side PWA/offline queue.
- Remote HTTPS image blocks can disclose a public visitor IP to the image host. Uploaded MinIO images avoid that external request.
- Already-issued presigned download URLs remain usable until their short five-minute expiry.
- There is no block-level ACL, mobile application, analytics pipeline, or full Notion block/plugin ecosystem.
- The E2E suite starts a Next development server for realistic Server Component requests; production-image smoke testing remains a manual Docker QA step.

## With more time

The next delivery improvements would be browser-driven accessibility and visual regression tests, production-image smoke tests in CI, external object-store malware scanning, transactional outbox delivery for post-commit control events, distributed tracing, load tests for large Yjs rooms, and a real payment-provider adapter with signature verification.

These are follow-up hardening opportunities, not required business features for this assessment.
