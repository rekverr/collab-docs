import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { searchIndexQueueName } from "./search.constants";
import { SearchController } from "./search.controller";
import { SearchIndexProcessor } from "./search-index.processor";
import { SearchIndexService } from "./search-index.service";
import { SearchService } from "./search.service";

@Global()
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: searchIndexQueueName })],
  controllers: [SearchController],
  providers: [SearchService, SearchIndexProcessor, SearchIndexService],
  exports: [BullModule, SearchIndexService],
})
export class SearchModule {}
