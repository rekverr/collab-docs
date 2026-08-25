export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthUserRecord extends AuthenticatedUser {
  passwordHash: string;
  deletedAt: Date | null;
}

export interface ClientMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionInput extends ClientMetadata {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export type RotationResult =
  | { status: "rotated"; user: AuthUserRecord }
  | { status: "invalid" | "reused" };

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthenticatedUser;
}
