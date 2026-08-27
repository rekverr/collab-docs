import { WorkspaceHome } from "../../../../../../../components/workspaces/workspace-home";
import { SessionGate } from "../../../../../../../components/auth/session-provider";

export default async function SelectedDocumentPage({
  params,
}: Readonly<{ params: Promise<{ workspaceId: string; documentId: string }> }>) {
  const { workspaceId, documentId } = await params;
  return (
    <SessionGate>
      <WorkspaceHome workspaceId={workspaceId} selectedDocumentId={documentId} />
    </SessionGate>
  );
}
