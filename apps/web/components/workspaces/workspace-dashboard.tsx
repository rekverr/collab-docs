import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ApiError } from "../../lib/api/errors";
import { serverWorkspaceApi } from "../../lib/api/server-client";
import type { DocumentTreeNode, WorkspaceMember } from "../../lib/api/types";
import { SessionGate } from "../auth/session-provider";
import { BillingSettings } from "../billing/billing-settings";
import { DocumentNavigation } from "../documents/document-navigation";
import { WorkspaceSettingsForm } from "./workspace-settings-form";
import { WorkspaceMembers } from "./workspace-members";

export function WorkspaceDashboard({ workspaceId }: Readonly<{ workspaceId: string }>) {
  return (
    <section className="workspace-dashboard" aria-labelledby="workspace-dashboard-title">
      <div>
        <p className="eyebrow">Workspace dashboard</p>
        <h1 id="workspace-dashboard-title">Overview</h1>
      </div>
      <div className="dashboard-grid">
        <Suspense fallback={<DashboardCardSkeleton label="Workspace summary" />}>
          <WorkspaceSummarySection workspaceId={workspaceId} />
        </Suspense>
        <Suspense fallback={<DashboardCardSkeleton label="Recent documents" />}>
          <RecentDocumentsSection workspaceId={workspaceId} />
        </Suspense>
        <Suspense fallback={<DashboardCardSkeleton label="Member summary" />}>
          <MemberSummarySection workspaceId={workspaceId} />
        </Suspense>
        <Suspense fallback={<DashboardCardSkeleton label="Plan and usage" />}>
          <BillingSection workspaceId={workspaceId} />
        </Suspense>
      </div>
    </section>
  );
}

export async function WorkspaceDashboardNavigation({
  workspaceId,
}: Readonly<{ workspaceId: string }>) {
  try {
    const workspace = await serverWorkspaceApi.get(workspaceId);
    return (
      <SessionGate>
        <DocumentNavigation workspaceId={workspace.id} role={workspace.role} />
      </SessionGate>
    );
  } catch (error: unknown) {
    const sessionPending = error instanceof ApiError && error.status === 401;
    return (
      <aside className="document-navigation">
        <p className={sessionPending ? "muted small" : "error-message small"}>
          {sessionPending ? "Restoring navigation…" : "Navigation is temporarily unavailable."}
        </p>
      </aside>
    );
  }
}

export function WorkspaceNavigationSkeleton() {
  return (
    <aside className="document-navigation" aria-label="Loading document navigation">
      <span className="skeleton-line short" />
      <span className="skeleton-line" />
      <span className="skeleton-line medium" />
    </aside>
  );
}

async function WorkspaceSummarySection({ workspaceId }: Readonly<{ workspaceId: string }>) {
  try {
    const workspace = await serverWorkspaceApi.get(workspaceId);
    const canManage = workspace.role === "OWNER" || workspace.role === "ADMIN";
    return (
      <DashboardCard title="Workspace summary">
        <strong className="dashboard-primary">{workspace.name}</strong>
        <span className="muted small">/{workspace.slug}</span>
        <span className="dashboard-badge">{workspace.role}</span>
        {canManage && (
          <WorkspaceSettingsForm
            key={workspace.updatedAt}
            workspaceId={workspace.id}
            currentName={workspace.name}
          />
        )}
      </DashboardCard>
    );
  } catch (error: unknown) {
    return <DashboardSectionError error={error} title="Workspace summary" />;
  }
}

async function RecentDocumentsSection({ workspaceId }: Readonly<{ workspaceId: string }>) {
  try {
    const tree = await serverWorkspaceApi.documents(workspaceId);
    const recent = flattenDocuments(tree)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5);
    return (
      <DashboardCard title="Recent documents">
        {recent.length === 0 ? (
          <p className="muted small">No active documents yet.</p>
        ) : (
          <ul className="dashboard-list">
            {recent.map((document) => (
              <li key={document.id}>
                <Link href={`/app/workspaces/${workspaceId}/documents/${document.id}`}>
                  {document.title}
                </Link>
                <time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>
    );
  } catch (error: unknown) {
    return <DashboardSectionError error={error} title="Recent documents" />;
  }
}

async function MemberSummarySection({ workspaceId }: Readonly<{ workspaceId: string }>) {
  try {
    const [workspace, members] = await Promise.all([
      serverWorkspaceApi.get(workspaceId),
      serverWorkspaceApi.members(workspaceId),
    ]);
    return (
      <DashboardCard title="Member summary">
        <strong className="dashboard-primary">
          {members.length} {members.length === 1 ? "member" : "members"}
        </strong>
        <div className="dashboard-role-counts">{roleSummary(members)}</div>
        <SessionGate>
          <WorkspaceMembers workspace={workspace} />
        </SessionGate>
      </DashboardCard>
    );
  } catch (error: unknown) {
    return <DashboardSectionError error={error} title="Member summary" />;
  }
}

async function BillingSection({ workspaceId }: Readonly<{ workspaceId: string }>) {
  try {
    const workspace = await serverWorkspaceApi.get(workspaceId);
    return (
      <SessionGate>
        <BillingSettings workspaceId={workspaceId} canManage={workspace.role === "OWNER"} />
      </SessionGate>
    );
  } catch (error: unknown) {
    return <DashboardSectionError error={error} title="Plan and usage" />;
  }
}

function DashboardCard({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="dashboard-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function DashboardCardSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <section className="dashboard-card dashboard-card-loading" aria-label={`Loading ${label}`}>
      <span className="skeleton-line short" />
      <span className="skeleton-line" />
      <span className="skeleton-line medium" />
    </section>
  );
}

function DashboardSectionError({ error, title }: Readonly<{ error: unknown; title: string }>) {
  const sessionPending = error instanceof ApiError && error.status === 401;
  return (
    <DashboardCard title={title}>
      <p className={sessionPending ? "muted small" : "error-message small"}>
        {sessionPending ? "Restoring your session…" : "This section is temporarily unavailable."}
      </p>
    </DashboardCard>
  );
}

function flattenDocuments(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenDocuments(node.children)]);
}

function roleSummary(members: WorkspaceMember[]): ReactNode {
  const counts = new Map<string, number>();
  for (const member of members) counts.set(member.role, (counts.get(member.role) ?? 0) + 1);
  return [...counts.entries()].map(([role, count]) => (
    <span className="dashboard-badge" key={role}>
      {role}: {count}
    </span>
  ));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
