"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "../auth/session-provider";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { WorkspaceSummary } from "../../lib/api/types";

export function WorkspaceShell({ children }: Readonly<{ children: ReactNode }>) {
  const session = useSession();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void session.withAccessToken(workspaceApi.list)
      .then((items) => { if (active) setWorkspaces(items); })
      .catch((reason: unknown) => { if (active) setError(apiErrorMessage(reason)); });
    return () => { active = false; };
  }, [session]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/app">Collab Docs</Link>
        <div className="sidebar-section">
          <span className="sidebar-label">Workspaces</span>
          {workspaces === null && error === null && <p className="muted small">Loading…</p>}
          {error !== null && <p className="error-message small">{error}</p>}
          <nav aria-label="Workspaces">
            {workspaces?.map((workspace) => <Link key={workspace.id} className="workspace-link" href={`/app/workspaces/${workspace.id}`}><span>{workspace.name}</span><small>{workspace.role}</small></Link>)}
          </nav>
        </div>
        <Link className="sidebar-create" href="/app">+ New workspace</Link>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <div><strong>{session.user.displayName ?? session.user.email}</strong><span className="header-email">{session.user.email}</span></div>
          <button className="text-button" type="button" onClick={() => void session.logout()}>Log out</button>
        </header>
        {children}
      </div>
    </div>
  );
}
