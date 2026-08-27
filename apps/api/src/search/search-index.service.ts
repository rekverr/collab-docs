import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { JobsOptions, Queue } from "bullmq";
import { JsonLogger } from "../common/logging/json-logger.service";
import { MetricsService } from "../metrics/metrics.service";
import {
  searchIndexJobName,
  searchIndexQueueName,
  type SearchIndexJobData,
} from "./search.constants";

const jobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
};

@Injectable()
export class SearchIndexService {
  constructor(
    @InjectQueue(searchIndexQueueName) private readonly queue: Queue,
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsService,
  ) {}

  async enqueueBestEffort(documentId: string, sequence: bigint | number | string): Promise<void> {
    const sequenceText = String(sequence);
    const data: SearchIndexJobData = { documentId, sequence: sequenceText };
    try {
      await this.queue.add(searchIndexJobName, data, {
        ...jobOptions,
        jobId: `${documentId}-${sequenceText}`,
      });
      this.metrics.recordSearchIndexing("enqueued");
    } catch (error: unknown) {
      this.metrics.recordSearchIndexing("enqueue_failed");
      this.logger.event("error", "search_index_enqueue_failed", {
        documentId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
