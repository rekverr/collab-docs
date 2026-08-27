import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import type { RedisService } from "../infrastructure/redis/redis.service";
import { ShareLinkRateLimiter } from "./share-link-rate-limiter.service";

describe("ShareLinkRateLimiter", () => {
  it("enforces a user-wide limit across different resources", async () => {
    const limiter = new ShareLinkRateLimiter(redisWithFixedWindows());

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await limiter.check("user-1", `document-${attempt}`);
    }
    await assert.rejects(
      limiter.check("user-1", "document-final"),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
    );
  });

  it("enforces the per-resource limit across different users", async () => {
    const limiter = new ShareLinkRateLimiter(redisWithFixedWindows());

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await limiter.check(`user-${attempt}`, "document-1");
    }
    await assert.rejects(
      limiter.check("user-final", "document-1"),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
    );
  });
});

function redisWithFixedWindows(): RedisService {
  const counts = new Map<string, number>();
  return {
    client: {
      eval: async (_script: string, _keyCount: number, first: string, second: string) => {
        const increment = (key: string) => {
          const value = (counts.get(key) ?? 0) + 1;
          counts.set(key, value);
          return value;
        };
        return [increment(first), increment(second)];
      },
    },
  } as unknown as RedisService;
}
