import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, apiErrorMessage, isApiErrorBody } from "./errors";
import {
  parseAuthResponse,
  parseDocumentTree,
  parseDocumentVersionPreview,
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
