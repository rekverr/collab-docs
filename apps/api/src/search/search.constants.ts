export const searchIndexQueueName = "document-search-index";
export const searchIndexJobName = "index-document";

export interface SearchIndexJobData {
  documentId: string;
  sequence: string;
}
