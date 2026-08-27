import assert from "node:assert/strict";
import test from "node:test";
import { privateRedirectTarget, routeAccess } from "./routes";

test("classifies auth, private, and public route namespaces", () => {
  assert.equal(routeAccess("/login"), "auth");
  assert.equal(routeAccess("/app/workspaces/one"), "private");
  assert.equal(routeAccess("/p/published-document"), "public");
  assert.equal(routeAccess("/share/token"), "public");
});

test("preserves a safe private return URL", () => {
  assert.equal(
    privateRedirectTarget("/app/workspaces/one", "?panel=members"),
    "/app/workspaces/one?panel=members",
  );
  assert.equal(privateRedirectTarget("//external.example", ""), "/app");
});
