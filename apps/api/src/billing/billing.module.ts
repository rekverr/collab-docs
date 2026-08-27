import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { UsageQuotaService } from "./usage-quota.service";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, UsageQuotaService],
  exports: [UsageQuotaService],
})
export class BillingModule {}
