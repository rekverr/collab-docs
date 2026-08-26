import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import type { AppEnvironment } from "../common/config/environment";
import { AuthRepository } from "./auth.repository";
import type {
  AuthResult,
  AuthenticatedUser,
  AuthUserRecord,
  ClientMetadata,
  SessionInput,
} from "./auth.types";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";

interface AccessClaims {
  sub: string;
  type: "access";
}
interface RefreshClaims {
  sub: string;
  sid: string;
  familyId: string;
  type: "refresh";
}

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.accessSecret = config.getOrThrow("JWT_ACCESS_SECRET", { infer: true });
    this.refreshSecret = config.getOrThrow("JWT_REFRESH_SECRET", { infer: true });
    this.accessTtlSeconds = Math.floor(
      parseDuration(config.getOrThrow("JWT_ACCESS_TTL", { infer: true })) / 1000,
    );
    this.refreshTtlMs = parseDuration(config.getOrThrow("JWT_REFRESH_TTL", { infer: true }));
  }

  async register(dto: RegisterDto, client: ClientMetadata): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);
    if (await this.repository.findUserByEmail(email))
      throw new ConflictException("An account with this email already exists");
    const user = await this.repository.createUser(
      email,
      await hash(dto.password, 12),
      normalizeName(dto.displayName),
    );
    return this.createAuthentication(user, client);
  }

  async login(dto: LoginDto, client: ClientMetadata): Promise<AuthResult> {
    const user = await this.repository.findUserByEmail(normalizeEmail(dto.email));
    if (
      user === null ||
      user.deletedAt !== null ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.createAuthentication(user, client);
  }

  async refresh(rawToken: string | undefined, client: ClientMetadata): Promise<AuthResult> {
    if (rawToken === undefined) throw new UnauthorizedException("Refresh session is required");
    const claims = await this.verifyRefresh(rawToken);
    const nextId = randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    const refreshToken = await this.signRefresh(claims.sub, nextId, claims.familyId);
    const result = await this.repository.rotateSession(
      claims.sid,
      tokenHash(rawToken),
      sessionInput(nextId, claims.sub, claims.familyId, refreshToken, expiresAt, client),
      new Date(),
    );
    if (result.status !== "rotated")
      throw new UnauthorizedException("Refresh session is invalid or expired");
    return {
      accessToken: await this.signAccess(result.user.id),
      refreshToken,
      refreshExpiresAt: expiresAt,
      user: publicUser(result.user),
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken !== undefined)
      await this.repository.revokeSession(tokenHash(rawToken), new Date());
  }

  async authenticateAccessToken(rawToken: string): Promise<AuthenticatedUser> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(rawToken, { secret: this.accessSecret });
    } catch {
      throw new UnauthorizedException("Access token is invalid or expired");
    }
    if (claims.type !== "access" || typeof claims.sub !== "string")
      throw new UnauthorizedException("Access token is invalid");
    const user = await this.repository.findActiveUserById(claims.sub);
    if (user === null) throw new UnauthorizedException("Access token is invalid");
    return publicUser(user);
  }

  private async createAuthentication(
    user: AuthUserRecord,
    client: ClientMetadata,
  ): Promise<AuthResult> {
    const id = randomUUID();
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    const refreshToken = await this.signRefresh(user.id, id, familyId);
    await this.repository.createSession(
      sessionInput(id, user.id, familyId, refreshToken, expiresAt, client),
    );
    return {
      accessToken: await this.signAccess(user.id),
      refreshToken,
      refreshExpiresAt: expiresAt,
      user: publicUser(user),
    };
  }

  private signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, type: "access" } satisfies AccessClaims, {
      secret: this.accessSecret,
      expiresIn: this.accessTtlSeconds,
    });
  }

  private signRefresh(userId: string, sessionId: string, familyId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, familyId, type: "refresh" } satisfies RefreshClaims,
      {
        secret: this.refreshSecret,
        expiresIn: Math.floor(this.refreshTtlMs / 1000),
      },
    );
  }

  private async verifyRefresh(rawToken: string | undefined): Promise<RefreshClaims> {
    if (rawToken === undefined) throw new UnauthorizedException("Refresh session is required");
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(rawToken, {
        secret: this.refreshSecret,
      });
      if (claims.type !== "refresh" || !claims.sid || !claims.familyId || !claims.sub)
        throw new Error("invalid claims");
      return claims;
    } catch {
      throw new UnauthorizedException("Refresh session is invalid or expired");
    }
  }
}

function parseDuration(value: string): number {
  const amount = Number(value.slice(0, -1));
  const unit = value.at(-1);
  const multiplier =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * multiplier;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function normalizeName(name: string | undefined): string | null {
  return name?.trim() || null;
}
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function publicUser(user: AuthUserRecord): AuthenticatedUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}
function sessionInput(
  id: string,
  userId: string,
  familyId: string,
  token: string,
  expiresAt: Date,
  client: ClientMetadata,
): SessionInput {
  return { id, userId, familyId, tokenHash: tokenHash(token), expiresAt, ...client };
}
