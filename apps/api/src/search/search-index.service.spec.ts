import assert from "node:assert/strict";
import test from "node:test";
import type { Queue } from "bullmq";
import type { JsonLogger } from "../common/logging/json-logger.service";
import type { MetricsService } from "../metrics/metrics.service";
import { SearchIndexService } from "./search-index.service";

test("repeated indexing requests use the same idempotent BullMQ job identity", async () => {
  const jobs: Array<{ name: string; data: unknown; jobId: string | undefined }> = [];
  const queue = {
    add: async (name: string, data: unknown, options: { jobId?: string }) => {
      jobs.push({ name, data, jobId: options.jobId });
    },
  };
  const metrics = { recordSearchIndexing: () => undefined };
  const logger = { event: () => undefined };
  const service = new SearchIndexService(
    queue as unknown as Queue,
    logger as unknown as JsonLogger,
    metrics as unknown as MetricsService,
  );

  await service.enqueueBestEffort("document-1", 42n);
  await service.enqueueBestEffort("document-1", 42n);

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]?.jobId, "document-1-42");
  assert.equal(jobs[1]?.jobId, "document-1-42");
  assert.deepEqual(jobs[0]?.data, { documentId: "document-1", sequence: "42" });
});
