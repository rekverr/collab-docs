import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnprocessableEntityException } from "@nestjs/common";
import {
  appendedSortKey,
  assertExactSiblingOrder,
  assertNoHierarchyCycle,
  assertValidParent,
  formatSortKey,
  sortKeyGap,
} from "./document-hierarchy";

const root = { id: "root", workspaceId: "workspace-a", parentId: null };
const child = { id: "child", workspaceId: "workspace-a", parentId: "root" };

describe("document hierarchy", () => {
  it("supports nested creation under a same-workspace parent", () => {
    assert.doesNotThrow(() => assertValidParent(child, root));
    assert.equal(appendedSortKey(), formatSortKey(sortKeyGap));
    assert.equal(appendedSortKey(formatSortKey(sortKeyGap)), formatSortKey(sortKeyGap * 2n));
  });

  it("validates a deterministic complete sibling reorder", () => {
    assert.doesNotThrow(() => assertExactSiblingOrder(["a", "b", "c"], ["c", "a", "b"]));
    assert.throws(
      () => assertExactSiblingOrder(["a", "b"], ["a", "a"]),
      UnprocessableEntityException,
    );
    assert.throws(() => assertExactSiblingOrder(["a", "b"], ["a"]), UnprocessableEntityException);
  });

  it("allows moving a document beneath an unrelated descendant-free node", () => {
    const parents = new Map<string, string | null>([
      ["target", "root"],
      ["root", null],
    ]);
    assert.doesNotThrow(() => assertNoHierarchyCycle("moving", "target", parents));
  });

  it("rejects hierarchy cycles", () => {
    const parents = new Map<string, string | null>([
      ["child", "moving"],
      ["moving", null],
    ]);
    assert.throws(
      () => assertNoHierarchyCycle("moving", "child", parents),
      UnprocessableEntityException,
    );
  });

  it("rejects a cross-workspace parent", () => {
    const otherParent = { id: "other", workspaceId: "workspace-b", parentId: null };
    assert.throws(() => assertValidParent(child, otherParent), UnprocessableEntityException);
  });

  it("rejects a document as its own parent", () => {
    assert.throws(() => assertValidParent(root, root), UnprocessableEntityException);
  });
});
