import { Suspense } from "react";
import {
  WorkspaceDashboard,
  WorkspaceDashboardNavigation,
  WorkspaceNavigationSkeleton,
} from "../../../../../components/workspaces/workspace-dashboard";

export default async function WorkspacePage({
  params,
}: Readonly<{ params: Promise<{ workspaceId: string }> }>) {
  const { workspaceId } = await params;
  return (
    <main className="document-workspace">
      <Suspense fallback={<WorkspaceNavigationSkeleton />}>
        <WorkspaceDashboardNavigation workspaceId={workspaceId} />
      </Suspense>
      <WorkspaceDashboard workspaceId={workspaceId} />
    </main>
  );
}
