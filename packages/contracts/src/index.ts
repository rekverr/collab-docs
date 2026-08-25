export const workspaceRoles = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const plans = ["FREE", "PRO", "TEAM"] as const;
export type Plan = (typeof plans)[number];

export interface ApiHealth {
  status: "ok";
}
