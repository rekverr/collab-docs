import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { NotificationDto } from "./dto/notification.dto";

const notificationSelect = {
  id: true,
  type: true,
  workspaceId: true,
  documentId: true,
  commentId: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, email: true, displayName: true } },
  workspace: { select: { name: true } },
  document: { select: { title: true } },
} satisfies Prisma.NotificationSelect;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<NotificationDto[]> {
    const notifications = await this.prisma.notification.findMany({
      where: accessibleNotificationWhere(userId),
      orderBy: { createdAt: "desc" },
      take: 50,
      select: notificationSelect,
    });
    return notifications.map(mapNotification);
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, ...accessibleNotificationWhere(userId) },
      select: { id: true },
    });
    if (notification === null) throw new NotFoundException("Notification not found");
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
      select: notificationSelect,
    });
    return mapNotification(updated);
  }
}

type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

function accessibleNotificationWhere(userId: string): Prisma.NotificationWhereInput {
  return {
    recipientId: userId,
    document: {
      is: {
        deletedAt: null,
        archivedAt: null,
        workspace: {
          deletedAt: null,
          members: { some: { userId } },
        },
      },
    },
  };
}

function mapNotification(notification: NotificationRecord): NotificationDto {
  return {
    id: notification.id,
    type: notification.type,
    workspaceId: notification.workspaceId,
    workspaceName: notification.workspace?.name ?? null,
    documentId: notification.documentId,
    documentTitle: notification.document?.title ?? null,
    commentId: notification.commentId,
    actor: notification.actor,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}
