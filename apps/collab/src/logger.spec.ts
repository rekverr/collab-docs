import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JsonLogger } from "./logger.js";

describe("collaboration structured logger", () => {
  it("redacts token fields and credentials embedded in values", () => {
    const original = console.info;
    let output = "";
    console.info = (value?: unknown) => {
      output = String(value);
    };
    try {
      new JsonLogger().event("info", "security_test", {
        accessToken: "raw-token",
        authorizationValue: "Bearer signed-value",
        endpoint: "redis://user:password@redis:6379",
      });
    } finally {
      console.info = original;
    }
    assert.equal(output.includes("raw-token"), false);
    assert.equal(output.includes("signed-value"), false);
    assert.equal(output.includes(":password@"), false);
    assert.match(output, /\[REDACTED\]/);
  });
});
