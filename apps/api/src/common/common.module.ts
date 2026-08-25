import { Global, Module } from "@nestjs/common";
import { AllExceptionsFilter } from "./errors/all-exceptions.filter";
import { JsonLogger } from "./logging/json-logger.service";

@Global()
@Module({
  providers: [JsonLogger, AllExceptionsFilter],
  exports: [JsonLogger, AllExceptionsFilter],
})
export class CommonModule {}
