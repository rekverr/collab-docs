"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "../../../../../lib/api/errors";
import { serverWorkspaceApi } from "../../../../../lib/api/server-client";

export interface WorkspaceSettingsState {
  status: "idle" | "error" | "success";
  message: string;
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  _previousState: WorkspaceSettingsState,
  formData: FormData,
): Promise<WorkspaceSettingsState> {
  const value = formData.get("name");
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > 160) {
    return { status: "error", message: "Workspace name must be 1–160 characters." };
  }
  try {
    await serverWorkspaceApi.update(workspaceId, name);
    revalidatePath(`/app/workspaces/${workspaceId}`);
    return { status: "success", message: "Workspace settings updated." };
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      return { status: "error", message: "Your session expired. Refresh and try again." };
    }
    if (error instanceof ApiError && error.status === 403) {
      return { status: "error", message: "You cannot manage this workspace." };
    }
    return { status: "error", message: "Workspace settings could not be updated." };
  }
}
