import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser } from "./auth.types";

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: AuthenticatedUser;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    if (authorization === undefined || !authorization.startsWith("Bearer "))
      throw new UnauthorizedException("Access token is required");
    request.authenticatedUser = await this.auth.authenticateAccessToken(authorization.slice(7));
    return true;
  }
}
