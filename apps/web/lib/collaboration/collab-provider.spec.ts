import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collaboratorColor, connectionStateFromClose, isSafeImageUrl } from "./collab-provider";

describe("collaboration provider helpers", () => {
  it("maps terminal collaboration close codes without retrying", () => {
    assert.equal(connectionStateFromClose(4403, true), "permission-revoked");
    assert.equal(connectionStateFromClose(4404, true), "deleted");
    assert.equal(connectionStateFromClose(4410, true), "reload-required");
  });

  it("distinguishes offline and reconnecting transport failures", () => {
    assert.equal(connectionStateFromClose(1006, false), "offline");
    assert.equal(connectionStateFromClose(1011, true), "reconnecting");
  });

  it("only accepts browser-safe image integration URLs", () => {
    assert.equal(isSafeImageUrl("https://images.example.test/photo.png"), true);
    assert.equal(isSafeImageUrl("http://localhost:9000/local.png"), false);
    assert.equal(isSafeImageUrl("https://user:secret@example.test/photo.png"), false);
    assert.equal(isSafeImageUrl("javascript:alert(1)"), false);
    assert.equal(isSafeImageUrl("data:image/svg+xml,<svg></svg>"), false);
  });

  it("assigns stable collaborator colors", () => {
    assert.equal(collaboratorColor("user-1"), collaboratorColor("user-1"));
  });
});
