import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AttachmentsModule } from "../attachments/attachments.module";
import { DocumentSharingController } from "./document-sharing.controller";
import { DocumentSharingService } from "./document-sharing.service";
import { ShareLinkRateLimiter } from "./share-link-rate-limiter.service";

@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [DocumentSharingController],
  providers: [DocumentSharingService, ShareLinkRateLimiter],
})
export class DocumentSharingModule {}
