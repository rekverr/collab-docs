import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "../permissions/policy.service";
import type {
  SearchDocumentResultDto,
  SearchDocumentsQueryDto,
  SearchDocumentsResponseDto,
} from "./dto/search.dto";

interface SearchRow extends SearchDocumentResultDto {}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  async search(
    userId: string,
    workspaceId: string,
    input: SearchDocumentsQueryDto,
  ): Promise<SearchDocumentsResponseDto> {
    await this.policy.requireWorkspaceCapability(userId, workspaceId, "document.read");
    const query = input.query.trim();
    if (query.length === 0) throw new BadRequestException("Search query cannot be blank");
    const offset = (input.page - 1) * input.limit;
    const rows = await this.prisma.$queryRaw<SearchRow[]>(
      Prisma.sql`WITH RECURSIVE
        search_query AS (
          SELECT websearch_to_tsquery('simple', ${query}) AS value
        ),
        active_documents AS (
          SELECT root."id", root."parentId"
          FROM "Document" AS root
          WHERE root."workspaceId" = ${workspaceId}::uuid
            AND root."parentId" IS NULL
            AND root."archivedAt" IS NULL
            AND root."deletedAt" IS NULL
          UNION ALL
          SELECT child."id", child."parentId"
          FROM "Document" AS child
          JOIN active_documents AS parent ON parent."id" = child."parentId"
          WHERE child."workspaceId" = ${workspaceId}::uuid
            AND child."archivedAt" IS NULL
            AND child."deletedAt" IS NULL
        )
        SELECT
          document."id" AS "documentId",
          document."workspaceId",
          document."parentId",
          document."title",
          NULLIF(
            CASE
              WHEN char_length(search_index."content") > 240
                THEN left(search_index."content", 237) || '…'
              ELSE search_index."content"
            END,
            ''
          ) AS "snippet",
          (
            ts_rank_cd(search_index."searchVector", search_query.value, 32) +
            CASE
              WHEN lower(search_index."title") = lower(${query}) THEN 2.0
              WHEN strpos(lower(search_index."title"), lower(${query})) > 0 THEN 0.5
              ELSE 0.0
            END
          )::double precision AS "rank",
          document."updatedAt"
        FROM "document_search_index" AS search_index
        JOIN active_documents ON active_documents."id" = search_index."documentId"
        JOIN "Document" AS document ON document."id" = search_index."documentId"
        JOIN "Workspace" AS workspace ON workspace."id" = document."workspaceId"
        JOIN "WorkspaceMember" AS membership
          ON membership."workspaceId" = document."workspaceId"
          AND membership."userId" = ${userId}::uuid
        CROSS JOIN search_query
        WHERE document."workspaceId" = ${workspaceId}::uuid
          AND workspace."deletedAt" IS NULL
          AND (
            search_index."searchVector" @@ search_query.value OR
            strpos(lower(search_index."title"), lower(${query})) > 0
          )
        ORDER BY "rank" DESC, document."updatedAt" DESC, document."id" ASC
        LIMIT ${input.limit + 1}
        OFFSET ${offset}`,
    );
    const hasMore = rows.length > input.limit;
    return {
      items: rows.slice(0, input.limit),
      page: input.page,
      limit: input.limit,
      hasMore,
    };
  }
}
