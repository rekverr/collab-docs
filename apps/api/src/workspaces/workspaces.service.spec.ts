import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { InvitationStatus, WorkspaceRole } from "@prisma/client";
import type { UsageQuotaService } from "../billing/usage-quota.service";
import type { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { CollaborationControlService } from "../permissions/collaboration-control.service";
import type { PolicyService } from "../permissions/policy.service";
import { WorkspacesService } from "./workspaces.service";

describe("WorkspacesService invitations", () => {
  it("rejects a duplicate pending invitation without consuming more quota", async () => {
    let quotaChecks = 0;
    const invitation = {
      id: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      email: "invitee@example.com",
      role: WorkspaceRole.VIEWER,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    };
    const transaction = {
      $executeRaw: async () => 1,
      user: { findUnique: async () => null },
      workspaceMember: { findUnique: async () => null },
      workspaceInvitation: {
        findFirst: async () => ({ id: invitation.id }),
      },
    };
    const service = createService(transaction, () => {
      quotaChecks += 1;
    });

    await assert.rejects(
      service.invite("actor-id", invitation.workspaceId, {
        email: "  INVITEE@example.com ",
        role: WorkspaceRole.VIEWER,
      }),
      ConflictException,
    );
    assert.equal(quotaChecks, 0);
  });

  it("rejects a consumed invitation without attempting another membership write", async () => {
    const transaction = {
      workspaceInvitation: {
        findUnique: async () => ({ status: InvitationStatus.ACCEPTED }),
      },
    };
    const service = createService(transaction);

    await assert.rejects(
      service.accept(
        { id: "user-id", email: "invitee@example.com", displayName: null },
        "a".repeat(43),
      ),
      (error: unknown) =>
        error instanceof ConflictException && error.message === "Invitation has already been used",
    );
  });

  it("declines only an invitation matching the authenticated email", async () => {
    let updates = 0;
    const transaction = {
      workspaceInvitation: {
        findUnique: async () => ({
          id: "invitation-id",
          email: "invitee@example.com",
          status: InvitationStatus.PENDING,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: async () => {
          updates += 1;
          return { count: 1 };
        },
      },
    };
    const service = createService(transaction);

    await service.decline(
      { id: "user-id", email: "INVITEE@example.com", displayName: null },
      "invitation-id",
    );
    assert.equal(updates, 1);
  });

  it("accepts by ID atomically with the invitation role and rejects another email", async () => {
    let memberships = 0;
    const invitation = {
      id: "invitation-id",
      workspaceId: "workspace-id",
      email: "invitee@example.com",
      role: WorkspaceRole.VIEWER,
      invitedById: "owner-id",
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const transaction = {
      workspaceInvitation: {
        findUnique: async () => invitation,
        updateMany: async () => ({ count: 1 }),
      },
      workspaceMember: {
        findUnique: async () => null,
        create: async ({ data }: { data: { role: WorkspaceRole } }) => {
          memberships += 1;
          return { id: "membership-id", ...data, createdAt: new Date() };
        },
      },
    };
    const service = createService(transaction);

    const membership = await service.acceptById(
      { id: "invitee-id", email: "invitee@example.com", displayName: null },
      invitation.id,
    );
    assert.equal(membership.role, WorkspaceRole.VIEWER);
    assert.equal(memberships, 1);

    await assert.rejects(
      service.acceptById(
        { id: "other-id", email: "other@example.com", displayName: null },
        invitation.id,
      ),
      ForbiddenException,
    );
    assert.equal(memberships, 1);
  });
});

function createService(transaction: object, onQuotaCheck: () => void = () => undefined) {
  const prisma = {
    $transaction: async (operation: (client: object) => Promise<unknown>) => operation(transaction),
  } as unknown as PrismaService;
  const policy = {
    requireWorkspaceCapability: async () => ({
      role: WorkspaceRole.OWNER,
      workspace: { id: "workspace-id", ownerId: "actor-id", deletedAt: null },
    }),
    assertCanAssignRole: () => undefined,
  } as unknown as PolicyService;
  const quota = {
    assertInvitationCapacity: async () => onQuotaCheck(),
    assertMemberCapacity: async () => undefined,
  } as unknown as UsageQuotaService;
  const collaborationControl = {} as CollaborationControlService;
  return new WorkspacesService(prisma, policy, quota, collaborationControl);
}
