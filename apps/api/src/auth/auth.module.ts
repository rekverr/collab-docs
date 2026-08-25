import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AuthRepository, PrismaAuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { LoginRateLimiter } from "./login-rate-limiter.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenGuard,
    LoginRateLimiter,
    PrismaAuthRepository,
    { provide: AuthRepository, useExisting: PrismaAuthRepository },
  ],
  exports: [AuthService, AccessTokenGuard],
})
export class AuthModule {}
