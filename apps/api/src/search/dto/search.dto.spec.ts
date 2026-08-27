import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate } from "class-validator";
import { SearchDocumentsQueryDto } from "./search.dto";

describe("SearchDocumentsQueryDto", () => {
  it("bounds pagination before it reaches PostgreSQL", async () => {
    const valid = Object.assign(new SearchDocumentsQueryDto(), {
      query: "security",
      page: 10_000,
      limit: 50,
    });
    assert.equal((await validate(valid)).length, 0);

    const oversized = Object.assign(new SearchDocumentsQueryDto(), {
      query: "security",
      page: 10_001,
      limit: 50,
    });
    assert.equal(
      (await validate(oversized)).some(({ property }) => property === "page"),
      true,
    );
  });
});
