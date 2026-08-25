import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { RedisService } from "../infrastructure/redis/redis.service";

const incrementWindowScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return current
`;

@Injectable()
export class LoginRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async check(email: string, ipAddress: string): Promise<void> {
    const identity = createHash("sha256").update(`${email.trim().toLowerCase()}|${ipAddress}`).digest("hex");
    const attempts = await this.redis.client.eval(incrementWindowScript, 1, `auth:login:${identity}`, "60");
    if (typeof attempts === "number" && attempts > 5) {
      throw new HttpException("Too many login attempts", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
