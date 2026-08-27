import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { MetricsService } from "../../metrics/metrics.service";
import { JsonLogger } from "../logging/json-logger.service";
import { runWithRequestId } from "./request-context";

const validRequestId = /^[A-Za-z0-9_-]{1,128}$/;

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const suppliedId = request.header("x-request-id");
    const requestId =
      suppliedId !== undefined && validRequestId.test(suppliedId) ? suppliedId : randomUUID();
    const startedAt = process.hrtime.bigint();
    response.setHeader("x-request-id", requestId);
    response.setHeader("cache-control", "private, no-store");

    runWithRequestId(requestId, () => {
      response.once("finish", () => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        const route = request.route?.path;
        const routeLabel = typeof route === "string" ? route : "unmatched";
        this.metrics.observeHttpRequest(
          request.method,
          routeLabel,
          response.statusCode,
          durationSeconds,
        );
        this.logger.event("info", "http_request_completed", {
          durationMs: Math.round(durationSeconds * 1000),
          method: request.method,
          path: request.path,
          requestId,
          statusCode: response.statusCode,
        });
      });
      next();
    });
  }
}
