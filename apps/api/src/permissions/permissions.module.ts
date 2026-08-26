import { Global, Module } from "@nestjs/common";
import { PolicyService } from "./policy.service";
import { AuthModule } from "../auth/auth.module";
import { CollaborationAccessController } from "./collaboration-access.controller";
import { CollaborationAccessService } from "./collaboration-access.service";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [CollaborationAccessController],
  providers: [PolicyService, CollaborationAccessService],
  exports: [PolicyService],
})
export class PermissionsModule {}
