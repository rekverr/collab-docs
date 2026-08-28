import { notFound } from "next/navigation";
import { SessionGate } from "../../../../../components/auth/session-provider";
import { AcceptInvitation } from "../../../../../components/workspaces/accept-invitation";

export default async function InvitationPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  return (
    <SessionGate>
      <AcceptInvitation token={token} />
    </SessionGate>
  );
}
