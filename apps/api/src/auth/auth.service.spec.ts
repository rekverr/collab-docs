import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import type { AppEnvironment } from "../common/config/environment";
import { RuntimeEnvironment } from "../common/config/environment";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import type { AuthUserRecord, RotationResult, SessionInput } from "./auth.types";

interface StoredSession {
  input: SessionInput;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
}

class MemoryAuthRepository extends AuthRepository {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly sessions = new Map<string, StoredSession>();

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email) ?? null);
  }
  findActiveUserById(id: string): Promise<AuthUserRecord | null> {
    const user = this.users.get(id);
    return Promise.resolve(user?.deletedAt === null ? user : null);
  }
  createUser(
    email: string,
    passwordHash: string,
    displayName: string | null,
  ): Promise<AuthUserRecord> {
    const user = {
      id: `user-${this.users.size + 1}`,
      email,
      passwordHash,
      displayName,
      deletedAt: null,
    };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }
  createSession(input: SessionInput): Promise<void> {
    this.sessions.set(input.id, { input, revokedAt: null, replacedBySessionId: null });
    return Promise.resolve();
  }
  async rotateSession(
    oldSessionId: string,
    oldTokenHash: string,
    next: SessionInput,
    now: Date,
  ): Promise<RotationResult> {
    const current = this.sessions.get(oldSessionId);
    const user = current === undefined ? undefined : this.users.get(current.input.userId);
    if (
      current === undefined ||
      user === undefined ||
      current.input.tokenHash !== oldTokenHash ||
      current.input.expiresAt <= now
    )
      return { status: "invalid" };
    if (current.revokedAt !== null || current.replacedBySessionId !== null) {
      for (const session of this.sessions.values())
        if (session.input.familyId === current.input.familyId) session.revokedAt ??= now;
      return { status: "reused" };
    }
    current.revokedAt = now;
    current.replacedBySessionId = next.id;
    await this.createSession(next);
    return { status: "rotated", user };
  }
  revokeSession(tokenHash: string, now: Date): Promise<void> {
    for (const session of this.sessions.values())
      if (session.input.tokenHash === tokenHash) session.revokedAt ??= now;
    return Promise.resolve();
  }
}

function fixture(): AuthService {
  const values: AppEnvironment = {
    NODE_ENV: RuntimeEnvironment.Test,
    API_PORT: 3001,
    DATABASE_URL: "postgresql://user:password@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    JWT_ACCESS_SECRET: "a".repeat(64),
    JWT_REFRESH_SECRET: "b".repeat(64),
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
    S3_ENDPOINT: "http://localhost:9000",
    S3_PUBLIC_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY: "test",
    S3_SECRET_KEY: "test-secret",
    S3_BUCKET: "test-bucket",
    S3_REGION: "test-region",
    WEB_URL: "http://localhost:3000",
    API_URL: "http://localhost:3001",
    INTERNAL_API_URL: "http://localhost:3001",
    COLLAB_URL: "ws://localhost:3002",
    REVALIDATION_SECRET: "c".repeat(64),
  };
  return new AuthService(
    new MemoryAuthRepository(),
    new JwtService(),
    new ConfigService<AppEnvironment, true>(values),
  );
}

const registration = {
  email: "Person@Example.com",
  password: "StrongPassword123",
  displayName: "Person",
};

test("register creates a normalized user and tokens", async () => {
  const result = await fixture().register(registration, {});
  assert.equal(result.user.email, "person@example.com");
  assert.ok(result.accessToken.length > 20 && result.refreshToken.length > 20);
});

test("login issues a new persisted session", async () => {
  const auth = fixture();
  await auth.register(registration, {});
  const result = await auth.login(
    { email: registration.email, password: registration.password },
    {},
  );
  assert.equal(result.user.email, "person@example.com");
});

test("login rejects an invalid password", async () => {
  const auth = fixture();
  await auth.register(registration, {});
  await assert.rejects(
    auth.login({ email: registration.email, password: "wrong" }, {}),
    UnauthorizedException,
  );
});

test("refresh rotates the persisted session", async () => {
  const auth = fixture();
  const initial = await auth.register(registration, {});
  const rotated = await auth.refresh(initial.refreshToken, {});
  assert.notEqual(rotated.refreshToken, initial.refreshToken);
});

test("reuse of a rotated refresh token revokes the family", async () => {
  const auth = fixture();
  const initial = await auth.register(registration, {});
  const rotated = await auth.refresh(initial.refreshToken, {});
  await assert.rejects(auth.refresh(initial.refreshToken, {}), UnauthorizedException);
  await assert.rejects(auth.refresh(rotated.refreshToken, {}), UnauthorizedException);
});

test("logout revokes the refresh session", async () => {
  const auth = fixture();
  const initial = await auth.register(registration, {});
  await auth.logout(initial.refreshToken);
  await assert.rejects(auth.refresh(initial.refreshToken, {}), UnauthorizedException);
});

test("protected access token resolves the current user", async () => {
  const auth = fixture();
  const initial = await auth.register(registration, {});
  const user = await auth.authenticateAccessToken(initial.accessToken);
  assert.equal(user.id, initial.user.id);
});
