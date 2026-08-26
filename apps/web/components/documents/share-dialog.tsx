"use client";

import { useCallback, useEffect, useState } from "react";
import { sharingApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type {
  DocumentAccessMode,
  DocumentShareLink,
  DocumentSharingState,
} from "../../lib/api/types";
import { useSession } from "../auth/session-provider";

export function ShareDialog({
  documentId,
  onClose,
}: Readonly<{ documentId: string; onClose(): void }>) {
  const session = useSession();
  const [state, setState] = useState<DocumentSharingState | null>(null);
  const [mode, setMode] = useState<DocumentAccessMode>("VIEW");
  const [expiresAt, setExpiresAt] = useState("");
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setState(await session.withAccessToken((token) => sharingApi.state(token, documentId)));
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, [documentId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(operation: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await operation();
      await load();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("Link copied.");
    } catch {
      setError("Could not copy the link. Copy it manually from the field.");
    }
  }

  async function createLink(): Promise<void> {
    await run(async () => {
      const link = await session.withAccessToken((token) =>
        sharingApi.createLink(token, documentId, {
          accessMode: mode,
          ...(expiresAt === "" ? {} : { expiresAt: new Date(expiresAt).toISOString() }),
        }),
      );
      setFreshUrl(link.url);
      if (link.url !== null) await copy(link.url);
    });
  }

  return (
    <div className="history-backdrop" role="presentation">
      <section className="history-panel share-panel" role="dialog" aria-modal="true">
        <header className="history-header">
          <div>
            <p className="eyebrow">Document access</p>
            <h2>Publish and share</h2>
          </div>
          <button className="text-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {error !== null && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {feedback !== null && (
          <p className="share-feedback" role="status">
            {feedback}
          </p>
        )}
        {state === null && error === null && (
          <div className="loading-row">
            <span className="spinner" aria-hidden="true" /> Loading sharing state…
          </div>
        )}

        {state !== null && (
          <>
            <section className="share-section">
              <div>
                <strong>Public publication</strong>
                <p className="muted small">
                  {state.published
                    ? "Anyone with the stable public URL can view this document."
                    : "This document is not publicly published."}
                </p>
              </div>
              <button
                className={`button ${state.published ? "secondary" : ""}`}
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await session.withAccessToken((token) =>
                      sharingApi.setPublished(token, documentId, !state.published),
                    );
                  })
                }
              >
                {state.published ? "Unpublish" : "Publish"}
              </button>
              {state.published && state.publicUrl !== null && (
                <CopyableLink
                  value={state.publicUrl}
                  onCopy={() => {
                    if (state.publicUrl !== null) void copy(state.publicUrl);
                  }}
                />
              )}
            </section>

            <section className="share-section">
              <div>
                <strong>Create share link</strong>
                <p className="muted small">
                  Editable links grant edit access only to this document.
                </p>
              </div>
              <label>
                <span className="sidebar-label">Access</span>
                <select
                  value={mode}
                  disabled={busy}
                  onChange={(event) => setMode(event.target.value === "EDIT" ? "EDIT" : "VIEW")}
                >
                  <option value="VIEW">View only</option>
                  <option value="EDIT">Can edit</option>
                </select>
              </label>
              <label>
                <span className="sidebar-label">Expiration (optional)</span>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  disabled={busy}
                  min={minimumLocalDateTime()}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void createLink()}
              >
                Generate and copy link
              </button>
              {freshUrl !== null && (
                <CopyableLink value={freshUrl} onCopy={() => void copy(freshUrl)} />
              )}
            </section>

            <section className="share-section">
              <strong>Existing links</strong>
              {state.links.length === 0 && <p className="muted small">No share links yet.</p>}
              <div className="share-link-list">
                {state.links.map((link) => (
                  <ShareLinkRow
                    key={link.id}
                    link={link}
                    busy={busy}
                    onRevoke={() =>
                      void run(async () => {
                        await session.withAccessToken((token) =>
                          sharingApi.revokeLink(token, link.id),
                        );
                      })
                    }
                    onRegenerate={() =>
                      void run(async () => {
                        const replacement = await session.withAccessToken((token) =>
                          sharingApi.regenerateLink(token, link.id),
                        );
                        setFreshUrl(replacement.url);
                        if (replacement.url !== null) await copy(replacement.url);
                      })
                    }
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  );
}

function ShareLinkRow({
  link,
  busy,
  onRevoke,
  onRegenerate,
}: Readonly<{
  link: DocumentShareLink;
  busy: boolean;
  onRevoke(): void;
  onRegenerate(): void;
}>) {
  const expired = link.expiresAt !== null && new Date(link.expiresAt) <= new Date();
  const active = link.revokedAt === null && !expired;
  return (
    <div className="share-link-row">
      <div>
        <strong>{link.accessMode === "EDIT" ? "Can edit" : "View only"}</strong>
        <span>
          {active
            ? expirationLabel(link.expiresAt)
            : link.revokedAt === null
              ? "Expired"
              : "Revoked"}
        </span>
      </div>
      <div>
        {active && (
          <button className="text-button" type="button" disabled={busy} onClick={onRevoke}>
            Revoke
          </button>
        )}
        <button className="text-button" type="button" disabled={busy} onClick={onRegenerate}>
          Regenerate
        </button>
      </div>
    </div>
  );
}

function CopyableLink({ value, onCopy }: Readonly<{ value: string; onCopy(): void }>) {
  return (
    <div className="copyable-link">
      <input value={value} readOnly aria-label="Share URL" />
      <button className="text-button" type="button" onClick={onCopy}>
        Copy
      </button>
    </div>
  );
}

function minimumLocalDateTime(): string {
  const date = new Date(Date.now() + 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function expirationLabel(value: string | null): string {
  if (value === null) return "No expiration";
  const date = new Date(value);
  return `Expires ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}
