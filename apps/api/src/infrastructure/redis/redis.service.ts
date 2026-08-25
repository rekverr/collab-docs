import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { AppEnvironment } from "../../common/config/environment";
import { JsonLogger } from "../../common/logging/json-logger.service";

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  readonly client: Redis;

  constructor(config: ConfigService<AppEnvironment, true>, private readonly logger: JsonLogger) {
    this.client = new Redis(config.getOrThrow("REDIS_URL", { infer: true }), {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.client.on("error", (error: Error) => {
      this.logger.event("error", "redis_connection_error", { errorType: error.name });
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== "end") await this.client.quit();
  }
}
