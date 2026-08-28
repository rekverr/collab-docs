# Public Rendering

Published documents are rendered by Next.js Server Components from a normalized, server-readable projection. Metadata and content are produced server-side without loading the collaborative editor. Rendering uses an allowlisted block model and never trusts arbitrary client HTML.

After a durable projection changes, the collab service queues a BullMQ revalidation job when the document is published. The API also queues lifecycle jobs after publish, unpublish, archive, delete, and restore operations. Queueing does not wait for cache invalidation, so editing remains independent from Next.js availability.

The API BullMQ worker consumes `revalidate-document` from `public-document-revalidation`, resolves the stable slug from PostgreSQL, and calls `POST /api/internal/revalidate` on the web service. The request uses the server-only `REVALIDATION_SECRET` in `x-revalidation-secret`; this value is never exposed through a `NEXT_PUBLIC_*` variable. The endpoint invalidates both `public-document:{slug}` and `/p/{slug}`.

Projection jobs use the document ID and durable sequence as their job identity. Lifecycle jobs use the document ID, transition, and update timestamp. Duplicate delivery is safe because Next.js tag/path invalidation is idempotent. Jobs have five bounded attempts with exponential backoff, and enqueue, completion, skip, and failure outcomes are recorded in structured logs and API metrics.

The collaboration publisher and API worker share the `collab-docs` BullMQ prefix and include the explicit `projection-changed` reason. A mismatched prefix would create valid but unconsumed Redis jobs, so the critical E2E flow verifies the complete cross-process path.

Public requests still perform an uncached publication-state probe before using the cached projection. This keeps publication, deletion, and access state strongly consistent even while content revalidation is eventually consistent or temporarily delayed.

Tokenized `/share/[token]` pages are deliberately uncached and `noindex`. The API checks expiration, revocation, document lifecycle, and the exact document binding on every resolution. View links render the same strict normalized block allowlist as published pages. Attachment redirects are scoped to the active share token and its document. Edit links require login for a stable collaborator identity, then pass the token only to the authenticated collaboration handshake; they never grant workspace browsing or membership.
