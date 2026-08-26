import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CommonModule } from "./common/common.module";
import { validateEnvironment } from "./common/config/environment";
import { RequestObservabilityMiddleware } from "./common/request/request-observability.middleware";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { QueueModule } from "./infrastructure/queue/queue.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { MetricsModule } from "./metrics/metrics.module";
import { AuthModule } from "./auth/auth.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { DocumentsModule } from "./documents/documents.module";
import { VersionsModule } from "./versions/versions.module";
import { CommentsModule } from "./comments/comments.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { DocumentSharingModule } from "./document-sharing/document-sharing.module";

@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, validate: validateEnvironment }),
    CommonModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    MetricsModule,
    HealthModule,
    AuthModule,
    PermissionsModule,
    WorkspacesModule,
    DocumentsModule,
    VersionsModule,
    CommentsModule,
    NotificationsModule,
    AttachmentsModule,
    DocumentSharingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestObservabilityMiddleware).forRoutes("*");
  }
}
