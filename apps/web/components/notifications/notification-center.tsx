"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { notificationApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { UserNotification } from "../../lib/api/types";
import { useSession } from "../auth/session-provider";

export function NotificationCenter() {
  const session = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<UserNotification[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setNotifications(await session.withAccessToken(notificationApi.list));
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openNotification(notification: UserNotification): Promise<void> {
    setBusyId(notification.id);
    setError(null);
    try {
      const updated =
        notification.readAt === null
          ? await session.withAccessToken((token) =>
              notificationApi.markRead(token, notification.id),
            )
          : notification;
      setNotifications(
        (current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null,
      );
      setOpen(false);
      if (notification.workspaceId !== null && notification.documentId !== null) {
        router.push(
          `/app/workspaces/${notification.workspaceId}/documents/${notification.documentId}`,
        );
      }
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

  const unreadCount = notifications?.filter(({ readAt }) => readAt === null).length ?? 0;

  return (
    <div className="notification-center">
      <button
        className="text-button notification-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Notifications
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <header>
            <strong>Notifications</strong>
            <button className="text-button" type="button" onClick={() => void load()}>
              Refresh
            </button>
          </header>
          {error !== null && (
            <p className="error-message small" role="alert">
              {error}
            </p>
          )}
          {notifications === null && error === null && (
            <div className="loading-row small">
              <span className="spinner" aria-hidden="true" /> Loading…
            </div>
          )}
          {notifications?.length === 0 && <p className="muted small">Nothing new yet.</p>}
          <div className="notification-list">
            {notifications?.map((notification) => (
              <button
                key={notification.id}
                className={notification.readAt === null ? "unread" : undefined}
                type="button"
                disabled={busyId === notification.id}
                onClick={() => void openNotification(notification)}
              >
                <strong>{notificationLabel(notification)}</strong>
                <span>
                  {notification.documentTitle ?? notification.workspaceName ?? "Collab Docs"}
                </span>
                <time dateTime={notification.createdAt}>
                  {formatTimestamp(notification.createdAt)}
                </time>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function notificationLabel(notification: UserNotification): string {
  const actor = notification.actor?.displayName ?? notification.actor?.email ?? "Someone";
  if (notification.type === "MENTION") return `${actor} mentioned you`;
  if (notification.type === "COMMENT_REPLY") return `${actor} replied to a comment`;
  if (notification.type === "COMMENT_RESOLVED") return `${actor} resolved your comment`;
  if (notification.type === "DOCUMENT_SHARED") return `${actor} shared a document`;
  return "Workspace invitation";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
