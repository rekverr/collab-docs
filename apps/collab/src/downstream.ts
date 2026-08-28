import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import type { DocumentProjection } from "./projection.js";

export interface ProjectionEvent {
  documentId: string;
  sequence: bigint;
  projection: DocumentProjection;
  published: boolean;
}
export interface ProjectionPublisher {
  publish(event: ProjectionEvent): Promise<void>;
  close?(): Promise<void>;
}

export interface ProjectionRevalidationJob {
  data: { documentId: string; sequence: string; reason: "projection-changed" };
  options: JobsOptions;
}

export function createProjectionRevalidationJob(
  event: ProjectionEvent,
): ProjectionRevalidationJob | null {
  if (!event.published) return null;
  const sequence = event.sequence.toString();
  return {
    data: { documentId: event.documentId, sequence, reason: "projection-changed" },
    options: projectionJobOptions(event.documentId, sequence),
  };
}

export class BullMqProjectionPublisher implements ProjectionPublisher {
  private readonly redis: Redis;
  private readonly search: Queue;
  private readonly revalidation: Queue;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const queueOptions = { connection: this.redis, prefix: "collab-docs" } as const;
    this.search = new Queue("document-search-index", queueOptions);
    this.revalidation = new Queue("public-document-revalidation", queueOptions);
  }

  async publish(event: ProjectionEvent): Promise<void> {
    const sequence = event.sequence.toString();
    await this.search.add(
      "index-document",
      { documentId: event.documentId, sequence },
      projectionJobOptions(event.documentId, sequence),
    );
    const revalidation = createProjectionRevalidationJob(event);
    if (revalidation !== null) {
      await this.revalidation.add("revalidate-document", revalidation.data, revalidation.options);
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.search.close(), this.revalidation.close()]);
    this.redis.disconnect();
  }
}

function projectionJobOptions(documentId: string, sequence: string): JobsOptions {
  return {
    jobId: `${documentId}-${sequence}`,
    attempts: 5,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: 1_000,
    removeOnFail: 1_000,
  };
}

export class NoopProjectionPublisher implements ProjectionPublisher {
  publish(): Promise<void> {
    return Promise.resolve();
  }
}
