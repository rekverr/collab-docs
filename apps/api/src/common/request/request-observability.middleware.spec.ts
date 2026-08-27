import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import type { MetricsService } from "../../metrics/metrics.service";
import type { JsonLogger } from "../logging/json-logger.service";
import { RequestObservabilityMiddleware } from "./request-observability.middleware";

describe("RequestObservabilityMiddleware cache policy", () => {
  it("marks API responses private and non-cacheable by default", () => {
    const headers = new Map<string, string>();
    const request = {
      header: () => undefined,
      method: "GET",
      path: "/workspaces/11111111-1111-4111-8111-111111111111",
    } as unknown as Request;
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
      once: () => undefined,
    } as unknown as Response;
    let continued = false;
    const next = (() => {
      continued = true;
    }) as NextFunction;
    const middleware = new RequestObservabilityMiddleware(
      { event: () => undefined } as unknown as JsonLogger,
      { observeHttpRequest: () => undefined } as unknown as MetricsService,
    );

    middleware.use(request, response, next);

    assert.equal(headers.get("cache-control"), "private, no-store");
    assert.equal(continued, true);
  });
});
