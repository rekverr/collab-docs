import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PublicSlugPipe } from "./public-slug.pipe";

describe("PublicSlugPipe", () => {
  it("accepts stable public slugs and rejects malformed input", () => {
    const pipe = new PublicSlugPipe();
    assert.equal(pipe.transform("project-notes-123"), "project-notes-123");
    assert.throws(() => pipe.transform("../private"), BadRequestException);
    assert.throws(() => pipe.transform("a".repeat(161)), BadRequestException);
  });
});
