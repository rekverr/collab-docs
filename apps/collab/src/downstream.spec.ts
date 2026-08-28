import assert from "node:assert/strict";
import test from "node:test";
import { createProjectionRevalidationJob, type ProjectionEvent } from "./downstream.js";

test("published projection changes enqueue public revalidation work", () => {
  const job = createProjectionRevalidationJob(event(true));

  assert.deepEqual(job?.data, {
    documentId: "document-1",
    sequence: "42",
    reason: "projection-changed",
  });
  assert.equal(job?.options.jobId, "document-1-42");
  assert.equal(job?.options.attempts, 5);
});

test("private projection changes do not enqueue public revalidation work", () => {
  assert.equal(createProjectionRevalidationJob(event(false)), null);
});

function event(published: boolean): ProjectionEvent {
  return {
    documentId: "document-1",
    sequence: 42n,
    projection: { version: 1, blocks: [], plainText: "" },
    published,
  };
}
