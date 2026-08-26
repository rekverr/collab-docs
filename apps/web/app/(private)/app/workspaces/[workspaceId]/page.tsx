import { WorkspaceHome } from "../../../../../components/workspaces/workspace-home";

export default async function WorkspacePage({ params }: Readonly<{ params: Promise<{ workspaceId: string }> }>) {
  const { workspaceId } = await params;
  return <WorkspaceHome workspaceId={workspaceId} />;
}
