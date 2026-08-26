"use client";

import { useCallback, useEffect, useState } from "react";
import { versionApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type {
  DocumentProjectionBlock,
  DocumentVersion,
  DocumentVersionPreview,
} from "../../lib/api/types";
import { isSafeImageUrl } from "../../lib/collaboration/collab-provider";
import { useSession } from "../auth/session-provider";

interface VersionHistoryProps {
  documentId: string;
  canRestore: boolean;
  onClose(): void;
  onRestored(): void;
}

export function VersionHistory({
  documentId,
  canRestore,
  onClose,
  onRestored,
}: Readonly<VersionHistoryProps>) {
  const session = useSession();
  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [preview, setPreview] = useState<DocumentVersionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const result = await session.withAccessToken((token) => versionApi.list(token, documentId));
      setVersions(result);
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, [documentId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function showPreview(versionId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await session.withAccessToken((token) => versionApi.preview(token, documentId, versionId)),
      );
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createVersion(): Promise<void> {
    const value = window.prompt("Version label (optional)");
    if (value === null) return;
    setBusy(true);
    setError(null);
    try {
      await session.withAccessToken((token) =>
        versionApi.create(token, documentId, value.trim() === "" ? undefined : value.trim()),
      );
      await load();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function restoreVersion(version: DocumentVersionPreview): Promise<void> {
    if (!window.confirm(`Restore “${version.title}”? The current state will remain in history.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await session.withAccessToken((token) => versionApi.restore(token, documentId, version.id));
      onRestored();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <div className="history-backdrop" role="presentation">
      <section
        className="history-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
      >
        <header className="history-header">
          <div>
            <p className="eyebrow">Document</p>
            <h2>Version history</h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={onClose}
            aria-label="Close history"
          >
            Close
          </button>
        </header>
        {canRestore && (
          <button
            className="button history-create"
            type="button"
            disabled={busy}
            onClick={() => void createVersion()}
          >
            Save current version
          </button>
        )}
        {error !== null && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {versions === null && error === null && (
          <div className="loading-row">
            <span className="spinner" aria-hidden="true" /> Loading history…
          </div>
        )}
        {versions?.length === 0 && (
          <div className="history-empty">
            <strong>No saved versions</strong>
            <p>Versions will appear after periodic checkpoints or a manual save.</p>
          </div>
        )}
        {preview === null ? (
          <div className="history-list">
            {versions?.map((version) => (
              <button
                key={version.id}
                type="button"
                disabled={busy}
                onClick={() => void showPreview(version.id)}
              >
                <strong>{version.title}</strong>
                <span>{formatTimestamp(version.createdAt)}</span>
                <small>
                  {version.author?.displayName ?? version.author?.email ?? "System checkpoint"}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <VersionPreview
            preview={preview}
            busy={busy}
            canRestore={canRestore}
            onBack={() => setPreview(null)}
            onRestore={() => void restoreVersion(preview)}
          />
        )}
      </section>
    </div>
  );
}

function VersionPreview({
  preview,
  busy,
  canRestore,
  onBack,
  onRestore,
}: Readonly<{
  preview: DocumentVersionPreview;
  busy: boolean;
  canRestore: boolean;
  onBack(): void;
  onRestore(): void;
}>) {
  return (
    <div className="history-preview">
      <div className="history-preview-actions">
        <button className="text-button" type="button" disabled={busy} onClick={onBack}>
          ← All versions
        </button>
        {canRestore && (
          <button className="button" type="button" disabled={busy} onClick={onRestore}>
            Restore this version
          </button>
        )}
      </div>
      <h3>{preview.title}</h3>
      <p className="muted small">
        {formatTimestamp(preview.createdAt)} ·{" "}
        {preview.author?.displayName ?? preview.author?.email ?? "System checkpoint"}
      </p>
      <div className="version-projection">
        {preview.contentProjection.blocks.length === 0 ? (
          <p className="muted">This version is empty.</p>
        ) : (
          preview.contentProjection.blocks.map((block) => (
            <PreviewBlock key={block.id} block={block} />
          ))
        )}
      </div>
    </div>
  );
}

function PreviewBlock({ block }: Readonly<{ block: DocumentProjectionBlock }>) {
  if (block.type === "heading") {
    if (block.level === 1) return <h1>{block.text}</h1>;
    if (block.level === 2) return <h2>{block.text}</h2>;
    return <h3>{block.text}</h3>;
  }
  if (block.type === "paragraph") return <p>{block.text}</p>;
  if (block.type === "list") {
    const items = block.items.map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>);
    return block.style === "numbered" ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  if (block.type === "task")
    return (
      <p>
        {block.checked ? "☑" : "☐"} {block.text}
      </p>
    );
  if (block.type === "code")
    return (
      <pre>
        <code>{block.text}</code>
      </pre>
    );
  if (block.source.kind === "url" && isSafeImageUrl(block.source.url)) {
    return <img src={block.source.url} alt={block.alt} />;
  }
  return <p className="muted">Image attachment · {block.alt || "No description"}</p>;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
