import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client";
import { PolicyService, type PolicyDatabase } from "./policy.service";

function databaseFor(role: WorkspaceRole | null, deletedAt: Date | null = null): PolicyDatabase {
  return {
    workspaceMember: {
      findUnique: () => Promise.resolve(role === null ? null : {
        role,
        workspace: { id: "workspace-1", ownerId: "owner-1", deletedAt },
      }),
    },
  };
}

describe("workspace capability policy", () => {
  it("grants the documented role capabilities", () => {
    const policy = new PolicyService(databaseFor(null));
    assert.equal(policy.hasCapability(WorkspaceRole.OWNER, "billing.manage"), true);
    assert.equal(policy.hasCapability(WorkspaceRole.ADMIN, "document.publish"), true);
    assert.equal(policy.hasCapability(WorkspaceRole.ADMIN, "billing.manage"), false);
    assert.equal(policy.hasCapability(WorkspaceRole.EDITOR, "document.edit"), true);
    assert.equal(policy.hasCapability(WorkspaceRole.EDITOR, "document.delete"), false);
    assert.equal(policy.hasCapability(WorkspaceRole.VIEWER, "document.read"), true);
    assert.equal(policy.hasCapability(WorkspaceRole.VIEWER, "workspace.manage"), false);
  });

  it("prevents non-owners from assigning administrator or owner roles", () => {
    const policy = new PolicyService(databaseFor(null));
    assert.throws(() => policy.assertCanAssignRole(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN), ForbiddenException);
    assert.throws(() => policy.assertCanAssignRole(WorkspaceRole.OWNER, WorkspaceRole.OWNER), ForbiddenException);
    assert.doesNotThrow(() => policy.assertCanAssignRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN));
  });
});

describe("workspace policy persistence boundary", () => {
  it("returns authoritative membership access", async () => {
    const policy = new PolicyService(databaseFor(WorkspaceRole.EDITOR));
    const access = await policy.requireWorkspaceCapability("user-1", "workspace-1", "document.edit");
    assert.equal(access.role, WorkspaceRole.EDITOR);
  });

  it("hides workspaces from outsiders and deleted memberships", async () => {
    await assert.rejects(new PolicyService(databaseFor(null)).requireWorkspaceCapability("outsider", "workspace-1", "workspace.read"), NotFoundException);
    await assert.rejects(new PolicyService(databaseFor(WorkspaceRole.OWNER, new Date())).requireWorkspaceCapability("owner-1", "workspace-1", "workspace.read"), NotFoundException);
  });

  it("denies a Viewer document mutations after loading current membership", async () => {
    await assert.rejects(new PolicyService(databaseFor(WorkspaceRole.VIEWER)).requireWorkspaceCapability("viewer-1", "workspace-1", "document.edit"), ForbiddenException);
  });

  it("denies an outsider direct document access without revealing the workspace", async () => {
    await assert.rejects(new PolicyService(databaseFor(null)).requireWorkspaceCapability("outsider", "workspace-1", "document.read"), NotFoundException);
  });
});
