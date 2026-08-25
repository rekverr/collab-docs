import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { JsonLogger } from "../logging/json-logger.service";
import { getRequestId } from "../request/request-context";
import { DomainError } from "./domain-error";

interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  requestId: string | null;
  timestamp: string;
  path: string;
}

interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: string[];
}

function getPrismaErrorCode(exception: unknown): string | undefined {
  if (
    !(exception instanceof Error) ||
    exception.name !== "PrismaClientKnownRequestError" ||
    !("code" in exception) ||
    typeof exception.code !== "string"
  ) {
    return undefined;
  }
  return exception.code;
}

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const mapped = this.mapException(exception);
    const requestId = getRequestId() ?? null;

    if (mapped.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.event("error", "request_failed", {
        errorType: exception instanceof Error ? exception.name : "UnknownError",
        method: request.method,
        path: request.path,
        requestId,
        statusCode: mapped.status,
      });
    }

    const body: ErrorResponseBody = {
      statusCode: mapped.status,
      code: mapped.code,
      message: mapped.message,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.path,
    };
    if (mapped.details !== undefined) body.details = mapped.details;
    response.status(mapped.status).json(body);
  }

  private mapException(exception: unknown): MappedError {
    if (exception instanceof DomainError) {
      return { status: exception.status, code: exception.code, message: exception.message };
    }
    const prismaCode = getPrismaErrorCode(exception);
    if (prismaCode !== undefined) {
      if (prismaCode === "P2002") {
        return { status: HttpStatus.CONFLICT, code: "CONFLICT", message: "The resource already exists" };
      }
      if (prismaCode === "P2025") {
        return { status: HttpStatus.NOT_FOUND, code: "NOT_FOUND", message: "The resource was not found" };
      }
      if (prismaCode === "P2003") {
        return { status: HttpStatus.CONFLICT, code: "REFERENCE_CONFLICT", message: "The resource is still in use" };
      }
      return this.internalError();
    }
    if (exception instanceof HttpException) return this.mapHttpException(exception);
    return this.internalError();
  }

  private mapHttpException(exception: HttpException): MappedError {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === "string") {
      return { status, code: this.httpCode(status), message: response };
    }

    const rawMessage = "message" in response ? response.message : undefined;
    if (Array.isArray(rawMessage) && rawMessage.every((item) => typeof item === "string")) {
      return {
        status,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: rawMessage,
      };
    }
    return {
      status,
      code: this.httpCode(status),
      message: typeof rawMessage === "string" ? rawMessage : "Request failed",
    };
  }

  private httpCode(status: number): string {
    return HttpStatus[status] ?? "HTTP_ERROR";
  }

  private internalError(): MappedError {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    };
  }
}
