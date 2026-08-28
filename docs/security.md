# Security

All user content and identifiers are untrusted. Protected resources require server-side authorization to prevent IDOR, including workspace enumeration, document access, comments, versions, attachments, search, billing, and collaboration rooms.

Normalized blocks are rendered through explicit React components. Unsafe HTML, event handlers, `javascript:` URLs, scripts, and unapproved embeds are rejected or sanitized with a strict allowlist. Database access uses Prisma or parameterized SQL.

Login and public share-link creation are rate-limited. Uploads require authentication, permission, MIME and size validation, quota checks, and presigned MinIO/S3 URLs; storage credentials never reach browsers. Passwords, JWTs, refresh tokens, authorization headers, document content, and infrastructure secrets are excluded from logs.

Collaboration sockets do not join rooms based on document IDs alone. They authenticate before joining through the internal API and are periodically reauthorized so membership revocation, permission changes, archive, or deletion can terminate access. Read-only connections cannot submit Yjs state updates. Protocol failures and rejected writes are counted and logged without tokens or document content.

## Authorization and IDOR boundaries

Workspace, document, comment, version, attachment, billing, search, publication, and share-link management routes use the access-token guard and authoritative database-backed policy checks. Direct IDs are UUID-validated. Resource services resolve the owning active document/workspace before returning data, and outsiders receive not-found responses where revealing existence would create an enumeration channel.

Search performs a policy check before SQL execution and also joins current membership, active workspace state, and the recursively active document hierarchy in the result query. Eventual search data is never used as authorization. Billing plan mutations require `billing.manage`; attachment finalization repeats document write authorization inside the final database transaction.

Public slugs and share tokens have strict length/character validation. Share tokens are stored only as SHA-256 hashes. Published attachment lookup binds attachment ID, document slug, publication state, lifecycle state, and ready status in one query.

## Live collaboration revocation

Successful membership removal/role changes, editable share-link revoke/regenerate, and document archive/delete publish allowlisted UUID-scoped Redis control events after commit. The collab service immediately reauthorizes matching user/document connections: downgraded users become read-only, removed users and revoked-link users are disconnected, and archived/deleted document rooms terminate. Restore events evict the old room so the next connection cold-loads the restored durable state.

Periodic authorization checks remain enabled, and every incoming non-empty Yjs update is reauthorized before persistence. CRDT persistence independently rejects archived/deleted documents. Therefore a control-message delivery failure cannot permit a write; its residual effect is that an already-connected reader may retain the old room view until the next periodic check (normally at most 30 seconds). Control publish failures are structured-log events.

## XSS and URL handling

Public rendering parses an exact allowlisted projection schema and renders text through React components without `dangerouslySetInnerHTML`. Unknown block fields, scripts, event-handler fields, malformed blocks, credential-bearing URLs, non-HTTPS URLs, loopback/private-network image hosts, and unsafe schemes such as `javascript:` or `data:` are rejected. Comments and metadata are rendered as React text rather than HTML. Uploaded images are restricted to GIF, JPEG, PNG, and WebP; SVG/HTML uploads are not accepted.

Remote HTTPS image blocks remain an explicit feature and can reveal a visitor IP to the image host. Published attachments use the authorized same-origin API route and a short-lived storage redirect.

## Validation and abuse controls

The global validation pipe transforms explicitly declared values, strips no unknown fields silently, and rejects non-whitelisted/unknown input. UUID params, DTO bodies, enums, MIME/size declarations, search query length, and pagination (maximum page 10,000 and page size 50) are validated at transport boundaries. WebSocket authentication additionally validates UUID document IDs, 43-character share tokens, token length, frame size, awareness ownership, and protocol message types.

Login uses independent fixed-window Redis buckets: 5 attempts per normalized account and 30 attempts per IP per minute. Share-link creation/regeneration uses 10 attempts per target resource and 30 attempts per user per minute. Independent keys prevent bypass by rotating only accounts, IPs, documents, or link IDs. Redis failures fail closed for these operations.

## Caching, errors, logs, and SQL

API responses default to `Cache-Control: private, no-store`. Only the allowlisted published projection endpoint overrides this with a short public shared-cache policy; token-based share resolution, private document trees, and presigned attachment redirects remain non-cacheable. Private tree fetching is intentionally uncached, so hierarchy mutations require no private shared-cache invalidation. Public rendering performs an uncached publication/lifecycle probe before accepting a tagged cached projection, and lifecycle/content jobs invalidate both tag and path.

The global exception filter maps validation/domain/known Prisma errors and returns a generic production 500 without stack, SQL, filesystem, or database details. API and collab structured loggers redact sensitive field names, bearer values, and credential-bearing database/Redis URLs; request logs omit query/body/header content and document content.

All audited raw database operations use Prisma tagged templates or `Prisma.sql` parameters. Existing high-value indexes cover membership lookup, active hierarchy/order, share tokens and lifecycle, versions, comments, attachments, billing event IDs, and workspace-scoped FTS; no additional index was justified by this audit.

Short-lived presigned download URLs cannot be recalled after issuance. Revocation prevents issuing new URLs, while an already-issued URL can remain usable until its five-minute expiry.
