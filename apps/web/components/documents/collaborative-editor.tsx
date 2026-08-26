"use client";

import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Image } from "@tiptap/extension-image";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { UniqueID } from "@tiptap/extension-unique-id";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { authApi } from "../../lib/api/client";
import type { WorkspaceRole } from "../../lib/api/types";
import {
  CollabWebSocketProvider,
  collaboratorColor,
  isSafeImageUrl,
  type CollaborationConnectionState,
  type CollaborationUser,
} from "../../lib/collaboration/collab-provider";
import { useSession } from "../auth/session-provider";
import { VersionHistory } from "./version-history";
import { CommentPanel } from "./comment-panel";

interface CollaborativeEditorProps {
  documentId: string;
  role: WorkspaceRole;
}

interface EditorRuntime {
  document: Y.Doc;
  provider: CollabWebSocketProvider;
  user: CollaborationUser;
}

export function CollaborativeEditor({ documentId, role }: Readonly<CollaborativeEditorProps>) {
  const [generation, setGeneration] = useState(0);
  return (
    <CollaborativeEditorSession
      key={`${documentId}-${generation}`}
      documentId={documentId}
      role={role}
      onReloadRequired={() => setGeneration((value) => value + 1)}
    />
  );
}

function CollaborativeEditorSession({
  documentId,
  role,
  onReloadRequired,
}: Readonly<CollaborativeEditorProps & { onReloadRequired(): void }>) {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const readOnly = role === "VIEWER";
  const [runtime] = useState<EditorRuntime>(() => {
    const document = new Y.Doc();
    const user: CollaborationUser = {
      id: session.user.id,
      name: session.user.displayName ?? session.user.email,
      email: session.user.email,
      color: collaboratorColor(session.user.id),
    };
    return {
      document,
      user,
      provider: new CollabWebSocketProvider({
        document,
        documentId,
        readOnly,
        url: process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:3002",
        user,
        getAccessToken: () =>
          sessionRef.current.withAccessToken(async (accessToken) => {
            await authApi.me(accessToken);
            return accessToken;
          }),
      }),
    };
  });
  const [connectionState, setConnectionState] = useState<CollaborationConnectionState>(
    runtime.provider.getState(),
  );
  const [hasConnected, setHasConnected] = useState(false);
  const [commentTarget, setCommentTarget] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = runtime.provider.subscribe((state) => {
      if (state === "reload-required") {
        onReloadRequired();
        return;
      }
      setConnectionState(state);
      if (state === "connected") setHasConnected(true);
    });
    runtime.provider.connect();
    return () => {
      unsubscribe();
      runtime.provider.destroy();
      runtime.document.destroy();
    };
  }, [onReloadRequired, runtime]);

  if (connectionState === "permission-revoked") {
    return (
      <TerminalEditorState
        title="Permission revoked"
        message="Your access changed. Editing and synchronization have stopped."
      />
    );
  }
  if (connectionState === "deleted") {
    return (
      <TerminalEditorState
        title="Document deleted"
        message="This document is no longer available. No further updates will be accepted."
      />
    );
  }

  return (
    <section className="collaborative-editor" aria-label="Collaborative document editor">
      <EditorHeader
        connectionState={connectionState}
        provider={runtime.provider}
        readOnly={readOnly}
        documentId={documentId}
        onRestored={onReloadRequired}
        onComments={() => setCommentTarget(null)}
      />
      {hasConnected ? (
        <EditorSurface
          runtime={runtime}
          readOnly={readOnly}
          connectionState={connectionState}
          onCommentBlock={(blockId) => setCommentTarget(blockId)}
        />
      ) : (
        <div className="editor-loading loading-row">
          <span className="spinner" aria-hidden="true" />
          Connecting to the document…
        </div>
      )}
      {commentTarget !== undefined && (
        <CommentPanel
          documentId={documentId}
          blockId={commentTarget}
          canEditDocument={!readOnly}
          onClose={() => setCommentTarget(undefined)}
        />
      )}
    </section>
  );
}

