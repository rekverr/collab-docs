export const workspacesChangedEvent = "collab-docs:workspaces-changed";

export function notifyWorkspacesChanged(): void {
  window.dispatchEvent(new Event(workspacesChangedEvent));
}
