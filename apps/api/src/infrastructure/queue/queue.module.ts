import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnvironment } from "../../common/config/environment";

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) => {
        const redisUrl = new URL(config.getOrThrow("REDIS_URL", { infer: true }));
        const database = redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0;
        return {
          connection: {
            db: Number.isInteger(database) ? database : 0,
            host: redisUrl.hostname,
            maxRetriesPerRequest: null,
            password: redisUrl.password || undefined,
            port: Number(redisUrl.port || 6379),
            tls: redisUrl.protocol === "rediss:" ? {} : undefined,
            username: redisUrl.username || undefined,
          },
          prefix: "collab-docs",
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