function EditorSurface({
  runtime,
  readOnly,
  connectionState,
  onCommentBlock,
}: Readonly<{
  runtime: EditorRuntime;
  readOnly: boolean;
  connectionState: CollaborationConnectionState;
  onCommentBlock(blockId: string): void;
}>) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly && connectionState === "connected",
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: false }),
      UniqueID.configure({
        types: [
          "paragraph",
          "heading",
          "bulletList",
          "orderedList",
          "taskItem",
          "image",
          "codeBlock",
        ],
        updateDocument: !readOnly,
      }),
      Collaboration.configure({ document: runtime.document, field: "prosemirror" }),
      CollaborationCaret.configure({
        provider: runtime.provider,
        user: runtime.user,
        render: (user) => createRemoteCaret(user),
        selectionRender: (user) => ({
          nodeName: "span",
          class: "collaboration-selection",
          style: `background-color: ${colorFromAwarenessUser(user)}33`,
        }),
      }),
    ],
  });

  useEffect(() => {
    editor?.setEditable(!readOnly && connectionState === "connected");
  }, [connectionState, editor, readOnly]);

  function addImage(): void {
    const value = window.prompt("HTTPS image URL");
    if (value === null) return;
    const source = value.trim();
    if (!isSafeImageUrl(source)) {
      window.alert("Use an HTTPS URL (or localhost HTTP during development).");
      return;
    }
    editor?.chain().focus().setImage({ src: source, alt: "" }).run();
  }

  function commentOnSelectedBlock(): void {
    if (editor === null) return;
    const blockId = selectedBlockId(editor);
    if (blockId === null) {
      window.alert("Place the cursor inside a saved content block first.");
      return;
    }
    onCommentBlock(blockId);
  }

  return (
    <>
      {!readOnly && (
        <EditorToolbar
          editor={editor}
          onAddImage={addImage}
          onCommentBlock={commentOnSelectedBlock}
        />
      )}
      {readOnly && (
        <div className="editor-readonly-note">
          <span>You can read this document, but your role cannot edit it.</span>
          <button className="text-button" type="button" onClick={commentOnSelectedBlock}>
            Comment selected block
          </button>
        </div>
      )}
      <EditorContent editor={editor} className="editor-content" />
    </>
  );
}

function EditorToolbar({
  editor,
  onAddImage,
  onCommentBlock,
}: Readonly<{
  editor: Editor | null;
  onAddImage(): void;
  onCommentBlock(): void;
}>) {
  const unavailable = editor === null;
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Block formatting">
      <button
        disabled={unavailable}
        type="button"
        onClick={() => editor?.chain().focus().setParagraph().run()}
      >
        Text
      </button>
      <button
        disabled={unavailable}
        type="button"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </button>
      <button
        disabled={unavailable}
        type="button"
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        disabled={unavailable}
        type="button"
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        Bullets
      </button>
      <button
        disabled={unavailable}
        type="button"
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        Numbers
      </button>
      <button
        disabled={unavailable}
        type="button"
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        Task
      </button>
      <button
        disabled={unavailable}
        type="button"
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      >
        Code
      </button>
      <button disabled={unavailable} type="button" onClick={onAddImage}>
        Image
      </button>
      <button disabled={unavailable} type="button" onClick={onCommentBlock}>
        Comment block
      </button>
    </div>
  );
}

