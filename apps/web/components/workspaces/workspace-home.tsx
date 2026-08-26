"use client";

import { useEffect, useState } from "react";
import { useSession } from "../auth/session-provider";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { WorkspaceSummary } from "../../lib/api/types";

export function WorkspaceHome({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const session = useSession();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void session.withAccessToken((token) => workspaceApi.get(token, workspaceId))
      .then((item) => { if (active) setWorkspace(item); })
      .catch((reason: unknown) => { if (active) setError(apiErrorMessage(reason)); });
    return () => { active = false; };
  }, [session, workspaceId]);

  if (error !== null) return <main className="workspace-page"><p className="error-message" role="alert">{error}</p></main>;
  if (workspace === null) return <main className="workspace-page"><div className="loading-row"><span className="spinner" /> Loading workspace…</div></main>;
  return (
    <main className="workspace-page">
      <section className="workspace-welcome">
        <p className="eyebrow">{workspace.role}</p>
        <h1>{workspace.name}</h1>
        <p className="muted">Your private workspace is ready. Documents and collaboration will appear here in the next implementation stage.</p>
      </section>
    </main>
  );
}
