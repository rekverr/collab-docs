import { Injectable } from "@nestjs/common";
import { JsonLogger } from "../common/logging/json-logger.service";
import { RedisService } from "../infrastructure/redis/redis.service";

const collaborationControlChannel = "collab:document-control";

type CollaborationControlEvent =
  | { type: "document-access-changed"; documentId: string }
  | { type: "document-unavailable"; documentId: string }
  | { type: "document-restored"; documentId: string }
  | { type: "user-access-changed"; userId: string };

@Injectable()
export class CollaborationControlService {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: JsonLogger,
  ) {}

  documentAccessChanged(documentId: string): Promise<void> {
    return this.publish({ type: "document-access-changed", documentId });
  }

  documentUnavailable(documentId: string): Promise<void> {
    return this.publish({ type: "document-unavailable", documentId });
  }

  documentRestored(documentId: string): Promise<void> {
    return this.publish({ type: "document-restored", documentId });
  }

  userAccessChanged(userId: string): Promise<void> {
    return this.publish({ type: "user-access-changed", userId });
  }

  private async publish(event: CollaborationControlEvent): Promise<void> {
    try {
      await this.redis.client.publish(collaborationControlChannel, JSON.stringify(event));
    } catch (error: unknown) {
      this.logger.event("error", "collab_control_publish_failed", {
        controlType: event.type,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