function EditorHeader({
  connectionState,
  provider,
  readOnly,
  documentId,
  onRestored,
  onComments,
}: Readonly<{
  connectionState: CollaborationConnectionState;
  provider: CollabWebSocketProvider;
  readOnly: boolean;
  documentId: string;
  onRestored(): void;
  onComments(): void;
}>) {
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const update = (): void => {
      const users = [...provider.awareness.getStates().values()]
        .map((state) => parseAwarenessUser(state))
        .filter((user): user is CollaborationUser => user !== null);
      setCollaborators(
        users.filter((user, index) => users.findIndex(({ id }) => id === user.id) === index),
      );
    };
    update();
    provider.awareness.on("update", update);
    return () => provider.awareness.off("update", update);
  }, [provider]);

  return (
    <header className="editor-header">
      <div>
        <span className={`connection-status ${connectionState}`} aria-live="polite">
          {connectionLabel(connectionState)}
        </span>
        {readOnly && <span className="editor-mode">Viewer · read only</span>}
      </div>
      <div className="editor-header-actions">
        <button className="text-button history-trigger" type="button" onClick={onComments}>
          Comments
        </button>
        <button
          className="text-button history-trigger"
          type="button"
          onClick={() => setHistoryOpen(true)}
        >
          History
        </button>
        <div
          className="collaborator-list"
          aria-label={`${collaborators.length} collaborators present`}
        >
          {collaborators.map((user) => (
            <span
              className="collaborator-avatar"
              key={user.id}
              style={{ backgroundColor: user.color }}
              title={`${user.name} (${user.email})`}
            >
              {initials(user.name)}
            </span>
          ))}
        </div>
      </div>
      {historyOpen && (
        <VersionHistory
          documentId={documentId}
          canRestore={!readOnly}
          onClose={() => setHistoryOpen(false)}
          onRestored={onRestored}
        />
      )}
    </header>
  );
}

function selectedBlockId(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const id: unknown = $from.node(depth).attrs.id;
    if (typeof id === "string" && id !== "") return id;
  }
  return null;
}

function TerminalEditorState({ title, message }: Readonly<{ title: string; message: string }>) {
  return (
    <section className="editor-terminal" role="alert">
      <p className="eyebrow">Collaboration ended</p>
      <h1>{title}</h1>
      <p className="muted">{message}</p>
    </section>
  );
}

function parseAwarenessUser(state: unknown): CollaborationUser | null {
  if (!isRecord(state)) return null;
  const user = Reflect.get(state, "user");
  if (!isRecord(user)) return null;
  const id = Reflect.get(user, "id");
  const email = Reflect.get(user, "email");
  const displayName = Reflect.get(user, "displayName");
  const name = Reflect.get(user, "name");
  if (typeof id !== "string" || typeof email !== "string") return null;
  return {
    id,
    email,
    name:
      typeof displayName === "string" && displayName !== ""
        ? displayName
        : typeof name === "string" && name !== ""
          ? name
          : email,
    color: collaboratorColor(id),
  };
}

function createRemoteCaret(user: unknown): HTMLElement {
  const element = document.createElement("span");
  const color = colorFromAwarenessUser(user);
  element.className = "collaboration-caret";
  element.style.borderColor = color;
  const label = document.createElement("span");
  label.className = "collaboration-caret-label";
  label.style.backgroundColor = color;
  label.textContent = awarenessName(user);
  element.append(label);
  return element;
}

function colorFromAwarenessUser(user: unknown): string {
  if (!isRecord(user)) return "#2563eb";
  const id = Reflect.get(user, "id");
  return collaboratorColor(typeof id === "string" ? id : "anonymous");
}

function awarenessName(user: unknown): string {
  if (!isRecord(user)) return "Collaborator";
  const displayName = Reflect.get(user, "displayName");
  const name = Reflect.get(user, "name");
  const email = Reflect.get(user, "email");
  if (typeof displayName === "string" && displayName !== "") return displayName;
  if (typeof name === "string" && name !== "") return name;
  return typeof email === "string" && email !== "" ? email : "Collaborator";
}

function connectionLabel(state: CollaborationConnectionState): string {
  if (state === "connected") return "Connected";
  if (state === "connecting") return "Connecting";
  if (state === "reconnecting") return "Reconnecting";
  if (state === "offline") return "Offline · changes are local until reconnection";
  if (state === "deleted") return "Document deleted";
  if (state === "reload-required") return "Reloading restored version";
  return "Permission revoked";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
