import { Module } from "@nestjs/common";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { ObjectStorageService } from "./object-storage.service";

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, ObjectStorageService],
})
export class AttachmentsModule {}
