import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { CollaborationAccessService, type CollaborationAccess } from "./collaboration-access.service";

@ApiTags("internal-collaboration")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller("internal/collaboration")
export class CollaborationAccessController {
  constructor(private readonly access: CollaborationAccessService) {}

  @Get("documents/:documentId/access")
  @ApiOperation({ summary: "Resolve authoritative collaboration access" })
  @ApiOkResponse({ description: "Authenticated identity and current document write capability" })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ): Promise<CollaborationAccess> { return this.access.resolve(user, documentId); }
}
