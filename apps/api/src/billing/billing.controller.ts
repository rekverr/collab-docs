import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { BillingService } from "./billing.service";
import {
  ChangePlanDto,
  ChangePlanResultDto,
  MockBillingWebhookDto,
  MockWebhookResultDto,
  SubscriptionDto,
} from "./dto/billing.dto";

@ApiTags("billing")
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
@ApiForbiddenResponse({ description: "billing.manage capability required for plan changes" })
@ApiNotFoundResponse({ description: "Workspace subscription not found" })
@ApiUnprocessableEntityResponse({ description: "Target plan cannot contain current usage" })
@UseGuards(AccessTokenGuard)
@Controller("workspaces/:workspaceId/billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("subscription")
  @ApiOperation({ summary: "Get the current workspace plan, usage, and limits" })
  @ApiOkResponse({ type: SubscriptionDto })
  current(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ): Promise<SubscriptionDto> {
    return this.billing.current(user.id, workspaceId);
  }

  @Post("checkout")
  @ApiOperation({ summary: "Run a mock checkout and apply a plan change" })
  @ApiCreatedResponse({ type: ChangePlanResultDto })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() input: ChangePlanDto,
  ): Promise<ChangePlanResultDto> {
    return this.billing.checkout(user.id, workspaceId, input.plan);
  }

  @Post("mock-webhook")
  @ApiOperation({ summary: "Simulate idempotent Stripe-like subscription webhook delivery" })
  @ApiCreatedResponse({ type: MockWebhookResultDto })
  webhook(
    @CurrentUser() user: AuthenticatedUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() input: MockBillingWebhookDto,
  ): Promise<MockWebhookResultDto> {
    return this.billing.simulateWebhook(user.id, {
      eventId: input.eventId,
      eventType: input.eventType,
      workspaceId,
      plan: input.plan,
    });
  }
}
