"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type {
  PendingWorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "../../lib/api/types";
import {
  invitationFailed,
  invitationIdle,
  invitationSubmitting,
  invitationSucceeded,
} from "../../lib/workspaces/invitation-state";
import { useSession } from "../auth/session-provider";

export function WorkspaceMembers({ workspace }: Readonly<{ workspace: WorkspaceSummary }>) {
  const session = useSession();
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<PendingWorkspaceInvitation[] | null>(
    null,
  );
  const [membersError, setMembersError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invitationState, setInvitationState] = useState(invitationIdle);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const canManage = workspace.role === "OWNER" || workspace.role === "ADMIN";

  const load = useCallback(async (): Promise<void> => {
    setMembersError(null);
    try {
      const result = await session.withAccessToken((token) =>
        workspaceApi.members(token, workspace.id),
      );
      setMembers(result);
    } catch (reason: unknown) {
      setMembersError(`Could not load workspace members. ${apiErrorMessage(reason)}`);
    }
  }, [session, workspace.id]);

  const loadInvitations = useCallback(async (): Promise<void> => {
    if (!canManage) return;
    setInvitationsError(null);
    try {
      setPendingInvitations(
        await session.withAccessToken((token) =>
          workspaceApi.workspaceInvitations(token, workspace.id),
        ),
      );
    } catch (reason: unknown) {
      setInvitationsError(`Could not refresh pending invitations. ${apiErrorMessage(reason)}`);
    }
  }, [canManage, session, workspace.id]);

  useEffect(() => {
    void load();
    void loadInvitations();
  }, [load, loadInvitations]);

  async function invite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    setInvitationState(invitationSubmitting());
    const form = new FormData(formElement);
    const email = String(form.get("email") ?? "").trim();
    const role = parseAssignableRole(String(form.get("role") ?? "VIEWER"));
    try {
      await session.withAccessToken((token) =>
        workspaceApi.invite(token, workspace.id, { email, role }),
      );
    } catch (reason: unknown) {
      setInvitationState(invitationFailed(apiErrorMessage(reason)));
      return;
    }
    setInvitationState(invitationSucceeded(email, role));
    formElement.reset();
    void loadInvitations();
  }

  async function changeRole(userId: string, role: WorkspaceRole): Promise<void> {
    setBusyUserId(userId);
    setActionError(null);
    try {
      await session.withAccessToken((token) =>
        workspaceApi.updateMemberRole(token, workspace.id, userId, role),
      );
      await load();
    } catch (reason: unknown) {
      setActionError(apiErrorMessage(reason));
    } finally {
      setBusyUserId(null);
    }
  }

  async function remove(userId: string, label: string): Promise<void> {
    if (!window.confirm(`Remove ${label} from this workspace?`)) return;
    setBusyUserId(userId);
    setActionError(null);
    try {
      await session.withAccessToken((token) =>
        workspaceApi.removeMember(token, workspace.id, userId),
      );
      await load();
    } catch (reason: unknown) {
      setActionError(apiErrorMessage(reason));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="member-management">
      {membersError !== null && (
        <p className="error-message small" role="alert">
          {membersError}
        </p>
      )}
      {actionError !== null && (
        <p className="error-message small" role="alert">
          {actionError}
        </p>
      )}
      {members === null && membersError === null && <p className="muted small">Loading members…</p>}
      {members !== null && (
        <ul className="member-list">
          {members.map((member) => {
            const label = member.user.displayName ?? member.user.email;
            const protectedMember =
              member.user.id === workspace.ownerId ||
              (workspace.role !== "OWNER" && member.role === "ADMIN");
            return (
              <li key={member.id}>
                <div>
                  <strong>{label}</strong>
                  <span>{member.user.email}</span>
                </div>
                {canManage && !protectedMember ? (
                  <div className="member-actions">
                    <select
                      aria-label={`Role for ${label}`}
                      value={member.role}
                      disabled={busyUserId === member.user.id}
                      onChange={(event) =>
                        void changeRole(member.user.id, parseAssignableRole(event.target.value))
                      }
                    >
                      {workspace.role === "OWNER" && <option value="ADMIN">Admin</option>}
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      className="text-button danger-text"
                      type="button"
                      disabled={busyUserId === member.user.id}
                      onClick={() => void remove(member.user.id, label)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <span className="dashboard-badge">{member.role}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <form className="member-invite-form" onSubmit={(event) => void invite(event)}>
          <strong>Invite member</strong>
          <div>
            <input
              name="email"
              type="email"
              maxLength={320}
              placeholder="teammate@example.com"
              required
            />
            <select name="role" defaultValue="VIEWER">
              {workspace.role === "OWNER" && <option value="ADMIN">Admin</option>}
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              className="button secondary"
              type="submit"
              disabled={invitationState.status === "submitting"}
            >
              {invitationState.status === "submitting" ? "Inviting…" : "Invite"}
            </button>
          </div>
          {invitationState.status === "error" && (
            <p className="error-message small" role="alert">
              {invitationState.message}
            </p>
          )}
        </form>
      )}

      {invitationState.status === "success" && (
        <div className="invitation-result" role="status">
          <strong>Invitation sent</strong>
          <p className="muted small">
            {invitationState.email} has been invited as {formatRole(invitationState.role)}.
          </p>
        </div>
      )}

      {canManage && (
        <section className="pending-invitations" aria-label="Pending invitations">
          <h3>Pending invitations</h3>
          {invitationsError !== null && (
            <p className="error-message small" role="alert">
              {invitationsError}
            </p>
          )}
          {pendingInvitations === null && invitationsError === null && (
            <p className="muted small">Loading invitations…</p>
          )}
          {pendingInvitations?.length === 0 && (
            <p className="muted small">No pending invitations.</p>
          )}
          {pendingInvitations !== null && pendingInvitations.length > 0 && (
            <ul className="member-list">
              {pendingInvitations.map((invitation) => (
                <li key={invitation.id}>
                  <div>
                    <strong>{invitation.email}</strong>
                    <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                  </div>
                  <span className="dashboard-badge">{formatRole(invitation.role)} · Pending</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function formatRole(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function parseAssignableRole(value: string): Exclude<WorkspaceRole, "OWNER"> {
  if (value === "ADMIN" || value === "EDITOR") return value;
  return "VIEWER";
}
