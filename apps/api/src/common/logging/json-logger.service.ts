import { Injectable, LoggerService } from "@nestjs/common";
import { getRequestId } from "../request/request-context";

type LogLevel = "debug" | "error" | "info" | "warn";
type LogField = boolean | number | string | null | undefined;

const sensitiveKey = /authorization|cookie|password|secret|token/i;

@Injectable()
export class JsonLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", this.message(message), this.context(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", this.message(message), this.context(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", this.message(message), this.context(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", this.message(message), this.context(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", this.message(message), this.context(optionalParams));
  }

  event(level: LogLevel, event: string, fields: Record<string, LogField> = {}): void {
    const safeFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : this.safeValue(value),
      ]),
    );
    this.write(level, event, undefined, safeFields);
  }

  private write(level: LogLevel, message: string, context?: string, fields: Record<string, LogField> = {}): void {
    const currentRequestId = getRequestId();
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message: this.safeString(message),
      ...(context === undefined ? {} : { context: this.safeString(context) }),
      ...(currentRequestId === undefined ? {} : { requestId: currentRequestId }),
      ...fields,
    });
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`${record}\n`);
  }

  private message(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.name;
    return "Non-string log message";
  }

  private context(values: unknown[]): string | undefined {
    const candidate = values.at(-1);
    return typeof candidate === "string" ? candidate : undefined;
  }

  private safeValue(value: LogField): LogField {
    return typeof value === "string" ? this.safeString(value) : value;
  }

  private safeString(value: string): string {
    return value
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
      .replace(/(postgres(?:ql)?|redis):\/\/([^:@/]+):([^@/]+)@/gi, "$1://$2:[REDACTED]@");
  }
}
