import type { ReactNode } from "react";
import { SessionProvider } from "../../../components/auth/session-provider";
import { WorkspaceShell } from "../../../components/workspaces/workspace-shell";

export default function PrivateAppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <SessionProvider><WorkspaceShell>{children}</WorkspaceShell></SessionProvider>;
}
