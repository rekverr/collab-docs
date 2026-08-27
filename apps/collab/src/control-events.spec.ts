import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCollaborationControlEvent } from "./control-events.js";

describe("collaboration control events", () => {
  it("accepts allowlisted UUID-scoped events only", () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    assert.deepEqual(
      parseCollaborationControlEvent(
        JSON.stringify({ type: "document-access-changed", documentId }),
      ),
      { type: "document-access-changed", documentId },
    );
    assert.equal(
      parseCollaborationControlEvent(
        JSON.stringify({ type: "document-unavailable", documentId: "../document" }),
      ),
      null,
    );
    assert.equal(
      parseCollaborationControlEvent(JSON.stringify({ type: "shutdown", documentId })),
      null,
    );
  });
});
