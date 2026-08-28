import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import type { AppEnvironment } from "../common/config/environment";
import { JsonLogger } from "../common/logging/json-logger.service";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { MetricsService } from "../metrics/metrics.service";
import {
  publicRevalidationHeader,
  publicRevalidationJobName,
  publicRevalidationQueueName,
  type PublicRevalidationJobData,
} from "./public-revalidation.constants";

const requestTimeoutMilliseconds = 10_000;

@Injectable()
@Processor(publicRevalidationQueueName, { concurrency: 2 })
export class PublicRevalidationProcessor extends WorkerHost {
  private readonly endpoint: string;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppEnvironment, true>,
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsService,
  ) {
    super();
    this.endpoint = `${config.getOrThrow("INTERNAL_WEB_URL", { infer: true }).replace(/\/$/, "")}/api/internal/revalidate`;
    this.secret = config.getOrThrow("REVALIDATION_SECRET", { infer: true });
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== publicRevalidationJobName || !isValidJob(job.data)) {
      throw new Error("Invalid public revalidation job");
    }
    const data = job.data;

    const document = await this.prisma.document.findUnique({
      where: { id: data.documentId },
      select: { publicSlug: true },
    });
    if (document?.publicSlug === null || document === null) {
      this.metrics.recordPublicRevalidation("skipped");
      this.logger.event("info", "public_revalidation_skipped", {
        documentId: data.documentId,
        reason: data.reason,
      });
      return;
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [publicRevalidationHeader]: this.secret,
      },
      body: JSON.stringify({
        documentId: data.documentId,
        publicSlug: document.publicSlug,
      }),
      signal: AbortSignal.timeout(requestTimeoutMilliseconds),
    });
    if (!response.ok) {
      throw new Error(`Next.js revalidation endpoint returned HTTP ${response.status}`);
    }

    this.metrics.recordPublicRevalidation("completed");
    this.logger.event("info", "public_revalidation_completed", {
      documentId: data.documentId,
      reason: data.reason,
      attempt: job.attemptsMade + 1,
    });
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job<PublicRevalidationJobData> | undefined, error: Error): void {
    this.metrics.recordPublicRevalidation("failed");
    this.logger.event("error", "public_revalidation_failed", {
      documentId: job?.data.documentId,
      reason: job?.data.reason,
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

function isValidJob(data: unknown): data is PublicRevalidationJobData {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const documentId: unknown = Reflect.get(data, "documentId");
  const sequence: unknown = Reflect.get(data, "sequence");
  const reason: unknown = Reflect.get(data, "reason");
  return (
    typeof documentId === "string" &&
    documentId.length > 0 &&
    typeof sequence === "string" &&
    sequence.length > 0 &&
    (reason === "projection-changed" ||
      reason === "published" ||
      reason === "unpublished" ||
      reason === "archived" ||
      reason === "deleted" ||
      reason === "restored")
  );
}
