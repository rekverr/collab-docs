"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../auth/session-provider";
import { workspaceApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { WorkspaceSummary } from "../../lib/api/types";
import { PendingInvitations } from "./pending-invitations";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function WorkspaceSelector() {
  const session = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const loadWorkspaces = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      setWorkspaces(await session.withAccessToken(workspaceApi.list));
    } catch (reason: unknown) {
      setLoadError(apiErrorMessage(reason));
    }
  }, [session]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedSlug = slugify(slug === "" ? name : slug);
    if (normalizedSlug.length < 3) {
      setFormError("Workspace slug must be at least 3 characters.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const workspace = await session.withAccessToken((token) =>
        workspaceApi.create(token, { name: name.trim(), slug: normalizedSlug }),
      );
      router.push(`/app/workspaces/${workspace.id}`);
      router.refresh();
    } catch (reason: unknown) {
      setFormError(apiErrorMessage(reason));
      setPending(false);
    }
  }

  return (
    <main className="workspace-page">
      <section>
        <p className="eyebrow">Your workspaces</p>
        <h1>Choose where to work</h1>
        {workspaces === null && loadError === null && (
          <div className="loading-row">
            <span className="spinner" /> Loading workspaces…
          </div>
        )}
        {loadError !== null && (
          <p className="error-message" role="alert">
            {loadError}
          </p>
        )}
        {workspaces?.length === 0 && (
          <div className="empty-state">
            <strong>No workspaces yet</strong>
            <p>Create your first workspace to get started.</p>
          </div>
        )}
        <div className="workspace-grid">
          {workspaces?.map((workspace) => (
            <Link
              className="workspace-card"
              href={`/app/workspaces/${workspace.id}`}
              key={workspace.id}
            >
              <strong>{workspace.name}</strong>
              <span>{workspace.role.toLowerCase()}</span>
            </Link>
          ))}
        </div>
      </section>
      <PendingInvitations onAccepted={loadWorkspaces} />
      <section className="create-card">
        <h2>Create a workspace</h2>
        <form className="form-stack" onSubmit={createWorkspace}>
          <label>
            Name{" "}
            <input
              required
              minLength={1}
              maxLength={160}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (slug === "") setSlug(slugify(event.target.value));
              }}
              placeholder="Product team"
            />
          </label>
          <label>
            Slug{" "}
            <input
              required
              minLength={3}
              maxLength={120}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={slug}
              onChange={(event) => setSlug(slugify(event.target.value))}
              placeholder="product-team"
            />
          </label>
          {formError !== null && (
            <p className="error-message" role="alert">
              {formError}
            </p>
          )}
          <button className="button" disabled={pending} type="submit">
            {pending ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
