const maximumSearchTextLength = 1_000_000;

export function extractSearchableProjectionText(projection: unknown): string {
  if (!isRecord(projection)) return "";
  const blocks = projection.blocks;
  if (!Array.isArray(blocks)) return "";
  const parts = blocks.slice(0, 10_000).flatMap(blockText);
  return parts.join("\n").slice(0, maximumSearchTextLength);
}

function blockText(value: unknown): string[] {
  if (!isRecord(value) || typeof value.type !== "string") return [];
  if (
    value.type === "paragraph" ||
    value.type === "heading" ||
    value.type === "task" ||
    value.type === "code"
  ) {
    return typeof value.text === "string" ? [clean(value.text)] : [];
  }
  if (value.type === "list" && Array.isArray(value.items)) {
    return value.items
      .slice(0, 1_000)
      .filter((item): item is string => typeof item === "string")
      .map(clean);
  }
  if (value.type === "image") {
    return typeof value.alt === "string" ? [clean(value.alt)] : [];
  }
  return [];
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
