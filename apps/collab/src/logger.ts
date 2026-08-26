export type LogLevel = "info" | "warn" | "error";

export interface StructuredLogger {
  event(level: LogLevel, event: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
}

export class JsonLogger implements StructuredLogger {
  event(level: LogLevel, event: string, fields: Readonly<Record<string, string | number | boolean>> = {}): void {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), service: "collab", level, event, ...fields });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  }
}
