import { HttpStatus } from "@nestjs/common";
import { DomainError } from "../common/errors/domain-error";

export type QuotaResource = "documents" | "members" | "storage";

export class QuotaExceededError extends DomainError {
  constructor(resource: QuotaResource) {
    super(
      `${resource.toUpperCase()}_LIMIT_REACHED`,
      `Workspace ${resource} limit reached. Upgrade the plan or reduce usage.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = "QuotaExceededError";
  }
}
