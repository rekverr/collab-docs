import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { PolicyService } from "../permissions/policy.service";
import { SearchService } from "./search.service";

test("an outsider is rejected before the search index is queried", async () => {
  let queries = 0;
  const prisma = {
    $queryRaw: async () => {
      queries += 1;
      return [];
    },
  };
  const policy = {
    requireWorkspaceCapability: async () => {
      throw new NotFoundException("Workspace not found");
    },
  };
  const service = new SearchService(
    prisma as unknown as PrismaService,
    policy as unknown as PolicyService,
  );

  await assert.rejects(
    service.search("outsider", "11111111-1111-4111-8111-111111111111", {
      query: "roadmap",
      page: 1,
      limit: 20,
    }),
    NotFoundException,
  );
  assert.equal(queries, 0);
});

test("authorized search returns a bounded page and hasMore marker", async () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    documentId: `document-${index}`,
    workspaceId: "11111111-1111-4111-8111-111111111111",
    parentId: null,
    title: `Roadmap ${index}`,
    snippet: "Quarterly roadmap",
    rank: 1 - index / 10,
    updatedAt: new Date("2026-08-27T10:00:00.000Z"),
  }));
  let sqlText = "";
  const prisma = {
    $queryRaw: async (query: unknown) => {
      if (
        typeof query === "object" &&
        query !== null &&
        Array.isArray(Reflect.get(query, "strings"))
      ) {
        sqlText = (Reflect.get(query, "strings") as string[]).join("?");
      }
      return rows;
    },
  };
  let capability = "";
  const policy = {
    requireWorkspaceCapability: async (_userId: string, _workspaceId: string, value: string) => {
      capability = value;
      return { role: "VIEWER", workspace: {} };
    },
  };
  const service = new SearchService(
    prisma as unknown as PrismaService,
    policy as unknown as PolicyService,
  );

  const result = await service.search("viewer", "11111111-1111-4111-8111-111111111111", {
    query: "roadmap",
    page: 1,
    limit: 2,
  });

  assert.equal(capability, "document.read");
  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, true);
  assert.match(sqlText, /JOIN "WorkspaceMember"/);
  assert.match(sqlText, /active_documents/);
});
