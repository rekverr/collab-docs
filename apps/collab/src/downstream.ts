import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { DocumentProjection } from "./projection.js";

export interface ProjectionEvent { documentId: string; sequence: bigint; projection: DocumentProjection; published: boolean }
export interface ProjectionPublisher { publish(event: ProjectionEvent): Promise<void>; close?(): Promise<void> }

export class BullMqProjectionPublisher implements ProjectionPublisher {
  private readonly redis: Redis;
  private readonly search: Queue;
  private readonly revalidation: Queue;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.search = new Queue("document-search-index", { connection: this.redis });
    this.revalidation = new Queue("public-document-revalidation", { connection: this.redis });
  }

  async publish(event: ProjectionEvent): Promise<void> {
    const sequence = event.sequence.toString();
    await this.search.add("index-document", { documentId: event.documentId, sequence }, {
      jobId: `${event.documentId}-${sequence}`, attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 1000,
    });
    if (event.published) await this.revalidation.add("revalidate-document", { documentId: event.documentId, sequence }, {
      jobId: `${event.documentId}-${sequence}`, attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 1000,
    });
  }

  async close(): Promise<void> {
    await Promise.all([this.search.close(), this.revalidation.close()]);
    this.redis.disconnect();
  }
}

export class NoopProjectionPublisher implements ProjectionPublisher { publish(): Promise<void> { return Promise.resolve(); } }
