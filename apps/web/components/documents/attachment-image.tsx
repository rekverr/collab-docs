"use client";

import { Image } from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { attachmentApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import { isSafeImageUrl } from "../../lib/collaboration/collab-provider";
import { useSession } from "../auth/session-provider";

export const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes) => {
          const value: unknown = Reflect.get(attributes, "attachmentId");
          return typeof value === "string" && value !== "" ? { "data-attachment-id": value } : {};
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentImageView);
  },
});

function AttachmentImageView({ node, editor, deleteNode }: ReactNodeViewProps) {
  const session = useSession();
  const rawAttachmentId: unknown = Reflect.get(node.attrs, "attachmentId");
  const attachmentId = typeof rawAttachmentId === "string" ? rawAttachmentId : null;
  const rawSource: unknown = Reflect.get(node.attrs, "src");
  const directSource =
    typeof rawSource === "string" && isSafeImageUrl(rawSource) ? rawSource : null;
  const rawAlt: unknown = Reflect.get(node.attrs, "alt");
  const alt = typeof rawAlt === "string" ? rawAlt : "";
  const [source, setSource] = useState<string | null>(directSource);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (attachmentId === null) return;
    let active = true;
    setError(null);
    void session
      .withAccessToken((token) => attachmentApi.download(token, attachmentId))
      .then(({ url }) => {
        if (active) setSource(url);
      })
      .catch((reason: unknown) => {
        if (active) setError(apiErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [attachmentId, session]);

  async function removeAttachment(): Promise<void> {
    if (attachmentId === null || !window.confirm("Delete this uploaded image?")) return;
    setDeleting(true);
    setError(null);
    try {
      await session.withAccessToken((token) => attachmentApi.delete(token, attachmentId));
      deleteNode();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
      setDeleting(false);
    }
  }

  return (
    <NodeViewWrapper className="attachment-image">
      {source === null && error === null && (
        <span className="loading-row small">
          <span className="spinner" aria-hidden="true" /> Loading image…
        </span>
      )}
      {source !== null && <img src={source} alt={alt} />}
      {error !== null && (
        <span className="error-message small" role="alert">
          {error}
        </span>
      )}
      {attachmentId !== null && editor.isEditable && (
        <button
          className="text-button attachment-delete"
          type="button"
          disabled={deleting}
          onClick={() => void removeAttachment()}
        >
          {deleting ? "Deleting…" : "Delete image"}
        </button>
      )}
    </NodeViewWrapper>
  );
}
