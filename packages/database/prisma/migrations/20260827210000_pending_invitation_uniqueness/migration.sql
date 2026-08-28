CREATE UNIQUE INDEX "WorkspaceInvitation_one_pending_email_per_workspace_key"
ON "WorkspaceInvitation" ("workspaceId", "email")
WHERE "status" = 'PENDING';
