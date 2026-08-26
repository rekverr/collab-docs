import type { DocumentTreeNode } from "../api/types";

export function containsDocument(nodes: readonly DocumentTreeNode[], documentId: string): boolean {
  return nodes.some((node) => node.id === documentId || containsDocument(node.children, documentId));
}

export function renameDocument(nodes: readonly DocumentTreeNode[], documentId: string, title: string): DocumentTreeNode[] {
  return nodes.map((node) => node.id === documentId
    ? { ...node, title }
    : { ...node, children: renameDocument(node.children, documentId, title) });
}

export function removeDocument(nodes: readonly DocumentTreeNode[], documentId: string): DocumentTreeNode[] {
  return nodes.filter((node) => node.id !== documentId).map((node) => ({ ...node, children: removeDocument(node.children, documentId) }));
}

interface DetachedNode { node: DocumentTreeNode; tree: DocumentTreeNode[] }

function detachDocument(nodes: readonly DocumentTreeNode[], documentId: string): DetachedNode | null {
  const index = nodes.findIndex(({ id }) => id === documentId);
  if (index >= 0) return { node: nodes[index]!, tree: [...nodes.slice(0, index), ...nodes.slice(index + 1)] };
  for (const node of nodes) {
    const detached = detachDocument(node.children, documentId);
    if (detached !== null) {
      return { node: detached.node, tree: nodes.map((candidate) => candidate.id === node.id ? { ...candidate, children: detached.tree } : candidate) };
    }
  }
  return null;
}

function insertDocument(nodes: readonly DocumentTreeNode[], node: DocumentTreeNode, parentId: string | null, beforeId?: string): DocumentTreeNode[] | null {
  if (parentId === null) {
    const index = beforeId === undefined ? nodes.length : nodes.findIndex(({ id }) => id === beforeId);
    if (index < 0) return null;
    return [...nodes.slice(0, index), { ...node, parentId: null }, ...nodes.slice(index)];
  }
  let inserted = false;
  const tree = nodes.map((candidate) => {
    if (candidate.id === parentId) {
      const index = beforeId === undefined ? candidate.children.length : candidate.children.findIndex(({ id }) => id === beforeId);
      if (index < 0) return candidate;
      inserted = true;
      const moved = { ...node, parentId };
      return { ...candidate, children: [...candidate.children.slice(0, index), moved, ...candidate.children.slice(index)] };
    }
    const children = insertDocument(candidate.children, node, parentId, beforeId);
    if (children === null) return candidate;
    inserted = true;
    return { ...candidate, children };
  });
  return inserted ? tree : null;
}

export function moveDocumentOptimistically(
  nodes: readonly DocumentTreeNode[], documentId: string, parentId: string | null, beforeId?: string,
): DocumentTreeNode[] | null {
  if (documentId === parentId || (parentId !== null && isDescendantOf(nodes, parentId, documentId))) return null;
  const detached = detachDocument(nodes, documentId);
  if (detached === null) return null;
  return insertDocument(detached.tree, detached.node, parentId, beforeId);
}

export function isDescendantOf(nodes: readonly DocumentTreeNode[], candidateId: string, ancestorId: string): boolean {
  const ancestor = findDocument(nodes, ancestorId);
  return ancestor !== null && containsDocument(ancestor.children, candidateId);
}

export function findDocument(nodes: readonly DocumentTreeNode[], documentId: string): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.id === documentId) return node;
    const child = findDocument(node.children, documentId);
    if (child !== null) return child;
  }
  return null;
}
