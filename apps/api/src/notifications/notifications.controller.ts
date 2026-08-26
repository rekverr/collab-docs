import { Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { NotificationDto } from "./dto/notification.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List accessible notifications for the current user" })
  @ApiOkResponse({ type: [NotificationDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<NotificationDto[]> {
    return this.notifications.list(user.id);
  }

  @Patch(":notificationId/read")
  @ApiOperation({ summary: "Mark an accessible notification as read" })
  @ApiOkResponse({ type: NotificationDto })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param("notificationId", ParseUUIDPipe) notificationId: string,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(user.id, notificationId);
  }
}
