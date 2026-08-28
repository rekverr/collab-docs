import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { parsePublicDocument, parseSharedPublicDocument } from "./public-document";
import { PublicDocumentBody } from "./public-document-renderer";

function publicDocument(blocks: unknown[], plainText = "Safe text"): unknown {
  return {
    documentId: "11111111-1111-4111-8111-111111111111",
    title: "Published document",
    publicSlug: "published-document-1",
    contentProjection: { version: 1, blocks, plainText },
    projectionUpdatedAt: "2026-08-26T12:00:00.000Z",
  };
}

describe("safe public document rendering", () => {
  it("renders script and event-handler-like text only as escaped text", () => {
    const document = parsePublicDocument(
      publicDocument([
        {
          id: "paragraph-1",
          type: "paragraph",
          text: '<script>alert("xss")</script><img src=x onerror=alert(1)>',
        },
      ]),
    );
    const html = renderToStaticMarkup(
      <PublicDocumentBody
        blocks={document.contentProjection.blocks}
        publicSlug={document.publicSlug}
      />,
    );
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes("<img src=x"), false);
    assert.equal(html.includes("&lt;script&gt;"), true);
    assert.equal(html.includes("onerror=alert(1)"), true);
  });

  it("rejects event handler fields instead of spreading them onto React elements", () => {
    assert.throws(
      () =>
        parsePublicDocument(
          publicDocument([
            { id: "paragraph-1", type: "paragraph", text: "Hello", onClick: "alert(1)" },
          ]),
        ),
      TypeError,
    );
  });

  it("rejects javascript and data image URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1) />",
      "http://localhost:3000/admin",
      "https://127.0.0.1/internal",
      "https://192.168.1.20/private",
    ]) {
      assert.throws(
        () =>
          parsePublicDocument(
            publicDocument([
              {
                id: "image-1",
                type: "image",
                source: { kind: "url", url },
                alt: "Unsafe image",
              },
            ]),
          ),
        TypeError,
      );
    }
  });

  it("rejects malformed or unsupported blocks", () => {
    assert.throws(
      () => parsePublicDocument(publicDocument([{ id: "bad-1", type: "html", html: "<b>x</b>" }])),
      TypeError,
    );
    assert.throws(
      () =>
        parsePublicDocument(
          publicDocument([{ id: "heading-1", type: "heading", level: 9, text: "Bad" }]),
        ),
      TypeError,
    );
  });

  it("rejects unsafe image credentials and link-like data on non-link blocks", () => {
    assert.throws(
      () =>
        parsePublicDocument(
          publicDocument([
            {
              id: "image-1",
              type: "image",
              source: { kind: "url", url: "https://user:password@example.com/image.png" },
              alt: "Credential URL",
            },
          ]),
        ),
      TypeError,
    );
    assert.throws(
      () =>
        parsePublicDocument(
          publicDocument([
            { id: "paragraph-1", type: "paragraph", text: "Click", href: "javascript:alert(1)" },
          ]),
        ),
      TypeError,
    );
  });

  it("safely parses shared projections and scopes attachment URLs to the share token", () => {
    const shared = parseSharedPublicDocument({
      documentId: "11111111-1111-4111-8111-111111111111",
      title: "Shared document",
      accessMode: "VIEW",
      expiresAt: null,
      contentProjection: {
        version: 1,
        blocks: [
          {
            id: "image-1",
            type: "image",
            source: {
              kind: "attachment",
              attachmentId: "22222222-2222-4222-8222-222222222222",
            },
            alt: "Diagram",
          },
        ],
        plainText: "",
      },
    });
    const html = renderToStaticMarkup(
      <PublicDocumentBody
        blocks={shared.contentProjection.blocks}
        attachmentBasePath="/api/backend/shares/safe-token/attachments"
      />,
    );
    assert.match(
      html,
      /\/api\/backend\/shares\/safe-token\/attachments\/22222222-2222-4222-8222-222222222222/,
    );
    assert.throws(
      () =>
        parseSharedPublicDocument({
          ...shared,
          contentProjection: {
            version: 1,
            blocks: [
              {
                id: "image-1",
                type: "image",
                source: { kind: "url", url: "javascript:alert(1)" },
                alt: "Unsafe",
              },
            ],
            plainText: "",
          },
        }),
      TypeError,
    );
  });
});
