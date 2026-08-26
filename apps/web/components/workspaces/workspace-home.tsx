"use client";

import { useEffect, useState } from "react";
import { useSession } from "../auth/session-provider";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { WorkspaceSummary } from "../../lib/api/types";
import { DocumentNavigation } from "../documents/document-navigation";

export function WorkspaceHome({ workspaceId, selectedDocumentId }: Readonly<{ workspaceId: string; selectedDocumentId?: string }>) {
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
    <main className="document-workspace">
      <DocumentNavigation workspaceId={workspace.id} role={workspace.role} selectedDocumentId={selectedDocumentId} />
      <section className="document-placeholder">
        <p className="eyebrow">{workspace.name} · {workspace.role}</p>
        <h1>{selectedDocumentId === undefined ? "Select a document" : "Document selected"}</h1>
        <p className="muted">{selectedDocumentId === undefined ? "Choose a page from the navigation or create a new one." : "Document content editing will be implemented separately. Metadata navigation is active."}</p>
      </section>
    </main>
  );
}
