import assert from "node:assert/strict";
import test from "node:test";
import { workspaceIdFromPath } from "./search-state";

test("derives workspace search scope only from private workspace routes", () => {
  assert.equal(workspaceIdFromPath("/app/workspaces/workspace-1"), "workspace-1");
  assert.equal(
    workspaceIdFromPath("/app/workspaces/workspace-1/documents/document-1"),
    "workspace-1",
  );
  assert.equal(workspaceIdFromPath("/app"), null);
  assert.equal(workspaceIdFromPath("/p/public-document"), null);
});
