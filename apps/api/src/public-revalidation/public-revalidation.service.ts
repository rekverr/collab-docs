import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { JobsOptions, Queue } from "bullmq";
import { JsonLogger } from "../common/logging/json-logger.service";
import { MetricsService } from "../metrics/metrics.service";
import {
  publicRevalidationJobName,
  publicRevalidationQueueName,
  type PublicRevalidationJobData,
  type PublicRevalidationReason,
} from "./public-revalidation.constants";

const jobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
};

@Injectable()
export class PublicRevalidationService {
  constructor(
    @InjectQueue(publicRevalidationQueueName) private readonly queue: Queue,
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsService,
  ) {}

  async enqueue(
    documentId: string,
    sequence: bigint | number | string,
    reason: PublicRevalidationReason,
  ): Promise<void> {
    const sequenceText = String(sequence);
    const data: PublicRevalidationJobData = { documentId, sequence: sequenceText, reason };
    await this.queue.add(publicRevalidationJobName, data, {
      ...jobOptions,
      jobId: `${documentId}-${reason}-${sequenceText}`,
    });
    this.metrics.recordPublicRevalidation("enqueued");
  }

  async enqueueBestEffort(
    documentId: string,
    sequence: bigint | number | string,
    reason: PublicRevalidationReason,
  ): Promise<void> {
    try {
      await this.enqueue(documentId, sequence, reason);
    } catch (error: unknown) {
      this.metrics.recordPublicRevalidation("enqueue_failed");
      this.logger.event("error", "public_revalidation_enqueue_failed", {
        documentId,
        reason,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
