import { WorkspaceHome } from "../../../../../../../components/workspaces/workspace-home";

export default async function SelectedDocumentPage({
  params,
}: Readonly<{ params: Promise<{ workspaceId: string; documentId: string }> }>) {
  const { workspaceId, documentId } = await params;
  return <WorkspaceHome workspaceId={workspaceId} selectedDocumentId={documentId} />;
}
