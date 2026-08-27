import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { RedisService } from "../infrastructure/redis/redis.service";

const incrementWindowsScript = `
local account = redis.call('INCR', KEYS[1])
if account == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local address = redis.call('INCR', KEYS[2])
if address == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]) end
return { account, address }
`;

@Injectable()
export class LoginRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async check(email: string, ipAddress: string): Promise<void> {
    const account = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
    const address = createHash("sha256").update(ipAddress).digest("hex");
    const attempts = await this.redis.client.eval(
      incrementWindowsScript,
      2,
      `auth:login:account:${account}`,
      `auth:login:ip:${address}`,
      "60",
    );
    if (Array.isArray(attempts) && (Number(attempts[0]) > 5 || Number(attempts[1]) > 30)) {
      throw new HttpException("Too many login attempts", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
