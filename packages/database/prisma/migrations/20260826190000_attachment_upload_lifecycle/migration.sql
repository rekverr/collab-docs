ALTER TABLE "Attachment"
ADD COLUMN "uploadExpiresAt" TIMESTAMP(3),
ADD COLUMN "finalizedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Attachment_status_uploadExpiresAt_idx"
ON "Attachment"("status", "uploadExpiresAt");
