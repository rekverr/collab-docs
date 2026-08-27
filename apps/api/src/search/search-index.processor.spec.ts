import assert from "node:assert/strict";
import test from "node:test";
import type { Job } from "bullmq";
import type { JsonLogger } from "../common/logging/json-logger.service";
import type { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { MetricsService } from "../metrics/metrics.service";
import { SearchIndexProcessor } from "./search-index.processor";

test("archived documents remove their persisted search index", async () => {
  let deletes = 0;
  const prisma = {
    document: {
      findUnique: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        title: "Archived",
        contentProjection: null,
        projectionSequence: 4n,
        updatedAt: new Date("2026-08-27T10:00:00.000Z"),
        archivedAt: new Date("2026-08-27T10:00:00.000Z"),
        deletedAt: null,
      }),
    },
    $executeRaw: async () => {
      deletes += 1;
      return 1;
    },
  };
  const processor = new SearchIndexProcessor(
    prisma as unknown as PrismaService,
    { event: () => undefined } as unknown as JsonLogger,
    { recordSearchIndexing: () => undefined } as unknown as MetricsService,
  );
  const job = {
    name: "index-document",
    data: { documentId: "11111111-1111-4111-8111-111111111111", sequence: "4" },
  } as Job<unknown>;

  await processor.process(job);

  assert.equal(deletes, 1);
});
