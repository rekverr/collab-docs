import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import type { AuthUserRecord, RotationResult, SessionInput } from "./auth.types";

export abstract class AuthRepository {
  abstract findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  abstract findActiveUserById(id: string): Promise<AuthUserRecord | null>;
  abstract createUser(email: string, passwordHash: string, displayName: string | null): Promise<AuthUserRecord>;
  abstract createSession(input: SessionInput): Promise<void>;
  abstract rotateSession(oldSessionId: string, oldTokenHash: string, next: SessionInput, now: Date): Promise<RotationResult>;
  abstract revokeSession(tokenHash: string, now: Date): Promise<void>;
}

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findActiveUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  createUser(email: string, passwordHash: string, displayName: string | null): Promise<AuthUserRecord> {
    return this.prisma.user.create({ data: { email, passwordHash, displayName } });
  }

  async createSession(input: SessionInput): Promise<void> {
    await this.prisma.refreshSession.create({ data: input });
  }

  rotateSession(oldSessionId: string, oldTokenHash: string, next: SessionInput, now: Date): Promise<RotationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshSession.findUnique({
        where: { id: oldSessionId },
        include: { user: true },
      });
      if (current === null || current.tokenHash !== oldTokenHash || current.expiresAt <= now || current.user.deletedAt !== null) {
        return { status: "invalid" };
      }
      if (current.revokedAt !== null || current.replacedBySessionId !== null) {
        await transaction.refreshSession.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now, revokeReason: "refresh-token-reuse" },
        });
        return { status: "reused" };
      }

      await transaction.refreshSession.create({ data: next });

      const claimed = await transaction.refreshSession.updateMany({
        where: { id: current.id, revokedAt: null, replacedBySessionId: null },
        data: { revokedAt: now, revokeReason: "rotated", replacedBySessionId: next.id, lastUsedAt: now },
      });
      if (claimed.count !== 1) {
        await transaction.refreshSession.delete({ where: { id: next.id } });
        await transaction.refreshSession.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now, revokeReason: "refresh-token-reuse" },
        });
        return { status: "reused" };
      }
      return { status: "rotated", user: current.user };
    });
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now, revokeReason: "logout" },
    });
  }
}
