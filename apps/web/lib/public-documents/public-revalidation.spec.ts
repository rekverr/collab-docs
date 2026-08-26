import assert from "node:assert/strict";
import test from "node:test";
import {
  handlePublicRevalidationRequest,
  publicDocumentPath,
  publicDocumentTag,
} from "./public-revalidation";

const secret = "s".repeat(64);

test("invalidates the published document tag and path", async () => {
  const tags: string[] = [];
  const paths: string[] = [];
  const response = await handlePublicRevalidationRequest(request(secret), {
    secret,
    revalidateTag: (tag) => tags.push(tag),
    revalidatePath: (path) => paths.push(path),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(tags, [publicDocumentTag("published-document-1")]);
  assert.deepEqual(paths, [publicDocumentPath("published-document-1")]);
});

test("repeated revalidation requests are safe", async () => {
  let calls = 0;
  const dependencies = {
    secret,
    revalidateTag: () => {
      calls += 1;
    },
    revalidatePath: () => {
      calls += 1;
    },
  };

  const first = await handlePublicRevalidationRequest(request(secret), dependencies);
  const second = await handlePublicRevalidationRequest(request(secret), dependencies);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(calls, 4);
});

test("rejects an unauthorized internal revalidation call", async () => {
  let invalidated = false;
  const response = await handlePublicRevalidationRequest(request("wrong-secret"), {
    secret,
    revalidateTag: () => {
      invalidated = true;
    },
    revalidatePath: () => {
      invalidated = true;
    },
  });

  assert.equal(response.status, 401);
  assert.equal(invalidated, false);
});

function request(authorization: string): Request {
  return new Request("http://localhost/api/internal/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-revalidation-secret": authorization,
    },
    body: JSON.stringify({
      documentId: "document-1",
      publicSlug: "published-document-1",
    }),
  });
}
