"use client";

import { useActionState } from "react";
import {
  updateWorkspaceSettings,
  type WorkspaceSettingsState,
} from "../../app/(private)/app/workspaces/[workspaceId]/actions";

const initialState: WorkspaceSettingsState = { status: "idle", message: "" };

export function WorkspaceSettingsForm({
  workspaceId,
  currentName,
}: Readonly<{ workspaceId: string; currentName: string }>) {
  const action = updateWorkspaceSettings.bind(null, workspaceId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="dashboard-settings-form">
      <label htmlFor="workspace-name">Workspace name</label>
      <div>
        <input
          id="workspace-name"
          name="name"
          defaultValue={currentName}
          minLength={1}
          maxLength={160}
          required
        />
        <button className="button secondary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.status !== "idle" && (
        <p className={state.status === "error" ? "error-message small" : "notice small"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
