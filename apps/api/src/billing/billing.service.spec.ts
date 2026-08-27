import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { BillingEventStatus, Plan, SubscriptionStatus } from "@prisma/client";
import type { JsonLogger } from "../common/logging/json-logger.service";
import type { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { PolicyService } from "../permissions/policy.service";
import { BillingService } from "./billing.service";
import type { UsageQuotaService } from "./usage-quota.service";

describe("BillingService", () => {
  it("applies the first webhook and treats identical delivery as a no-op", async () => {
    const database = billingDatabase();
    const service = new BillingService(database.prisma, allowingPolicy(), quota(), logger());
    const input = {
      eventId: "evt_same",
      eventType: "customer.subscription.updated",
      workspaceId: "workspace-1",
      plan: Plan.PRO,
    };

    const first = await service.processWebhook(input);
    const duplicate = await service.processWebhook(input);

    assert.equal(first.applied, true);
    assert.equal(first.subscription.plan, Plan.PRO);
    assert.equal(duplicate.applied, false);
    assert.equal(database.subscriptionUpdates(), 1);
  });

  it("requires billing.manage before changing a plan", async () => {
    const database = billingDatabase();
    const policy = {
      requireWorkspaceCapability: async () => {
        throw new ForbiddenException("Missing billing.manage");
      },
    } as unknown as PolicyService;
    const service = new BillingService(database.prisma, policy, quota(), logger());

    await assert.rejects(service.checkout("viewer-1", "workspace-1", Plan.PRO), ForbiddenException);
    assert.equal(database.subscriptionUpdates(), 0);
  });
});

function billingDatabase(): {
  prisma: PrismaService;
  subscriptionUpdates(): number;
} {
  let updates = 0;
  const events = new Map<
    string,
    {
      id: string;
      eventType: string;
      workspaceId: string;
      payload: { workspaceId: string; plan: Plan };
      status: BillingEventStatus;
    }
  >();
  let subscription = {
    id: "subscription-1",
    workspaceId: "workspace-1",
    plan: Plan.FREE,
    status: SubscriptionStatus.ACTIVE,
    providerSubscriptionId: null as string | null,
    memberLimit: 5,
    documentLimit: 100,
    storageLimitBytes: 1024n,
    currentPeriodStart: null as Date | null,
    currentPeriodEnd: null as Date | null,
    updatedAt: new Date("2026-08-27T10:00:00.000Z"),
  };
  const transaction = {
    $queryRaw: async () => [],
    subscription: {
      findUnique: async () => subscription,
      update: async (input: { data: typeof subscription }) => {
        updates += 1;
        subscription = { ...subscription, ...input.data, updatedAt: new Date() };
        return subscription;
      },
    },
    billingEvent: {
      create: async (input: {
        data: {
          eventId: string;
          eventType: string;
          workspaceId: string;
          payload: { workspaceId: string; plan: Plan };
        };
      }) => {
        if (events.has(input.data.eventId)) {
          const error = new Error("Unique constraint");
          error.name = "PrismaClientKnownRequestError";
          Reflect.set(error, "code", "P2002");
          throw error;
        }
        const event = {
          id: `billing-${events.size + 1}`,
          eventType: input.data.eventType,
          workspaceId: input.data.workspaceId,
          payload: input.data.payload,
          status: BillingEventStatus.RECEIVED,
        };
        events.set(input.data.eventId, event);
        return { id: event.id };
      },
      update: async (input: { where: { id: string } }) => {
        const event = [...events.values()].find(({ id }) => id === input.where.id);
        if (event !== undefined) event.status = BillingEventStatus.PROCESSED;
        return event;
      },
    },
  };
  const prisma = {
    $transaction: async (operation: (client: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    billingEvent: {
      findUnique: async (input: { where: { eventId: string } }) =>
        events.get(input.where.eventId) ?? null,
    },
    subscription: { findUnique: async () => subscription },
  } as unknown as PrismaService;
  return { prisma, subscriptionUpdates: () => updates };
}

function allowingPolicy(): PolicyService {
  return {
    requireWorkspaceCapability: async () => ({ role: "OWNER" }),
  } as unknown as PolicyService;
}

function quota(): UsageQuotaService {
  return {
    usage: async () => ({ members: 1, documents: 1, storageBytes: 0n }),
    assertPlanCanContainUsage: () => undefined,
  } as unknown as UsageQuotaService;
}

function logger(): JsonLogger {
  return { event: () => undefined } as unknown as JsonLogger;
}
