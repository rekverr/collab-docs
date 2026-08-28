# Billing

Billing is a mock Stripe-like workflow with `FREE`, `PRO`, and `TEAM` plans. Limits cover members, documents, and storage. Plan state, usage checks, and mutations use strongly consistent database transactions; quota exhaustion is a normal 4xx domain error.

Webhook processing is idempotent. Each validated provider event ID is inserted under a unique constraint in the same transaction as the subscription change. A repeated event becomes a safe no-op, including after process restarts. Raw event secrets and payment-like credentials are never logged.

## Implemented plan limits

- `FREE`: 5 members, 100 non-deleted documents, 100 MiB of attachment storage.
- `PRO`: 25 members, 1,000 non-deleted documents, 5 GiB of attachment storage.
- `TEAM`: 250 members, 10,000 non-deleted documents, 100 GiB of attachment storage.

The catalog in `apps/api/src/billing/plan-catalog.ts` is the single configuration source used when a workspace is created and whenever a plan changes. A downgrade is rejected if current usage exceeds any target-plan limit.

Document creation and restoring a deleted document reserve document capacity inside the mutation transaction. Pending, non-expired invitations count toward member capacity so concurrent invitations cannot oversubscribe a plan; accepting an invitation checks capacity again. Attachment upload requests atomically reserve declared bytes, and finalization verifies both the uploaded object and the current storage limit. Deleted or failed uploads release their reservation.

Quota exhaustion returns HTTP 422 with a stable resource-specific code (`DOCUMENTS_LIMIT_REACHED`, `MEMBERS_LIMIT_REACHED`, or `STORAGE_LIMIT_REACHED`) rather than an internal error.

## API and mock provider flow

- `GET /workspaces/:workspaceId/billing/subscription` returns the current plan, status, usage, and limits to any workspace reader.
- `POST /workspaces/:workspaceId/billing/checkout` creates mock checkout/event identifiers and applies a plan change through the same durable webhook processor.
- `POST /workspaces/:workspaceId/billing/mock-webhook` simulates delivery of a Stripe-like `customer.subscription.updated` event with a caller-supplied event ID.

Only a caller with `billing.manage` can change a plan or simulate a webhook. The current policy grants that capability to the workspace owner. Webhook handling locks the subscription and uses a serializable transaction. The unique billing event, subscription limits, plan period, and processed marker are committed together. Reusing an event ID with different data is rejected; an identical processed delivery returns `applied: false`.

The workspace dashboard renders billing as a narrow interactive client section inside the existing Server Component dashboard. It shows current usage to readers and plan-change controls only to users who can manage billing. This is a local assessment flow and does not collect payment details or contact an external payment provider.
