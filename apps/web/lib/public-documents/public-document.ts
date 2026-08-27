import type { DocumentProjection, DocumentProjectionBlock } from "../api/types";

export interface PublicDocument {
  documentId: string;
  title: string;
  publicSlug: string;
  contentProjection: DocumentProjection;
  projectionUpdatedAt: string | null;
}

export function parsePublicDocument(value: unknown): PublicDocument {
  const data = strictRecord(
    value,
    ["documentId", "title", "publicSlug", "contentProjection", "projectionUpdatedAt"],
    "public document",
  );
  const publicSlug = limitedString(field(data, "publicSlug"), 160, "public slug");
  if (!/^[a-z0-9-]{1,160}$/.test(publicSlug)) throw new TypeError("Invalid public slug");
  const projectionUpdatedAt = field(data, "projectionUpdatedAt");
  return {
    documentId: uuid(field(data, "documentId"), "document ID"),
    title: limitedString(field(data, "title"), 500, "document title"),
    publicSlug,
    contentProjection: parseProjection(field(data, "contentProjection")),
    projectionUpdatedAt:
      projectionUpdatedAt === null
        ? null
        : limitedString(projectionUpdatedAt, 64, "projection timestamp"),
  };
}

export function safePublicImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "") return null;
    if (url.protocol === "https:" && !isLocalOrPrivateHost(url.hostname)) return url.toString();
  } catch {
    return null;
  }
  return null;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1" || normalized.endsWith(".localhost")) {
    return true;
  }
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) {
    return true;
  }
  if (
    normalized === "0.0.0.0" ||
    /^169\.254\./.test(normalized) ||
    /^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/i.test(normalized)
  ) {
    return true;
  }
  const private172 = /^172\.(\d{1,3})\./.exec(normalized);
  return private172 !== null && Number(private172[1]) >= 16 && Number(private172[1]) <= 31;
}

export function publicDescription(document: PublicDocument): string {
  const text = document.contentProjection.plainText.replace(/\s+/g, " ").trim();
  return text === "" ? "Published with Collab Docs" : text.slice(0, 160);
}

function parseProjection(value: unknown): DocumentProjection {
  const data = strictRecord(value, ["version", "blocks", "plainText"], "document projection");
  const blocks = field(data, "blocks");
  if (field(data, "version") !== 1 || !Array.isArray(blocks) || blocks.length > 10_000) {
    throw new TypeError("Invalid document projection");
  }
  return {
    version: 1,
    blocks: blocks.map(parseBlock),
    plainText: limitedString(field(data, "plainText"), 1_000_000, "projection text"),
  };
}

function parseBlock(value: unknown): DocumentProjectionBlock {
  const base = record(value, "document block");
  const type = field(base, "type");
  if (type === "paragraph") {
    const data = strictRecord(base, ["id", "type", "text"], "paragraph block");
    return {
      id: identifier(field(data, "id"), "paragraph ID"),
      type,
      text: limitedString(field(data, "text"), 100_000, "paragraph text"),
    };
  }
  if (type === "heading") {
    const data = strictRecord(base, ["id", "type", "level", "text"], "heading block");
    const level = field(data, "level");
    if (level !== 1 && level !== 2 && level !== 3) throw new TypeError("Invalid heading level");
    return {
      id: identifier(field(data, "id"), "heading ID"),
      type,
      level,
      text: limitedString(field(data, "text"), 2_000, "heading text"),
    };
  }
  if (type === "list") {
    const data = strictRecord(base, ["id", "type", "style", "items"], "list block");
    const style = field(data, "style");
    const items = field(data, "items");
    if (
      (style !== "bullet" && style !== "numbered") ||
      !Array.isArray(items) ||
      items.length > 1_000
    ) {
      throw new TypeError("Invalid list block");
    }
    return {
      id: identifier(field(data, "id"), "list ID"),
      type,
      style,
      items: items.map((item) => limitedString(item, 10_000, "list item")),
    };
  }
  if (type === "task") {
    const data = strictRecord(base, ["id", "type", "text", "checked"], "task block");
    const checked = field(data, "checked");
    if (typeof checked !== "boolean") throw new TypeError("Invalid task state");
    return {
      id: identifier(field(data, "id"), "task ID"),
      type,
      checked,
      text: limitedString(field(data, "text"), 10_000, "task text"),
    };
  }
  if (type === "image") {
    const data = strictRecord(base, ["id", "type", "source", "alt"], "image block");
    const sourceData = record(field(data, "source"), "image source");
    const kind = field(sourceData, "kind");
    const source: Extract<DocumentProjectionBlock, { type: "image" }>["source"] =
      kind === "url"
        ? parseUrlSource(sourceData)
        : kind === "attachment"
          ? parseAttachmentSource(sourceData)
          : invalidImageSource();
    return {
      id: identifier(field(data, "id"), "image ID"),
      type,
      source,
      alt: limitedString(field(data, "alt"), 500, "image alt text"),
    };
  }
  if (type === "code") {
    const data = strictRecord(base, ["id", "type", "language", "text"], "code block");
    const language = limitedString(field(data, "language"), 64, "code language");
    if (!/^[a-zA-Z0-9_+.-]{1,64}$/.test(language)) throw new TypeError("Invalid code language");
    return {
      id: identifier(field(data, "id"), "code ID"),
      type,
      language,
      text: limitedString(field(data, "text"), 200_000, "code text"),
    };
  }
  throw new TypeError("Unsupported document block");
}

function parseUrlSource(value: object): { kind: "url"; url: string } {
  const data = strictRecord(value, ["kind", "url"], "image URL source");
  const url = safePublicImageUrl(field(data, "url"));
  if (url === null) throw new TypeError("Unsafe image URL");
  return { kind: "url", url };
}

function parseAttachmentSource(value: object): { kind: "attachment"; attachmentId: string } {
  const data = strictRecord(value, ["kind", "attachmentId"], "image attachment source");
  return {
    kind: "attachment",
    attachmentId: uuid(field(data, "attachmentId"), "attachment ID"),
  };
}

function invalidImageSource(): never {
  throw new TypeError("Invalid image source");
}

function strictRecord(value: unknown, keys: readonly string[], label: string): object {
  const data = record(value, label);
  const expected = new Set(keys);
  if (Object.keys(data).some((key) => !expected.has(key)) || keys.some((key) => !(key in data))) {
    throw new TypeError(`Invalid ${label}`);
  }
  return data;
}

function record(value: unknown, label: string): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid ${label}`);
  }
  return value;
}

function field(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

function limitedString(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== "string" || value.length > maxLength || value.includes("\u0000")) {
    throw new TypeError(`Invalid ${label}`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  const result = limitedString(value, 160, label);
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(result)) throw new TypeError(`Invalid ${label}`);
  return result;
}

function uuid(value: unknown, label: string): string {
  const result = limitedString(value, 36, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new TypeError(`Invalid ${label}`);
  }
  return result;
}
