import * as Y from "yjs";

export type NormalizedBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "list"; style: "bullet" | "numbered"; items: string[] }
  | { id: string; type: "task"; text: string; checked: boolean }
  | {
      id: string;
      type: "image";
      source: { kind: "attachment"; attachmentId: string } | { kind: "url"; url: string };
      alt: string;
    }
  | { id: string; type: "code"; language: string; text: string };

export interface DocumentProjection {
  version: 1;
  blocks: NormalizedBlock[];
  plainText: string;
}

export function deriveDocumentProjection(document: Y.Doc): DocumentProjection {
  const prosemirrorFragment = document.getXmlFragment("prosemirror");
  const blocks =
    prosemirrorFragment.length > 0
      ? normalizeProseMirrorFragment(prosemirrorFragment)
      : document
          .getArray<unknown>("blocks")
          .toArray()
          .flatMap((value, index) => {
            const normalized = normalizeLegacyBlock(toUnknownJson(value), index);
            return normalized === null ? [] : [normalized];
          });

  if (blocks.length === 0) {
    const text = cleanText(document.getText("content").toString(), 100_000);
    if (text !== "") blocks.push({ id: "legacy-content", type: "paragraph", text });
  }

  return {
    version: 1,
    blocks,
    plainText: blocks.map(blockText).filter(Boolean).join("\n"),
  };
}

function normalizeProseMirrorFragment(fragment: Y.XmlFragment): NormalizedBlock[] {
  return fragment.toArray().flatMap((node, index) => normalizeProseMirrorNode(node, index));
}

function normalizeProseMirrorNode(
  node: Y.XmlElement | Y.XmlText | Y.XmlHook,
  index: number,
): NormalizedBlock[] {
  if (node instanceof Y.XmlText) {
    const text = cleanText(node.toString(), 100_000);
    return text === "" ? [] : [{ id: `prosemirror-${index + 1}`, type: "paragraph", text }];
  }
  if (!(node instanceof Y.XmlElement)) return [];

  const id = cleanIdentifier(node.getAttribute("id"), `prosemirror-${index + 1}`);
  const nodeName = node.nodeName;
  if (nodeName === "paragraph") {
    return [{ id, type: "paragraph", text: descendantText(node, 100_000) }];
  }
  if (nodeName === "heading") {
    const rawLevel = Number(node.getAttribute("level"));
    const level: 1 | 2 | 3 = rawLevel === 2 || rawLevel === 3 ? rawLevel : 1;
    return [{ id, type: "heading", level, text: descendantText(node, 2_000) }];
  }
  if (nodeName === "bulletList" || nodeName === "orderedList") {
    const items = node
      .toArray()
      .slice(0, 1_000)
      .map((item) => descendantText(item, 10_000));
    return [
      {
        id,
        type: "list",
        style: nodeName === "orderedList" ? "numbered" : "bullet",
        items,
      },
    ];
  }
  if (nodeName === "taskList") {
    return node
      .toArray()
      .slice(0, 1_000)
      .flatMap((item, itemIndex) => {
        if (!(item instanceof Y.XmlElement) || item.nodeName !== "taskItem") return [];
        return [
          {
            id: cleanIdentifier(item.getAttribute("id"), `${id}-task-${itemIndex + 1}`),
            type: "task" as const,
            text: descendantText(item, 10_000),
            checked: item.getAttribute("checked") === "true",
          },
        ];
      });
  }
  if (nodeName === "image") {
    const attachmentId = cleanIdentifier(node.getAttribute("attachmentId"), "");
    if (attachmentId !== "") {
      return [
        {
          id,
          type: "image",
          source: { kind: "attachment", attachmentId },
          alt: cleanText(node.getAttribute("alt"), 500),
        },
      ];
    }
    const source = cleanImageUrl(node.getAttribute("src"));
    if (source === null) return [];
    return [
      {
        id,
        type: "image",
        source: { kind: "url", url: source },
        alt: cleanText(node.getAttribute("alt"), 500),
      },
    ];
  }
  if (nodeName === "codeBlock") {
    return [
      {
        id,
        type: "code",
        language: cleanIdentifier(node.getAttribute("language"), "text"),
        text: descendantText(node, 200_000),
      },
    ];
  }
  return [];
}

function normalizeLegacyBlock(value: unknown, index: number): NormalizedBlock | null {
  if (!isRecord(value)) return null;
  const type = field(value, "type");
  const id = cleanIdentifier(field(value, "id"), `block-${index + 1}`);
  if (type === "paragraph") {
    return { id, type, text: cleanText(field(value, "text"), 100_000) };
  }
  if (type === "heading") {
    const rawLevel = field(value, "level");
    const level = rawLevel === 2 || rawLevel === 3 ? rawLevel : 1;
    return { id, type, level, text: cleanText(field(value, "text"), 2_000) };
  }
  if (type === "list") {
    const rawItems = field(value, "items");
    const items = Array.isArray(rawItems)
      ? rawItems.slice(0, 1_000).map((item) => cleanText(item, 10_000))
      : [];
    return {
      id,
      type,
      style: field(value, "style") === "numbered" ? "numbered" : "bullet",
      items,
    };
  }
  if (type === "task") {
    return {
      id,
      type,
      text: cleanText(field(value, "text"), 10_000),
      checked: field(value, "checked") === true,
    };
  }
  if (type === "image") {
    const attachmentId = cleanIdentifier(field(value, "attachmentId"), "");
    return attachmentId === ""
      ? null
      : {
          id,
          type,
          source: { kind: "attachment", attachmentId },
          alt: cleanText(field(value, "alt"), 500),
        };
  }
  if (type === "code") {
    return {
      id,
      type,
      language: cleanIdentifier(field(value, "language"), "text"),
      text: cleanText(field(value, "text"), 200_000),
    };
  }
  return null;
}

function descendantText(node: Y.XmlElement | Y.XmlText | Y.XmlHook, maxLength: number): string {
  if (node instanceof Y.XmlText) return cleanText(node.toString(), maxLength);
  if (!(node instanceof Y.XmlElement)) return "";
  return cleanText(
    node
      .toArray()
      .map((child) => descendantText(child, maxLength))
      .join(""),
    maxLength,
  );
}

function blockText(block: NormalizedBlock): string {
  if (block.type === "list") return block.items.join("\n");
  if (block.type === "image") return block.alt;
  return block.text;
}

function cleanImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function toUnknownJson(value: unknown): unknown {
  if (value instanceof Y.AbstractType) {
    const json: unknown = value.toJSON();
    return json;
  }
  return value;
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: object, key: string): unknown {
  const result: unknown = Reflect.get(value, key);
  return result;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, maxLength) : "";
}

function cleanIdentifier(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-zA-Z0-9._:-]{1,160}$/.test(value) ? value : fallback;
}
