"use client";

import { useCallback, useEffect, useState } from "react";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { CurrentUserWorkspaceInvitation } from "../../lib/api/types";
import { notifyWorkspacesChanged } from "../../lib/workspaces/workspace-events";
import { useSession } from "../auth/session-provider";

export function PendingInvitations({ onAccepted }: Readonly<{ onAccepted(): Promise<void> }>) {
  const session = useSession();
  const [invitations, setInvitations] = useState<CurrentUserWorkspaceInvitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setInvitations(await session.withAccessToken(workspaceApi.pendingInvitations));
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(invitationId: string, action: "accept" | "decline"): Promise<void> {
    setBusyId(invitationId);
    setError(null);
    try {
      if (action === "accept") {
        await session.withAccessToken((token) =>
          workspaceApi.acceptInvitationById(token, invitationId),
        );
        notifyWorkspacesChanged();
        await onAccepted();
      } else {
        await session.withAccessToken((token) =>
          workspaceApi.declineInvitation(token, invitationId),
        );
      }
      setInvitations((current) => current?.filter(({ id }) => id !== invitationId) ?? null);
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusyId(null);
    }
  }

  if (invitations?.length === 0 && error === null) return null;

  return (
    <section className="create-card pending-invitations" aria-label="Your pending invitations">
      <h2>Pending invitations</h2>
      {invitations === null && error === null && <p className="muted">Loading invitations…</p>}
      {error !== null && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <ul className="member-list">
        {invitations?.map((invitation) => {
          const inviter = invitation.invitedBy?.displayName ?? invitation.invitedBy?.email;
          return (
            <li key={invitation.id}>
              <div>
                <strong>{invitation.workspace.name}</strong>
                <span>
                  {formatRole(invitation.role)}
                  {inviter === undefined ? "" : ` · Invited by ${inviter}`}
                </span>
              </div>
              <div className="member-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busyId === invitation.id}
                  onClick={() => void respond(invitation.id, "accept")}
                >
                  Accept
                </button>
                <button
                  className="text-button danger-text"
                  type="button"
                  disabled={busyId === invitation.id}
                  onClick={() => void respond(invitation.id, "decline")}
                >
                  Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatRole(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
