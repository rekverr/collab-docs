ALTER TABLE "Comment" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Comment_documentId_blockId_resolvedAt_idx"
ON "Comment"("documentId", "blockId", "resolvedAt");

CREATE UNIQUE INDEX "Notification_commentId_recipientId_type_key"
ON "Notification"("commentId", "recipientId", "type");
