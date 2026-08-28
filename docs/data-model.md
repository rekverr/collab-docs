# Data Model

Prisma targets PostgreSQL. The initial migration is committed under `packages/database/prisma/migrations`; future changes must also use reviewed Prisma migrations rather than `db push`.

## Identity and authentication

`User` stores normalized unique email addresses and password hashes. Deactivation is soft through `deletedAt`, because authored documents and comments retain ownership history. `RefreshSession` stores only a SHA-256-style token hash, a rotation family, expiry/revocation metadata, and an optional one-to-one replacement link. Deleting a user cascades their refresh sessions.

## Workspaces and authorization

`Workspace` has an explicit owner and soft-deletion timestamp. `WorkspaceMember` is unique on `(workspaceId, userId)`, preventing duplicate membership, and indexes both workspace-first and user-first permission lookups. Roles are `OWNER`, `ADMIN`, `EDITOR`, and `VIEWER`. Invitations store hashed tokens, expiry, lifecycle state, inviter, and acceptor metadata.

`DocumentAccessGrant` represents user-specific `VIEW` or `EDIT` access and is unique per document/user. `DocumentShareLink` stores only a unique token hash plus its access mode, optional expiry, revocation, and usage metadata. Permission code must always check current membership, deletion, expiration, and revocation in a strongly consistent query.

## Documents and hierarchy

`Document` uses stable UUIDs and string sort keys so a move normally changes one row rather than rewriting the whole tree. A composite foreign key `(parentId, workspaceId) -> (id, workspaceId)` prevents cross-workspace parents. SQL checks reject self-parenting; cycle prevention remains a transactional service responsibility.

The metadata API uses fixed-width numeric sort keys with large gaps. Creating or moving a document normally writes only that document; when a gap is exhausted, only the destination sibling set is rebalanced. Explicit sibling reorder requests must contain every active sibling exactly once. Moves validate ancestry under serializable transaction isolation to prevent concurrent cycle creation.

Archived and soft-deleted documents are omitted from navigation. A document whose ancestor is archived or deleted is also inaccessible, preventing direct-ID access to hidden descendants. Restore is supported by the schema but requires an active parent and the same `document.delete` capability used for lifecycle changes.

Publication is explicit through `DocumentPublicationState`, `publicSlug`, and `publishedAt`. A migration check requires published documents to have both public fields. `archivedAt` and `deletedAt` preserve hierarchy and allow live collaboration sessions to detect terminal state. The normalized JSON `contentProjection` and its Yjs sequence support server rendering and later asynchronous search indexing.

## CRDT durability and versions

`YjsUpdate` records per-document monotonic sequence numbers, binary updates, and a stable update hash. Uniqueness on both `(documentId, sequence)` and `(documentId, updateHash)` makes ordering and duplicate delivery explicit.

`YjsSnapshot` stores a full state, optional state vector, content hash, and the highest included sequence. Cold reconstruction selects the newest snapshot and applies updates with a greater sequence. During compaction, covered updates may first reference the durable snapshot through `compactedBySnapshotId`; only after the snapshot transaction succeeds may those updates be deleted. This makes bounded update history an explicit service operation rather than an unsafe database cascade.

Persistence uses a per-document PostgreSQL advisory transaction lock to serialize sequence allocation and compaction across service instances. Update insertion and projection advancement are one transaction. Snapshot creation commits separately before covered-update deletion, and the newest snapshots are retained for operational recovery.

`DocumentVersion` is separate from compaction. It stores a user-visible title, full Yjs state, normalized projection, source sequence, optional author, and optional restore origin. Restoring creates new current state and a new version; it does not overwrite history.

## Collaboration, files, and notifications

`Comment` supports parent/reply threads, block anchors, and resolution metadata. `Notification` references a recipient and optional actor/workspace/document/comment without storing document excerpts. Cascading document deletion removes dependent notifications to prevent stale content references.

`Attachment` belongs to both a workspace and a document through a tenant-aware composite foreign key. Its unique object key, lifecycle state, MIME type, checksum, and byte size support presigned MinIO/S3 workflows and strongly consistent storage accounting.

## Billing

Each workspace has at most one `Subscription`, with `FREE`, `PRO`, or `TEAM` plan state and explicit member, document, and storage limits. `Workspace.storageUsedBytes` supports transactional storage quota checks.

`BillingEvent.eventId` is globally unique. Webhook handling must insert the event and update subscription state in one transaction; a duplicate insert is the durable no-op boundary. Events retain processing status and failure metadata for safe retry and operations.

## Deletion and constraints

Workspace-owned aggregates cascade only on intentional hard workspace/document deletion. Historical authorship and ownership use `RESTRICT` or `SET NULL` as appropriate. Users and workspaces are normally soft-deleted. The migration adds checks for non-negative quota values, valid publication metadata, non-self hierarchy/reply/refresh links, and non-owner invitations. Frequently used permission, hierarchy, token, CRDT sequence, notification, attachment, and billing paths are indexed.
