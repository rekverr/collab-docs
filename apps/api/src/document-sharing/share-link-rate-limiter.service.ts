import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { RedisService } from "../infrastructure/redis/redis.service";

const incrementWindowsScript = `
local actor = redis.call('INCR', KEYS[1])
if actor == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local resource = redis.call('INCR', KEYS[2])
if resource == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]) end
return { actor, resource }
`;

@Injectable()
export class ShareLinkRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async check(userId: string, documentId: string): Promise<void> {
    const actor = createHash("sha256").update(userId).digest("hex");
    const resource = createHash("sha256").update(documentId).digest("hex");
    const attempts = await this.redis.client.eval(
      incrementWindowsScript,
      2,
      `document-share:create:user:${actor}`,
      `document-share:create:resource:${resource}`,
      "60",
    );
    if (Array.isArray(attempts) && (Number(attempts[0]) > 30 || Number(attempts[1]) > 10)) {
      throw new HttpException("Too many share links created", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
