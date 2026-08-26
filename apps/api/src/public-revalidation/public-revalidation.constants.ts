export const publicRevalidationQueueName = "public-document-revalidation";
export const publicRevalidationJobName = "revalidate-document";
export const publicRevalidationHeader = "x-revalidation-secret";

export type PublicRevalidationReason =
  "projection-changed" | "published" | "unpublished" | "archived" | "deleted" | "restored";

export interface PublicRevalidationJobData {
  documentId: string;
  sequence: string;
  reason?: PublicRevalidationReason;
}
