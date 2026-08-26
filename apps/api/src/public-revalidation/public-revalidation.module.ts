import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { publicRevalidationQueueName } from "./public-revalidation.constants";
import { PublicRevalidationProcessor } from "./public-revalidation.processor";
import { PublicRevalidationService } from "./public-revalidation.service";

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: publicRevalidationQueueName })],
  providers: [PublicRevalidationProcessor, PublicRevalidationService],
  exports: [BullModule, PublicRevalidationService],
})
export class PublicRevalidationModule {}
