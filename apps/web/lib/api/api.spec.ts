import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, apiErrorMessage, isApiErrorBody } from "./errors";
import {
  parseAuthResponse,
  parseChangePlanResult,
  parseDocumentTree,
  parseDocumentVersionPreview,
  parseSearchDocumentsResponse,
  parseWorkspaceMembers,
  parseWorkspaces,
} from "./parsers";

describe("frontend API boundary", () => {
  it("parses typed authentication and workspace responses", () => {
    const auth = parseAuthResponse({
      accessToken: "access",
      user: { id: "user-1", email: "person@example.com", displayName: null },
    });
    assert.equal(auth.user.email, "person@example.com");
    const workspaces = parseWorkspaces([
      {
        id: "workspace-1",
        name: "Team",
        slug: "team",
        ownerId: "user-1",
        role: "OWNER",
        createdAt: "2026-08-26",
        updatedAt: "2026-08-26",
      },
    ]);
    assert.equal(workspaces[0]?.role, "OWNER");
  });

  it("parses workspace member summaries for streamed server sections", () => {
    const members = parseWorkspaceMembers([
      {
        id: "membership-1",
        role: "EDITOR",
        user: { id: "user-1", email: "person@example.com", displayName: "Person" },
        createdAt: "2026-08-27T10:00:00.000Z",
        updatedAt: "2026-08-27T10:00:00.000Z",
      },
    ]);

    assert.equal(members[0]?.user.displayName, "Person");
    assert.throws(() => parseWorkspaceMembers([{ role: "ROOT" }]), TypeError);
  });

  it("parses paginated workspace search results", () => {
    const result = parseSearchDocumentsResponse({
      items: [
        {
          documentId: "document-1",
          workspaceId: "workspace-1",
          parentId: null,
          title: "Roadmap",
          snippet: "Quarterly roadmap",
          rank: 0.8,
          updatedAt: "2026-08-27T10:00:00.000Z",
        },
      ],
      page: 1,
      limit: 10,
      hasMore: false,
    });

    assert.equal(result.items[0]?.title, "Roadmap");
    assert.equal(result.hasMore, false);
    assert.throws(() => parseSearchDocumentsResponse({ items: [], page: "1" }), TypeError);
  });

  it("parses billing usage and plan changes at the API boundary", () => {
    const result = parseChangePlanResult({
      checkoutId: "checkout-1",
      eventId: "event-1",
      applied: true,
      subscription: {
        id: "subscription-1",
        workspaceId: "workspace-1",
        plan: "PRO",
        status: "ACTIVE",
        members: { used: 2, limit: 25 },
        documents: { used: 10, limit: 1000 },
        storage: { usedBytes: "1024", limitBytes: "5368709120" },
        currentPeriodStart: "2026-08-27T10:00:00.000Z",
        currentPeriodEnd: "2026-09-26T10:00:00.000Z",
        updatedAt: "2026-08-27T10:00:00.000Z",
      },
    });

    assert.equal(result.subscription.plan, "PRO");
    assert.equal(result.subscription.storage.usedBytes, "1024");
    assert.throws(
      () =>
        parseChangePlanResult({
          checkoutId: "checkout-1",
          eventId: "event-1",
          applied: true,
          subscription: { plan: "UNLIMITED" },
        }),
      TypeError,
    );
  });

  it("rejects malformed API data instead of trusting compile-time types", () => {
    assert.throws(() => parseAuthResponse({ accessToken: 123, user: null }), TypeError);
    assert.throws(() => parseWorkspaces([{ role: "SUPERUSER" }]), TypeError);
  });

  it("parses nested document trees recursively", () => {
    const base = {
      workspaceId: "workspace-1",
      title: "Page",
      sortKey: "1",
      publicationState: "PRIVATE",
      archivedAt: null,
      deletedAt: null,
      createdAt: "now",
      updatedAt: "now",
    };
    const tree = parseDocumentTree([
      {
        ...base,
        id: "root",
        parentId: null,
        children: [{ ...base, id: "child", parentId: "root", children: [] }],
      },
    ]);
    assert.equal(tree[0]?.children[0]?.id, "child");
  });

  it("recognizes and maps centralized API errors", () => {
    assert.equal(isApiErrorBody({ statusCode: 401, code: "UNAUTHORIZED", message: "No" }), true);
    assert.equal(
      apiErrorMessage(new ApiError(401, "UNAUTHORIZED", "No")),
      "Your session has expired. Please sign in again.",
    );
    assert.equal(
      apiErrorMessage(new ApiError(400, "VALIDATION_ERROR", "Invalid", ["Email is invalid"])),
      "Email is invalid",
    );
  });

  it("parses a typed version preview and rejects unsupported projection blocks", () => {
    const version = {
      id: "version-1",
      documentId: "document-1",
      title: "Checkpoint",
      sourceSequence: "42",
      restoredFromVersionId: null,
      author: { id: "user-1", email: "person@example.com", displayName: "Person" },
      createdAt: "2026-08-26T12:00:00.000Z",
    };
    const preview = parseDocumentVersionPreview({
      ...version,
      contentProjection: {
        version: 1,
        blocks: [{ id: "p-1", type: "paragraph", text: "Earlier content" }],
        plainText: "Earlier content",
      },
    });
    assert.equal(preview.contentProjection.blocks[0]?.type, "paragraph");
    assert.throws(
      () =>
        parseDocumentVersionPreview({
          ...version,
          contentProjection: {
            version: 1,
            blocks: [{ id: "html", type: "html", value: "<script />" }],
            plainText: "",
          },
        }),
      TypeError,
    );
  });
});
