import { ForbiddenException, UnprocessableEntityException } from "@nestjs/common";

export function assertCommentOwner(actorUserId: string, authorId: string): void {
  if (actorUserId !== authorId) {
    throw new ForbiddenException("Only the comment author can modify this comment");
  }
}

export function assertCanResolveComment(
  actorUserId: string,
  authorId: string,
  canEditDocument: boolean,
  parentId: string | null,
): void {
  if (parentId !== null) {
    throw new UnprocessableEntityException("Only root comments can be resolved");
  }
  if (actorUserId !== authorId && !canEditDocument) {
    throw new ForbiddenException("Only the thread author or a document editor can resolve it");
  }
}
