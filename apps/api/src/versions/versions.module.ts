import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuthModule } from "../auth/auth.module";
import { VersionsController } from "./versions.controller";
import { VersionsService } from "./versions.service";

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue(
      { name: "document-search-index" },
      { name: "public-document-revalidation" },
    ),
  ],
  controllers: [VersionsController],
  providers: [VersionsService],
})
export class VersionsModule {}
