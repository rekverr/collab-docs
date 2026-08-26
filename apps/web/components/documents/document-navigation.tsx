"use client";

import { useCallback, useEffect, useState, type DragEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { documentApi } from "../../lib/api/client";
import { apiErrorMessage } from "../../lib/api/errors";
import type { DocumentTreeNode, WorkspaceRole } from "../../lib/api/types";
import { containsDocument, moveDocumentOptimistically, removeDocument, renameDocument } from "../../lib/documents/tree";
import { useSession } from "../auth/session-provider";

interface DocumentNavigationProps {
  workspaceId: string;
  role: WorkspaceRole;
  selectedDocumentId?: string;
}

export function DocumentNavigation({ workspaceId, role, selectedDocumentId }: Readonly<DocumentNavigationProps>) {
  const session = useSession();
  const router = useRouter();
  const [tree, setTree] = useState<DocumentTreeNode[] | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const canEdit = role !== "VIEWER";
  const canDelete = role === "OWNER" || role === "ADMIN";

  const loadTree = useCallback(async (): Promise<DocumentTreeNode[]> => {
    const result = await session.withAccessToken((token) => documentApi.tree(token, workspaceId));
    setTree(result);
    return result;
  }, [session, workspaceId]);

  useEffect(() => {
    let active = true;
    setError(null);
    void session.withAccessToken((token) => documentApi.tree(token, workspaceId))
      .then((result) => { if (active) setTree(result); })
      .catch((reason: unknown) => { if (active) setError(apiErrorMessage(reason)); });
    return () => { active = false; };
  }, [reloadKey, session, workspaceId]);

  async function create(parentId?: string): Promise<void> {
    const title = window.prompt(parentId === undefined ? "Root document title" : "Child document title", "Untitled");
    if (title === null || title.trim() === "") return;
    setBusy(true); setError(null);
    try {
      const created = await session.withAccessToken((token) => documentApi.create(token, workspaceId, { title: title.trim(), ...(parentId === undefined ? {} : { parentId }) }));
      if (parentId !== undefined) setExpanded((current) => new Set(current).add(parentId));
      await loadTree();
      router.push(`/app/workspaces/${workspaceId}/documents/${created.id}`);
    } catch (reason: unknown) { setError(apiErrorMessage(reason)); } finally { setBusy(false); }
  }

  async function rename(node: DocumentTreeNode): Promise<void> {
    const title = window.prompt("Rename document", node.title);
    if (title === null || title.trim() === "" || tree === null) return;
    const previous = tree;
    setTree(renameDocument(tree, node.id, title.trim())); setBusy(true); setError(null);
    try {
      await session.withAccessToken((token) => documentApi.rename(token, node.id, title.trim()));
      await loadTree();
    } catch (reason: unknown) { setTree(previous); setError(apiErrorMessage(reason)); } finally { setBusy(false); }
  }

  async function remove(node: DocumentTreeNode, action: "archive" | "delete"): Promise<void> {
    if (!window.confirm(`${action === "archive" ? "Archive" : "Delete"} “${node.title}”?` ) || tree === null) return;
    const previous = tree;
    setTree(removeDocument(tree, node.id)); setBusy(true); setError(null);
    try {
      await session.withAccessToken((token) => action === "archive" ? documentApi.archive(token, node.id) : documentApi.delete(token, node.id));
      await loadTree();
      if (selectedDocumentId === node.id || (selectedDocumentId !== undefined && containsDocument(node.children, selectedDocumentId))) {
        router.push(`/app/workspaces/${workspaceId}`);
      }
    } catch (reason: unknown) { setTree(previous); setError(apiErrorMessage(reason)); } finally { setBusy(false); }
  }

  async function drop(documentId: string, parentId: string | null, beforeDocumentId?: string): Promise<void> {
    if (!canEdit || busy || tree === null) return;
    const optimistic = moveDocumentOptimistically(tree, documentId, parentId, beforeDocumentId);
    if (optimistic === null) { setError("That move would create an invalid document hierarchy."); return; }
    const previous = tree;
    setTree(optimistic); setBusy(true); setError(null);
    try {
      await session.withAccessToken((token) => documentApi.move(token, documentId, { parentId, ...(beforeDocumentId === undefined ? {} : { beforeDocumentId }) }));
      await loadTree();
      if (parentId !== null) setExpanded((current) => new Set(current).add(parentId));
    } catch (reason: unknown) { setTree(previous); setError(apiErrorMessage(reason)); } finally { setBusy(false); setDraggedId(null); }
  }

  if (tree === null && error === null) return <aside className="document-navigation"><div className="loading-row"><span className="spinner" /> Loading documents…</div></aside>;
  return (
    <aside className="document-navigation" aria-label="Document navigation">
      <div className="document-navigation-header"><strong>Documents</strong>{canEdit && <button disabled={busy} className="icon-button" type="button" onClick={() => void create()} aria-label="Create root document">+</button>}</div>
      {role === "VIEWER" && <p className="readonly-note">Read-only access</p>}
      {error !== null && <div className="tree-error"><p className="error-message small" role="alert">{error}</p><button className="text-button" type="button" onClick={() => setReloadKey((value) => value + 1)}>Reload</button></div>}
      {tree?.length === 0 && <div className="document-empty"><p>No documents yet.</p>{canEdit && <button className="text-button" type="button" onClick={() => void create()}>Create the first document</button>}</div>}
      <div role="tree" aria-busy={busy}>
        {tree?.map((node) => <TreeNode key={node.id} node={node} depth={0} expanded={expanded} selectedDocumentId={selectedDocumentId} canEdit={canEdit} canDelete={canDelete} busy={busy} draggedId={draggedId} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onOpen={(id) => router.push(`/app/workspaces/${workspaceId}/documents/${id}`)} onCreate={create} onRename={rename} onRemove={remove} onDragStart={setDraggedId} onDrop={drop} />)}
      </div>
    </aside>
  );
}

interface TreeNodeProps {
  node: DocumentTreeNode; depth: number; expanded: ReadonlySet<string>; selectedDocumentId?: string;
  canEdit: boolean; canDelete: boolean; busy: boolean; draggedId: string | null;
  onToggle(id: string): void; onOpen(id: string): void; onCreate(parentId: string): Promise<void>;
  onRename(node: DocumentTreeNode): Promise<void>; onRemove(node: DocumentTreeNode, action: "archive" | "delete"): Promise<void>;
  onDragStart(id: string | null): void; onDrop(documentId: string, parentId: string | null, beforeDocumentId?: string): Promise<void>;
}

function TreeNode(props: Readonly<TreeNodeProps>) {
  const { node, depth, expanded, selectedDocumentId, canEdit, canDelete, busy, draggedId } = props;
  const isExpanded = expanded.has(node.id);
  function stop(event: MouseEvent<HTMLButtonElement>): void { event.stopPropagation(); }
  function allowDrop(event: DragEvent<HTMLElement>): void { if (canEdit && draggedId !== null && !busy) event.preventDefault(); }
  return (
    <div role="treeitem" aria-expanded={node.children.length > 0 ? isExpanded : undefined}>
      {canEdit && <div className="drop-before" onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (draggedId !== null) void props.onDrop(draggedId, node.parentId, node.id); }} aria-hidden="true" />}
      <div className={`document-row${selectedDocumentId === node.id ? " selected" : ""}`} style={{ paddingLeft: `${depth * 1.05 + .35}rem` }} draggable={canEdit && !busy} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; props.onDragStart(node.id); }} onDragEnd={() => props.onDragStart(null)} onDragOver={allowDrop} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (draggedId !== null) void props.onDrop(draggedId, node.id); }}>
        <button className="tree-toggle" type="button" aria-label={isExpanded ? "Collapse document" : "Expand document"} disabled={node.children.length === 0} onClick={(event) => { stop(event); props.onToggle(node.id); }}>{node.children.length === 0 ? "·" : isExpanded ? "▾" : "▸"}</button>
        <button className="document-open" type="button" onClick={() => props.onOpen(node.id)}>{node.title}</button>
        {canEdit && <div className="document-actions">
          <button type="button" title="Create child" disabled={busy} onClick={(event) => { stop(event); void props.onCreate(node.id); }}>+</button>
          <button type="button" title="Rename" disabled={busy} onClick={(event) => { stop(event); void props.onRename(node); }}>✎</button>
          {canDelete && <><button type="button" title="Archive" disabled={busy} onClick={(event) => { stop(event); void props.onRemove(node, "archive"); }}>⌁</button><button type="button" title="Delete" disabled={busy} onClick={(event) => { stop(event); void props.onRemove(node, "delete"); }}>×</button></>}
        </div>}
      </div>
      {isExpanded && node.children.map((child) => <TreeNode key={child.id} {...props} node={child} depth={depth + 1} />)}
    </div>
  );
}
