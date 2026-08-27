import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BillingEventStatus, Plan, Prisma, SubscriptionStatus } from "@prisma/client";
import { JsonLogger } from "../common/logging/json-logger.service";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PolicyService } from "../permissions/policy.service";
import type { ChangePlanResultDto, MockWebhookResultDto, SubscriptionDto } from "./dto/billing.dto";
import { planCatalog } from "./plan-catalog";
import { UsageQuotaService, type WorkspaceUsage } from "./usage-quota.service";

const subscriptionSelect = {
  id: true,
  workspaceId: true,
  plan: true,
  status: true,
  providerSubscriptionId: true,
  memberLimit: true,
  documentLimit: true,
  storageLimitBytes: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionSelect;

interface BillingWebhookInput {
  eventId: string;
  eventType: string;
  workspaceId: string;
  plan: Plan;
}

interface ProcessedWebhook {
  applied: boolean;
  subscription: SubscriptionRecord;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly quota: UsageQuotaService,
    private readonly logger: JsonLogger,
  ) {}

  async current(userId: string, workspaceId: string): Promise<SubscriptionDto> {
    await this.policy.requireWorkspaceCapability(userId, workspaceId, "workspace.read");
    return this.prisma.$transaction(async (transaction) => {
      const subscription = await transaction.subscription.findUnique({
        where: { workspaceId },
        select: subscriptionSelect,
      });
      if (subscription === null) throw new NotFoundException("Subscription not found");
      const usage = await this.quota.usage(transaction, workspaceId);
      return mapSubscription(subscription, usage);
    });
  }

  async checkout(userId: string, workspaceId: string, plan: Plan): Promise<ChangePlanResultDto> {
    await this.policy.requireWorkspaceCapability(userId, workspaceId, "billing.manage");
    const checkoutId = `mock_checkout_${randomUUID()}`;
    const eventId = `mock_event_${randomUUID()}`;
    const processed = await this.processWebhook({
      eventId,
      eventType: "customer.subscription.updated",
      workspaceId,
      plan,
    });
    return {
      checkoutId,
      eventId,
      applied: processed.applied,
      subscription: await this.subscriptionWithUsage(processed.subscription),
    };
  }

  async simulateWebhook(userId: string, input: BillingWebhookInput): Promise<MockWebhookResultDto> {
    await this.policy.requireWorkspaceCapability(userId, input.workspaceId, "billing.manage");
    const processed = await this.processWebhook(input);
    return {
      eventId: input.eventId,
      applied: processed.applied,
      subscription: await this.subscriptionWithUsage(processed.subscription),
    };
  }

  async processWebhook(input: BillingWebhookInput): Promise<ProcessedWebhook> {
    try {
      const result = await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Subscription" WHERE "workspaceId" = ${input.workspaceId}::uuid FOR UPDATE`,
          );
          const subscription = await transaction.subscription.findUnique({
            where: { workspaceId: input.workspaceId },
            select: subscriptionSelect,
          });
          if (subscription === null) throw new NotFoundException("Subscription not found");
          const payload: Prisma.InputJsonObject = {
            workspaceId: input.workspaceId,
            plan: input.plan,
          };
          const event = await transaction.billingEvent.create({
            data: {
              eventId: input.eventId,
              eventType: input.eventType,
              workspaceId: input.workspaceId,
              subscriptionId: subscription.id,
              status: BillingEventStatus.RECEIVED,
              payload,
            },
            select: { id: true },
          });
          const limits = planCatalog[input.plan];
          const usage = await this.quota.usage(transaction, input.workspaceId);
          this.quota.assertPlanCanContainUsage(usage, limits);
          const now = new Date();
          const updated = await transaction.subscription.update({
            where: { id: subscription.id },
            data: {
              plan: input.plan,
              status: SubscriptionStatus.ACTIVE,
              providerSubscriptionId:
                input.plan === Plan.FREE
                  ? null
                  : (subscription.providerSubscriptionId ?? `mock_sub_${input.workspaceId}`),
              memberLimit: limits.members,
              documentLimit: limits.documents,
              storageLimitBytes: limits.storageBytes,
              currentPeriodStart: now,
              currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
              canceledAt: null,
            },
            select: subscriptionSelect,
          });
          await transaction.billingEvent.update({
            where: { id: event.id },
            data: { status: BillingEventStatus.PROCESSED, processedAt: now },
          });
          return { applied: true, subscription: updated };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      this.logger.event("info", "billing_plan_changed", {
        eventId: input.eventId,
        workspaceId: input.workspaceId,
        plan: input.plan,
      });
      return result;
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) throw error;
      const duplicate = await this.duplicateResult(input);
      this.logger.event("info", "billing_webhook_duplicate", {
        eventId: input.eventId,
        workspaceId: input.workspaceId,
      });
      return duplicate;
    }
  }

  private async duplicateResult(input: BillingWebhookInput): Promise<ProcessedWebhook> {
    const event = await this.prisma.billingEvent.findUnique({
      where: { eventId: input.eventId },
      select: { eventType: true, workspaceId: true, payload: true, status: true },
    });
    if (
      event === null ||
      event.status !== BillingEventStatus.PROCESSED ||
      event.eventType !== input.eventType ||
      event.workspaceId !== input.workspaceId ||
      payloadPlan(event.payload) !== input.plan
    ) {
      throw new ConflictException("Billing event ID was already used for different data");
    }
    const subscription = await this.prisma.subscription.findUnique({
      where: { workspaceId: input.workspaceId },
      select: subscriptionSelect,
    });
    if (subscription === null) throw new NotFoundException("Subscription not found");
    return { applied: false, subscription };
  }

  private async subscriptionWithUsage(subscription: SubscriptionRecord): Promise<SubscriptionDto> {
    const usage = await this.prisma.$transaction((transaction) =>
      this.quota.usage(transaction, subscription.workspaceId),
    );
    return mapSubscription(subscription, usage);
  }
}

type SubscriptionRecord = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

function mapSubscription(subscription: SubscriptionRecord, usage: WorkspaceUsage): SubscriptionDto {
  return {
    id: subscription.id,
    workspaceId: subscription.workspaceId,
    plan: subscription.plan,
    status: subscription.status,
    members: { used: usage.members, limit: subscription.memberLimit },
    documents: { used: usage.documents, limit: subscription.documentLimit },
    storage: {
      usedBytes: usage.storageBytes.toString(),
      limitBytes: subscription.storageLimitBytes.toString(),
    },
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    updatedAt: subscription.updatedAt,
  };
}

function payloadPlan(payload: Prisma.JsonValue): Plan | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const plan: unknown = Reflect.get(payload, "plan");
  return plan === Plan.FREE || plan === Plan.PRO || plan === Plan.TEAM ? plan : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    "code" in error &&
    error.code === "P2002"
  );
}
