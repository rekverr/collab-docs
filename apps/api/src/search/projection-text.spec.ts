import assert from "node:assert/strict";
import test from "node:test";
import { extractSearchableProjectionText } from "./projection-text";

test("extracts only supported normalized projection text", () => {
  const text = extractSearchableProjectionText({
    version: 1,
    plainText: "untrusted shortcut",
    blocks: [
      { id: "one", type: "heading", text: "Project overview" },
      { id: "two", type: "list", items: ["First", "Second"] },
      { id: "three", type: "image", alt: "Architecture diagram" },
      { id: "ignored", type: "html", text: "should not be indexed" },
    ],
  });

  assert.equal(text, "Project overview\nFirst\nSecond\nArchitecture diagram");
  assert.equal(text.includes("untrusted shortcut"), false);
  assert.equal(text.includes("should not be indexed"), false);
});

test("malformed projections produce an empty searchable body", () => {
  assert.equal(extractSearchableProjectionText(null), "");
  assert.equal(extractSearchableProjectionText({ blocks: "not-an-array" }), "");
});
