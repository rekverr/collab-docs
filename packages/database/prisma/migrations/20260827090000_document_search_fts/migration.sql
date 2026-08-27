CREATE TABLE "document_search_index" (
    "documentId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "projectionSequence" BIGINT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "searchVector" TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("content", '')), 'B')
    ) STORED,

    CONSTRAINT "document_search_index_pkey" PRIMARY KEY ("documentId")
);

CREATE INDEX "document_search_index_workspaceId_indexedAt_idx"
    ON "document_search_index"("workspaceId", "indexedAt");

CREATE INDEX "document_search_index_searchVector_idx"
    ON "document_search_index" USING GIN ("searchVector");

ALTER TABLE "document_search_index"
    ADD CONSTRAINT "document_search_index_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_search_index"
    ADD CONSTRAINT "document_search_index_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
