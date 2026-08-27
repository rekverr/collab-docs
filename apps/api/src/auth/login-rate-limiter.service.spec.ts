import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import type { RedisService } from "../infrastructure/redis/redis.service";
import { LoginRateLimiter } from "./login-rate-limiter.service";

describe("LoginRateLimiter", () => {
  it("enforces the account limit across changing IP addresses", async () => {
    const limiter = new LoginRateLimiter(redisWithFixedWindows());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.check("target@example.com", `198.51.100.${attempt}`);
    }
    await assert.rejects(
      limiter.check("target@example.com", "203.0.113.1"),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
    );
  });

  it("enforces the IP limit across changing account names", async () => {
    const limiter = new LoginRateLimiter(redisWithFixedWindows());

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await limiter.check(`person-${attempt}@example.com`, "198.51.100.10");
    }
    await assert.rejects(
      limiter.check("another@example.com", "198.51.100.10"),
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
