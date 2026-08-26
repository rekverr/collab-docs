import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentTreeNode } from "../api/types";
import { containsDocument, moveDocumentOptimistically, removeDocument, renameDocument } from "./tree";

function node(id: string, children: DocumentTreeNode[] = [], parentId: string | null = null): DocumentTreeNode {
  return { id, workspaceId: "workspace", parentId, title: id, sortKey: id, publicationState: "PRIVATE", archivedAt: null, deletedAt: null, createdAt: "now", updatedAt: "now", children };
}

describe("optimistic document tree operations", () => {
  const tree = [node("a", [node("a1", [], "a")]), node("b"), node("c")];

  it("renames and removes nodes without mutating the input", () => {
    assert.equal(renameDocument(tree, "a1", "Renamed")[0]?.children[0]?.title, "Renamed");
    assert.equal(tree[0]?.children[0]?.title, "a1");
    assert.equal(containsDocument(removeDocument(tree, "a"), "a1"), false);
  });

  it("reorders siblings and nests documents", () => {
    assert.deepEqual(moveDocumentOptimistically(tree, "c", null, "a")?.map(({ id }) => id), ["c", "a", "b"]);
    assert.deepEqual(moveDocumentOptimistically(tree, "b", "a")?.[0]?.children.map(({ id }) => id), ["a1", "b"]);
  });

  it("blocks self nesting and descendant cycles", () => {
    assert.equal(moveDocumentOptimistically(tree, "a", "a"), null);
    assert.equal(moveDocumentOptimistically(tree, "a", "a1"), null);
  });
});
