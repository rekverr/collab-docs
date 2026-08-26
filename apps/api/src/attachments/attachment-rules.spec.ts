import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import {
  assertSupportedAttachment,
  assertUploadOwner,
  attachmentCapability,
  hasStorageQuota,
  maximumAttachmentSizeBytes,
  normalizeFileName,
} from "./attachment-rules";

describe("attachment permissions and quota", () => {
  it("requires document write permission for mutations and read permission for downloads", () => {
    assert.equal(attachmentCapability("create"), "document.edit");
    assert.equal(attachmentCapability("finalize"), "document.edit");
    assert.equal(attachmentCapability("delete"), "document.edit");
    assert.equal(attachmentCapability("read"), "document.read");
  });

  it("allows only the upload requester to finalize", () => {
    assert.doesNotThrow(() => assertUploadOwner("user-1", "user-1"));
    assert.throws(() => assertUploadOwner("user-2", "user-1"), ForbiddenException);
  });

  it("enforces declared MIME and maximum size", () => {
    assert.doesNotThrow(() => assertSupportedAttachment("image/png", maximumAttachmentSizeBytes));
    assert.throws(
      () => assertSupportedAttachment("image/svg+xml", 1024),
      UnsupportedMediaTypeException,
    );
    assert.throws(
      () => assertSupportedAttachment("image/png", maximumAttachmentSizeBytes + 1),
      PayloadTooLargeException,
    );
  });

  it("accounts for pending reservations without exceeding the plan limit", () => {
    assert.equal(hasStorageQuota(80n, 100n, 20n), true);
    assert.equal(hasStorageQuota(81n, 100n, 20n), false);
    assert.equal(hasStorageQuota(0n, 10n, 11n), false);
  });

  it("never derives an object path from a supplied filename", () => {
    assert.equal(normalizeFileName("../../private/image.png"), "image.png");
  });
});
