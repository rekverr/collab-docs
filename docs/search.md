# Search

Search uses PostgreSQL Full-Text Search rather than another search service. Search data lives in `document_search_index`, separate from the authoritative document row. It stores the title, allowlisted text extracted from the normalized projection, the source projection sequence/timestamp, and a generated weighted `tsvector`. Title terms have weight A, content has weight B, and a GIN index supports matching. The language-neutral `simple` configuration avoids assuming all workspaces use English.

A durable projection triggers the idempotent `index-document` BullMQ job after commit. Create, rename, archive, delete, restore, and version restore paths enqueue the same worker when their searchable state changes. Jobs use document plus source identity, retry five times with exponential backoff, and use a timestamp/sequence conditional upsert so a stale worker cannot overwrite a newer index. Archived/deleted documents remove their index; query-time active-tree filtering additionally hides descendants of an inactive parent.

Jobs published by the standalone collaboration service use the same `collab-docs` BullMQ prefix as the NestJS search worker, so projection updates are consumed rather than stranded under a second Redis namespace.

`GET /workspaces/:workspaceId/search` accepts `query`, `page`, and `limit`. It uses `websearch_to_tsquery`, weighted rank plus a title boost, deterministic ordering, bounded pagination, and a plain-text snippet. All values are parameterized through Prisma SQL.

Index consistency is eventual; authorization is not. The API first checks `document.read` through the centralized policy service, then the search SQL joins the current `WorkspaceMember`, non-deleted `Workspace`, and recursively active `Document` hierarchy in the same database statement. Membership removal or document lifecycle changes therefore cannot leak stale indexed content.

The workspace header contains a narrow Client Component for search interaction. It debounces input, mirrors the query in the `q` URL parameter, cancels and generation-checks stale requests, supports load-more pagination, and renders typed title/snippet links with loading, empty, and error states.
