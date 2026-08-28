import assert from "node:assert/strict";
import test from "node:test";
import { accessCookieHeader, readAccessToken, shouldUseSecureCookies } from "./session-cookies";

test("reads an access token from an authentication response", () => {
  assert.equal(
    readAccessToken(JSON.stringify({ accessToken: "signed-access-token" })),
    "signed-access-token",
  );
  assert.equal(readAccessToken("not-json"), null);
});

test("local HTTP requests use cookies without the Secure attribute", () => {
  assert.equal(shouldUseSecureCookies(new Request("http://localhost:3000/api/auth")), false);
});

test("serializes safe HttpOnly access cookies for HTTP and HTTPS", () => {
  assert.equal(
    accessCookieHeader("signed.token", false),
    "collab_docs_access=signed.token; Path=/; HttpOnly; SameSite=Lax",
  );
  assert.match(accessCookieHeader("signed.token", true), /; Secure$/);
  assert.match(accessCookieHeader("", false, true), /Max-Age=0$/);
});

test("HTTPS and forwarded HTTPS requests use secure cookies", () => {
  assert.equal(shouldUseSecureCookies(new Request("https://docs.example.com/api/auth")), true);
  assert.equal(
    shouldUseSecureCookies(
      new Request("http://web:3000/api/auth", { headers: { "x-forwarded-proto": "https" } }),
    ),
    true,
  );
});
