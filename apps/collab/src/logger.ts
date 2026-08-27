export type LogLevel = "info" | "warn" | "error";
const sensitiveKey = /authorization|cookie|password|secret|token/i;

export interface StructuredLogger {
  event(
    level: LogLevel,
    event: string,
    fields?: Readonly<Record<string, string | number | boolean>>,
  ): void;
}

export class JsonLogger implements StructuredLogger {
  event(
    level: LogLevel,
    event: string,
    fields: Readonly<Record<string, string | number | boolean>> = {},
  ): void {
    const safeFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : safeValue(value),
      ]),
    );
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "collab",
      level,
      event,
      ...safeFields,
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  }
}

function safeValue(value: string | number | boolean): string | number | boolean {
  if (typeof value !== "string") return value;
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(postgres(?:ql)?|redis):\/\/([^:@/]+):([^@/]+)@/gi, "$1://$2:[REDACTED]@");
}
