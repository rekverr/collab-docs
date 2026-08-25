import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "./access-token.guard";
import type { AuthenticatedUser } from "./auth.types";

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().authenticatedUser;
  if (user === undefined) throw new UnauthorizedException("Authentication is required");
  return user;
});
