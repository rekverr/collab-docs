import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.statusCode === "number" &&
    typeof record.code === "string" &&
    typeof record.message === "string"
  );
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.details.length > 0) return error.details.join(" ");
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 409) return error.message;
    if (error.status === 429) return "Too many attempts. Please wait a moment and try again.";
    return error.message;
  }
  return "We could not complete the request. Please try again.";
}
