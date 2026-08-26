"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { commentApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { CommentAuthor, CommentThread, DocumentComment } from "../../lib/api/types";
import { useSession } from "../auth/session-provider";

interface CommentPanelProps {
  documentId: string;
  blockId: string | null;
  canEditDocument: boolean;
  onClose(): void;
}

export function CommentPanel({
  documentId,
  blockId,
  canEditDocument,
  onClose,
}: Readonly<CommentPanelProps>) {
  const session = useSession();
  const [threads, setThreads] = useState<CommentThread[] | null>(null);
  const [candidates, setCandidates] = useState<CommentAuthor[]>([]);
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [nextThreads, nextCandidates] = await Promise.all([
        session.withAccessToken((token) => commentApi.list(token, documentId)),
        session.withAccessToken((token) => commentApi.mentionCandidates(token, documentId)),
      ]);
      setThreads(nextThreads);
      setCandidates(nextCandidates);
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, [documentId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleThreads = useMemo(
    () =>
      blockId === null
        ? threads
        : (threads?.filter((thread) => thread.blockId === blockId) ?? null),
    [blockId, threads],
  );

  async function runMutation(operation: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await load();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createComment(): Promise<void> {
    if (body.trim() === "") return;
    await runMutation(async () => {
      await session.withAccessToken((token) =>
        commentApi.create(token, documentId, {
          body: body.trim(),
          ...(blockId === null ? {} : { blockId }),
        }),
      );
      setBody("");
    });
  }

  async function createReply(threadId: string): Promise<void> {
    if (replyBody.trim() === "") return;
    await runMutation(async () => {
      await session.withAccessToken((token) => commentApi.reply(token, threadId, replyBody.trim()));
      setReplyBody("");
      setReplyingTo(null);
    });
  }

  return (
    <div className="history-backdrop" role="presentation">
      <section className="history-panel comment-panel" role="dialog" aria-modal="true">
        <header className="history-header">
          <div>
            <p className="eyebrow">{blockId === null ? "Document" : "Selected block"}</p>
            <h2>Comments</h2>
          </div>
          <button className="text-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <CommentComposer
          value={body}
          candidates={candidates}
          disabled={busy}
          label="New comment"
          submitLabel="Comment"
          onChange={setBody}
          onSubmit={() => void createComment()}
        />

        {error !== null && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {threads === null && error === null && (
          <div className="loading-row">
            <span className="spinner" aria-hidden="true" /> Loading comments…
          </div>
        )}
        {visibleThreads?.length === 0 && (
          <div className="history-empty">
            <strong>No comments yet</strong>
            <p>Start a discussion without changing the document content.</p>
          </div>
        )}
        <div className="comment-thread-list">
          {visibleThreads?.map((thread) => (
            <CommentThreadCard
              key={thread.id}
              thread={thread}
              currentUserId={session.user.id}
              canEditDocument={canEditDocument}
              candidates={candidates}
              busy={busy}
              replying={replyingTo === thread.id}
              replyBody={replyBody}
              onReplyBodyChange={setReplyBody}
              onStartReply={() => {
                setReplyingTo(thread.id);
                setReplyBody("");
              }}
              onCancelReply={() => setReplyingTo(null)}
              onSubmitReply={() => void createReply(thread.id)}
              onResolve={(resolved) =>
                void runMutation(() =>
                  session.withAccessToken(async (token) => {
                    await commentApi.setResolved(token, thread.id, resolved);
                  }),
                )
              }
              onEdit={(comment) => {
                const value = window.prompt("Edit comment", comment.body);
                if (value === null || value.trim() === "") return;
                void runMutation(() =>
                  session.withAccessToken(async (token) => {
                    await commentApi.edit(token, comment.id, value.trim());
                  }),
                );
              }}
              onDelete={(comment) => {
                if (!window.confirm("Delete this comment?")) return;
                void runMutation(() =>
                  session.withAccessToken((token) => commentApi.delete(token, comment.id)),
                );
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CommentThreadCard({
  thread,
  currentUserId,
  canEditDocument,
  candidates,
  busy,
  replying,
  replyBody,
  onReplyBodyChange,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onResolve,
  onEdit,
  onDelete,
}: Readonly<{
  thread: CommentThread;
  currentUserId: string;
  canEditDocument: boolean;
  candidates: CommentAuthor[];
  busy: boolean;
  replying: boolean;
  replyBody: string;
  onReplyBodyChange(value: string): void;
  onStartReply(): void;
  onCancelReply(): void;
  onSubmitReply(): void;
  onResolve(resolved: boolean): void;
  onEdit(comment: DocumentComment): void;
  onDelete(comment: DocumentComment): void;
}>) {
  const mayResolve = canEditDocument || thread.author.id === currentUserId;

  return (
    <article className={`comment-thread ${thread.resolvedAt === null ? "" : "resolved"}`}>
      <CommentEntry
        comment={thread}
        currentUserId={currentUserId}
        busy={busy}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <div className="comment-replies">
        {thread.replies.map((reply) => (
          <CommentEntry
            key={reply.id}
            comment={reply}
            currentUserId={currentUserId}
            busy={busy}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
      <div className="comment-thread-actions">
        <button className="text-button" type="button" disabled={busy} onClick={onStartReply}>
          Reply
        </button>
        {mayResolve && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => onResolve(thread.resolvedAt === null)}
          >
            {thread.resolvedAt === null ? "Resolve" : "Reopen"}
          </button>
        )}
      </div>
      {replying && (
        <CommentComposer
          value={replyBody}
          candidates={candidates}
          disabled={busy}
          label="Reply"
          submitLabel="Reply"
          onChange={onReplyBodyChange}
          onSubmit={onSubmitReply}
          onCancel={onCancelReply}
        />
      )}
    </article>
  );
}

function CommentEntry({
  comment,
  currentUserId,
  busy,
  onEdit,
  onDelete,
}: Readonly<{
  comment: DocumentComment;
  currentUserId: string;
  busy: boolean;
  onEdit(comment: DocumentComment): void;
  onDelete(comment: DocumentComment): void;
}>) {
  const own = comment.author.id === currentUserId;
  return (
    <div className="comment-entry">
      <div className="comment-entry-meta">
        <strong>{comment.author.displayName ?? comment.author.email}</strong>
        <time dateTime={comment.createdAt}>{formatTimestamp(comment.createdAt)}</time>
      </div>
      <p className={comment.deleted ? "muted" : undefined}>{comment.body}</p>
      {own && !comment.deleted && (
        <div className="comment-entry-actions">
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => onEdit(comment)}
          >
            Edit
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => onDelete(comment)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function CommentComposer({
  value,
  candidates,
  disabled,
  label,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: Readonly<{
  value: string;
  candidates: CommentAuthor[];
  disabled: boolean;
  label: string;
  submitLabel: string;
  onChange(value: string): void;
  onSubmit(): void;
  onCancel?(): void;
}>) {
  function mention(candidate: CommentAuthor): void {
    const name = candidate.displayName ?? candidate.email;
    onChange(
      `${value}${value === "" || value.endsWith(" ") ? "" : " "}@[${name}](${candidate.id}) `,
    );
  }

  return (
    <div className="comment-composer">
      <label>
        <span className="sidebar-label">{label}</span>
        <textarea
          value={value}
          maxLength={4000}
          disabled={disabled}
          placeholder="Write a comment…"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="mention-candidates" aria-label="Mention a workspace member">
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            disabled={disabled}
            onClick={() => mention(candidate)}
          >
            @{candidate.displayName ?? candidate.email}
          </button>
        ))}
      </div>
      <div className="comment-composer-actions">
        {onCancel !== undefined && (
          <button className="text-button" type="button" disabled={disabled} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="button"
          type="button"
          disabled={disabled || value.trim() === ""}
          onClick={onSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
