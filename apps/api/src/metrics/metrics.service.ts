import { Injectable } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly requestCount: Counter<"method" | "route" | "status_code">;
  private readonly requestDuration: Histogram<"method" | "route" | "status_code">;

  constructor() {
    collectDefaultMetrics({ prefix: "collab_docs_api_", register: this.registry });
    this.requestCount = new Counter({
      name: "collab_docs_api_http_requests_total",
      help: "Total completed HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: "collab_docs_api_http_request_duration_seconds",
      help: "Completed HTTP request duration in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.requestCount.inc(labels);
    this.requestDuration.observe(labels, durationSeconds);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
