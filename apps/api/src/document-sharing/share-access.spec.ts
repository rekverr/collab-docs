import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DocumentAccessMode } from "@prisma/client";
import {
  hashShareToken,
  isActiveShareLink,
  shareAllowsRead,
  shareAllowsWrite,
} from "./share-access";

const now = new Date("2026-08-26T12:00:00.000Z");

describe("document share access", () => {
  it("stores only deterministic token hashes", () => {
    const token = "secret-bearer-token";
    assert.equal(hashShareToken(token), hashShareToken(token));
    assert.notEqual(hashShareToken(token), token);
  });

  it("rejects expired and revoked links", () => {
    assert.equal(
      isActiveShareLink(
        {
          accessMode: DocumentAccessMode.VIEW,
          revokedAt: null,
          expiresAt: new Date(now.getTime() - 1),
        },
        now,
      ),
      false,
    );
    assert.equal(
      isActiveShareLink(
        { accessMode: DocumentAccessMode.EDIT, revokedAt: now, expiresAt: null },
        now,
      ),
      false,
    );
  });

  it("never grants write through a view-only link", () => {
    const view = { accessMode: DocumentAccessMode.VIEW, revokedAt: null, expiresAt: null };
    assert.equal(shareAllowsRead(view, now), true);
    assert.equal(shareAllowsWrite(view, now), false);
  });

  it("grants document write only through an active editable link", () => {
    const edit = {
      accessMode: DocumentAccessMode.EDIT,
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 1),
    };
    assert.equal(shareAllowsRead(edit, now), true);
    assert.equal(shareAllowsWrite(edit, now), true);
  });
});
