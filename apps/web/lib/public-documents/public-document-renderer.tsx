import React, { type ReactNode } from "react";
import type { DocumentProjectionBlock } from "../api/types";

export function PublicDocumentBody({
  blocks,
  publicSlug,
  attachmentBasePath,
}: Readonly<{
  blocks: readonly DocumentProjectionBlock[];
  publicSlug?: string;
  attachmentBasePath?: string;
}>) {
  const attachmentPath =
    attachmentBasePath ??
    (publicSlug === undefined
      ? undefined
      : `/api/backend/public-documents/${encodeURIComponent(publicSlug)}/attachments`);
  return (
    <div className="public-document-blocks">
      {blocks.map((block) => renderBlock(block, attachmentPath))}
    </div>
  );
}

function renderBlock(block: DocumentProjectionBlock, attachmentBasePath?: string): ReactNode {
  if (block.type === "paragraph") return <p key={block.id}>{block.text}</p>;
  if (block.type === "heading") {
    if (block.level === 1) return <h2 key={block.id}>{block.text}</h2>;
    if (block.level === 2) return <h3 key={block.id}>{block.text}</h3>;
    return <h4 key={block.id}>{block.text}</h4>;
  }
  if (block.type === "list") {
    const items = block.items.map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>);
    return block.style === "numbered" ? (
      <ol key={block.id}>{items}</ol>
    ) : (
      <ul key={block.id}>{items}</ul>
    );
  }
  if (block.type === "task") {
    return (
      <div className="public-task" key={block.id}>
        <input type="checkbox" checked={block.checked} readOnly disabled aria-label="Task state" />
        <span>{block.text}</span>
      </div>
    );
  }
  if (block.type === "code") {
    return (
      <pre key={block.id}>
        <code data-language={block.language}>{block.text}</code>
      </pre>
    );
  }
  if (block.source.kind === "url") {
    return (
      <figure key={block.id}>
        <img src={block.source.url} alt={block.alt} loading="lazy" referrerPolicy="no-referrer" />
        {block.alt !== "" && <figcaption>{block.alt}</figcaption>}
      </figure>
    );
  }
  if (attachmentBasePath === undefined) return null;
  const source = `${attachmentBasePath}/${encodeURIComponent(block.source.attachmentId)}`;
  return (
    <figure key={block.id}>
      <img src={source} alt={block.alt} loading="lazy" />
      {block.alt !== "" && <figcaption>{block.alt}</figcaption>}
    </figure>
  );
}
