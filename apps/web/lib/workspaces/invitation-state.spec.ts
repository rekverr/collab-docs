import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invitationFailed, invitationSubmitting, invitationSucceeded } from "./invitation-state";

describe("workspace invitation UI state", () => {
  it("represents a successful POST as an in-app invitation confirmation", () => {
    const state = invitationSucceeded("invitee@example.com", "VIEWER");

    assert.deepEqual(state, {
      status: "success",
      email: "invitee@example.com",
      role: "VIEWER",
    });
    assert.equal("message" in state, false);
    assert.equal("url" in state, false);
  });

  it("replaces a previous failure when a retry starts and succeeds", () => {
    const failed = invitationFailed("Request failed");
    const retrying = invitationSubmitting();
    const succeeded = invitationSucceeded("invitee@example.com", "EDITOR");

    assert.equal(failed.status, "error");
    assert.equal(retrying.status, "submitting");
    assert.equal(succeeded.status, "success");
    assert.equal("message" in succeeded, false);
  });

  it("represents a failed POST without a fake invitation URL", () => {
    const state = invitationFailed("Insufficient permission");

    assert.deepEqual(state, { status: "error", message: "Insufficient permission" });
    assert.equal("url" in state, false);
  });
});
