import { ConflictException, UnprocessableEntityException } from "@nestjs/common";

export const sortKeyGap = 1_000_000n;
const sortKeyWidth = 24;

export interface HierarchyDocument {
  id: string;
  workspaceId: string;
  parentId: string | null;
}

export function formatSortKey(value: bigint): string {
  if (value < 0n) throw new RangeError("sort key cannot be negative");
  return value.toString().padStart(sortKeyWidth, "0");
}

export function appendedSortKey(lastSortKey?: string): string {
  return formatSortKey(lastSortKey === undefined ? sortKeyGap : BigInt(lastSortKey) + sortKeyGap);
}

export function assertValidParent(document: HierarchyDocument, parent: HierarchyDocument): void {
  if (document.id === parent.id)
    throw new UnprocessableEntityException("A document cannot be its own parent");
  if (document.workspaceId !== parent.workspaceId)
    throw new UnprocessableEntityException("Parent must belong to the same workspace");
}

export function assertNoHierarchyCycle(
  documentId: string,
  parentId: string | null,
  parents: ReadonlyMap<string, string | null>,
): void {
  const visited = new Set<string>();
  let cursor = parentId;
  while (cursor !== null) {
    if (cursor === documentId)
      throw new UnprocessableEntityException("Moving the document would create a hierarchy cycle");
    if (visited.has(cursor))
      throw new ConflictException("The existing document hierarchy contains a cycle");
    visited.add(cursor);
    cursor = parents.get(cursor) ?? null;
  }
}

export function assertExactSiblingOrder(
  existingIds: readonly string[],
  orderedIds: readonly string[],
): void {
  if (new Set(orderedIds).size !== orderedIds.length)
    throw new UnprocessableEntityException("Document order contains duplicates");
  if (
    existingIds.length !== orderedIds.length ||
    existingIds.some((id) => !orderedIds.includes(id))
  ) {
    throw new UnprocessableEntityException(
      "Document order must contain every active sibling exactly once",
    );
  }
}
