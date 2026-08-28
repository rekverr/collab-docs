"use client";

import Link from "next/link";
import { useState } from "react";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import { notifyWorkspacesChanged } from "../../lib/workspaces/workspace-events";
import { useSession } from "../auth/session-provider";

export function AcceptInvitation({ token }: Readonly<{ token: string }>) {
  const session = useSession();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const membership = await session.withAccessToken((accessToken) =>
        workspaceApi.acceptInvitation(accessToken, token),
      );
      notifyWorkspacesChanged();
      setWorkspaceId(membership.workspaceId);
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="status-page invitation-page">
      <p className="eyebrow">Workspace invitation</p>
      <h1>{workspaceId === null ? "Join this workspace" : "Invitation accepted"}</h1>
      {workspaceId === null ? (
        <>
          <p className="muted">Accept the invitation using your signed-in account.</p>
          {error !== null && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="button" disabled={pending} onClick={() => void accept()}>
            {pending ? "Accepting…" : "Accept invitation"}
          </button>
        </>
      ) : (
        <Link className="button" href={`/app/workspaces/${workspaceId}`}>
          Open workspace
        </Link>
      )}
    </main>
  );
}
