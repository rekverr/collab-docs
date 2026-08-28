import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { ObjectStorageService } from "./object-storage.service";

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, ObjectStorageService],
  exports: [ObjectStorageService],
})
export class AttachmentsModule {}
