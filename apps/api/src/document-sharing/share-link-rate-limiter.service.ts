import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { RedisService } from "../infrastructure/redis/redis.service";

const incrementWindowScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return current
`;

@Injectable()
export class ShareLinkRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async check(userId: string, documentId: string): Promise<void> {
    const identity = createHash("sha256").update(`${userId}|${documentId}`).digest("hex");
    const attempts = await this.redis.client.eval(
      incrementWindowScript,
      1,
      `document-share:create:${identity}`,
      "60",
    );
    if (typeof attempts === "number" && attempts > 10) {
      throw new HttpException("Too many share links created", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
