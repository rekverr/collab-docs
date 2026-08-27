import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Job } from "bullmq";
import { JsonLogger } from "../common/logging/json-logger.service";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { MetricsService } from "../metrics/metrics.service";
import { extractSearchableProjectionText } from "./projection-text";
import {
  searchIndexJobName,
  searchIndexQueueName,
  type SearchIndexJobData,
} from "./search.constants";

@Injectable()
@Processor(searchIndexQueueName, { concurrency: 4 })
export class SearchIndexProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== searchIndexJobName || !isSearchIndexJob(job.data)) {
      throw new Error("Invalid search indexing job");
    }
    const document = await this.prisma.document.findUnique({
      where: { id: job.data.documentId },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        contentProjection: true,
        projectionSequence: true,
        updatedAt: true,
        archivedAt: true,
        deletedAt: true,
      },
    });

    if (document === null) {
      this.metrics.recordSearchIndexing("removed");
      return;
    }
    if (document.archivedAt !== null || document.deletedAt !== null) {
      const removed = await this.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "document_search_index" AS search_index
          USING "Document" AS document
          WHERE search_index."documentId" = ${document.id}::uuid
            AND document."id" = search_index."documentId"
            AND (document."archivedAt" IS NOT NULL OR document."deletedAt" IS NOT NULL)`,
      );
      this.metrics.recordSearchIndexing(removed > 0 ? "removed" : "stale_skipped");
      this.logger.event(
        "info",
        removed > 0 ? "search_index_removed" : "search_index_stale_skipped",
        {
          documentId: document.id,
        },
      );
      return;
    }

    const content = extractSearchableProjectionText(document.contentProjection);
    const indexed = await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "document_search_index" (
          "documentId", "workspaceId", "title", "content", "projectionSequence",
          "sourceUpdatedAt", "indexedAt"
        )
        SELECT
          current_document."id", current_document."workspaceId", ${document.title}, ${content},
          ${document.projectionSequence}, ${document.updatedAt}, CURRENT_TIMESTAMP
        FROM "Document" AS current_document
        WHERE current_document."id" = ${document.id}::uuid
          AND current_document."archivedAt" IS NULL
          AND current_document."deletedAt" IS NULL
          AND current_document."updatedAt" = ${document.updatedAt}
        ON CONFLICT ("documentId") DO UPDATE SET
          "workspaceId" = EXCLUDED."workspaceId",
          "title" = EXCLUDED."title",
          "content" = EXCLUDED."content",
          "projectionSequence" = EXCLUDED."projectionSequence",
          "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt",
          "indexedAt" = EXCLUDED."indexedAt"
        WHERE "document_search_index"."sourceUpdatedAt" <= EXCLUDED."sourceUpdatedAt"`,
    );
    this.metrics.recordSearchIndexing(indexed > 0 ? "indexed" : "stale_skipped");
    this.logger.event("info", indexed > 0 ? "search_index_updated" : "search_index_stale_skipped", {
      documentId: document.id,
      sequence: document.projectionSequence.toString(),
    });
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<SearchIndexJobData> | undefined, error: Error): void {
    this.metrics.recordSearchIndexing("failed");
    this.logger.event("error", "search_index_failed", {
      documentId: job?.data.documentId,
      attempt: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
      willRetry:
        job !== undefined &&
        typeof job.opts.attempts === "number" &&
        job.attemptsMade < job.opts.attempts,
      errorType: error.name,
    });
  }
}

function isSearchIndexJob(value: unknown): value is SearchIndexJobData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const documentId: unknown = Reflect.get(value, "documentId");
  const sequence: unknown = Reflect.get(value, "sequence");
  return typeof documentId === "string" && typeof sequence === "string";
}
