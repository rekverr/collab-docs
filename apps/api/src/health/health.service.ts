import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { RedisService } from "../infrastructure/redis/redis.service";

export interface HealthResponse {
  status: "ok";
  dependencies: { postgres: "up"; redis: "up" };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthResponse> {
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.client.ping()]);
      return { status: "ok", dependencies: { postgres: "up", redis: "up" } };
    } catch {
      throw new ServiceUnavailableException("A required dependency is unavailable");
    }
  }
}
