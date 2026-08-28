"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useSessionState } from "../auth/session-provider";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { WorkspaceSummary } from "../../lib/api/types";
import { NotificationCenter } from "../notifications/notification-center";
import { WorkspaceSearch } from "../search/workspace-search";
import { workspacesChangedEvent } from "../../lib/workspaces/workspace-events";

export function WorkspaceShell({ children }: Readonly<{ children: ReactNode }>) {
  const session = useSessionState();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async (): Promise<void> => {
    if (!session.ready) return;
    setError(null);
    try {
      setWorkspaces(await session.withAccessToken(workspaceApi.list));
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, [session]);

  useEffect(() => {
    if (!session.ready) return;
    const reload = () => void loadWorkspaces();
    window.addEventListener(workspacesChangedEvent, reload);
    void loadWorkspaces();
    return () => {
      window.removeEventListener(workspacesChangedEvent, reload);
    };
  }, [loadWorkspaces, session.ready]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/app">
          Collab Docs
        </Link>
        <div className="sidebar-section">
          <span className="sidebar-label">Workspaces</span>
          {workspaces === null && error === null && <p className="muted small">Loading…</p>}
          {error !== null && <p className="error-message small">{error}</p>}
          <nav aria-label="Workspaces">
            {workspaces?.map((workspace) => (
              <Link
                key={workspace.id}
                className="workspace-link"
                href={`/app/workspaces/${workspace.id}`}
              >
                <span>{workspace.name}</span>
                <small>{workspace.role}</small>
              </Link>
            ))}
          </nav>
        </div>
        <Link className="sidebar-create" href="/app">
          + New workspace
        </Link>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <div>
            <strong>
              {session.user === null
                ? "Restoring session…"
                : (session.user.displayName ?? session.user.email)}
            </strong>
            {session.user !== null && <span className="header-email">{session.user.email}</span>}
          </div>
          {session.ready && (
            <Suspense fallback={<div className="workspace-search-placeholder" />}>
              <WorkspaceSearch />
            </Suspense>
          )}
          <div className="app-header-actions">
            {session.ready && <NotificationCenter />}
            <button
              className="text-button"
              disabled={!session.ready}
              type="button"
              onClick={() => void session.logout()}
            >
              Log out
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
