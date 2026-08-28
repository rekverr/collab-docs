export type InvitationState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; email: string; role: string }
  | { status: "error"; message: string };

export const invitationIdle: InvitationState = { status: "idle" };

export function invitationSubmitting(): InvitationState {
  return { status: "submitting" };
}

export function invitationSucceeded(email: string, role: string): InvitationState {
  return { status: "success", email, role };
}

export function invitationFailed(message: string): InvitationState {
  return { status: "error", message };
}
