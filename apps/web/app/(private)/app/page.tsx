import { WorkspaceSelector } from "../../../components/workspaces/workspace-selector";
import { SessionGate } from "../../../components/auth/session-provider";

export default function WorkspaceSelectionPage() {
  return (
    <SessionGate>
      <WorkspaceSelector />
    </SessionGate>
  );
}
