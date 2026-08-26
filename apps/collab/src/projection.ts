import * as Y from "yjs";

export type NormalizedBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "list"; style: "bullet" | "numbered"; items: string[] }
  | { id: string; type: "task"; text: string; checked: boolean }
  | { id: string; type: "image"; attachmentId: string; alt: string }
  | { id: string; type: "code"; language: string; text: string };

export interface DocumentProjection { version: 1; blocks: NormalizedBlock[]; plainText: string }

export function deriveDocumentProjection(document: Y.Doc): DocumentProjection {
  const blocks = document.getArray<unknown>("blocks").toArray().flatMap((value, index) => {
    const normalized = normalizeBlock(toUnknownJson(value), index);
    return normalized === null ? [] : [normalized];
  });
  if (blocks.length === 0) {
    const text = cleanText(document.getText("content").toString(), 100_000);
    if (text !== "") blocks.push({ id: "legacy-content", type: "paragraph", text });
  }
  return { version: 1, blocks, plainText: blocks.map(blockText).filter(Boolean).join("\n") };
}

function normalizeBlock(value: unknown, index: number): NormalizedBlock | null {
  if (!isRecord(value)) return null;
  const type = field(value, "type");
  const id = cleanIdentifier(field(value, "id"), `block-${index + 1}`);
  if (type === "paragraph") return { id, type, text: cleanText(field(value, "text"), 100_000) };
  if (type === "heading") {
    const rawLevel = field(value, "level");
    const level = rawLevel === 2 || rawLevel === 3 ? rawLevel : 1;
    return { id, type, level, text: cleanText(field(value, "text"), 2_000) };
  }
  if (type === "list") {
    const rawItems = field(value, "items");
    const items = Array.isArray(rawItems) ? rawItems.slice(0, 1_000).map((item) => cleanText(item, 10_000)) : [];
    return { id, type, style: field(value, "style") === "numbered" ? "numbered" : "bullet", items };
  }
  if (type === "task") return { id, type, text: cleanText(field(value, "text"), 10_000), checked: field(value, "checked") === true };
  if (type === "image") {
    const attachmentId = cleanIdentifier(field(value, "attachmentId"), "");
    return attachmentId === "" ? null : { id, type, attachmentId, alt: cleanText(field(value, "alt"), 500) };
  }
  if (type === "code") return { id, type, language: cleanIdentifier(field(value, "language"), "text"), text: cleanText(field(value, "text"), 200_000) };
  return null;
}

function blockText(block: NormalizedBlock): string {
  if (block.type === "list") return block.items.join("\n");
  if (block.type === "image") return block.alt;
  return block.text;
}

function toUnknownJson(value: unknown): unknown {
  if (value instanceof Y.AbstractType) { const json: unknown = value.toJSON(); return json; }
  return value;
}

function isRecord(value: unknown): value is object { return typeof value === "object" && value !== null && !Array.isArray(value); }
function field(value: object, key: string): unknown { const result: unknown = Reflect.get(value, key); return result; }
function cleanText(value: unknown, maxLength: number): string { return typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, maxLength) : ""; }
function cleanIdentifier(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-zA-Z0-9._:-]{1,160}$/.test(value) ? value : fallback;
}
