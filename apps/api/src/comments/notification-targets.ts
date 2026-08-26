import { NotificationType } from "@prisma/client";

export function mentionNotificationTargets(
  actorId: string,
  mentionedUserIds: readonly string[],
): Map<string, NotificationType> {
  return new Map(
    mentionedUserIds
      .filter((recipientId) => recipientId !== actorId)
      .map((recipientId) => [recipientId, NotificationType.MENTION]),
  );
}

export function replyNotificationTargets(
  actorId: string,
  threadAuthorId: string,
  mentionedUserIds: readonly string[],
): Map<string, NotificationType> {
  const targets =
    threadAuthorId === actorId
      ? new Map<string, NotificationType>()
      : new Map([[threadAuthorId, NotificationType.COMMENT_REPLY]]);

  for (const mentionedUserId of mentionedUserIds) {
    if (mentionedUserId !== actorId) {
      targets.set(mentionedUserId, NotificationType.MENTION);
    }
  }

  return targets;
}
