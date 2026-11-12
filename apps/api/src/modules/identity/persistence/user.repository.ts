import { AppError } from '../../../platform/http/app-error';
import { lockCredentialOwner } from './credential-lock';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import type { PrincipalRole } from '../../../platform/security/principal';

export interface UserRecord {
  readonly authVersion: number;
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: PrincipalRole;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
  readonly passwordChangedAt: Date | null;
  readonly createdAt: Date;
}

export interface UserAccountSummary {
  readonly id: string;
  readonly email: string;
  readonly role: PrincipalRole;
  readonly createdAt: Date;
}

const USER_SELECT = {
  authVersion: true,
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  passwordChangedAt: true,
  createdAt: true,
} as const;

const SUMMARY_SELECT = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export interface FailedLoginOutcome {
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
}

@Injectable()
export class UserRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async create(input: {
    email: string;
    passwordHash: string;
    role: PrincipalRole;
  }): Promise<UserRecord> {
    return this.database.prisma.user.create({
      data: { email: input.email, passwordHash: input.passwordHash, role: input.role },
      select: USER_SELECT,
    });
  }

  public async findByEmail(email: string): Promise<UserRecord | null> {
    return this.database.prisma.user.findUnique({ where: { email }, select: USER_SELECT });
  }

  public async findById(id: string): Promise<UserRecord | null> {
    return this.database.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  /**
   * Atomically increments the durable failure counter and applies a lockout at the threshold. The
   * counter survives a restart, which is what makes lockout resistant to a distributed attack.
   */
  public async registerFailedLogin(
    id: string,
    options: { readonly maxAttempts: number; readonly lockoutSeconds: number; readonly now: Date },
  ): Promise<FailedLoginOutcome> {
    const updated = await this.database.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (updated.failedLoginAttempts < options.maxAttempts) {
      return { failedLoginAttempts: updated.failedLoginAttempts, lockedUntil: null };
    }
    const lockedUntil = new Date(options.now.getTime() + options.lockoutSeconds * 1000);
    await this.database.prisma.user.update({ where: { id }, data: { lockedUntil } });
    return { failedLoginAttempts: updated.failedLoginAttempts, lockedUntil };
  }

  public async clearFailedLogins(id: string): Promise<void> {
    await this.database.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  public async updatePassword(
    id: string,
    passwordHash: string,
    now: Date,
    currentSessionId?: string,
    expectedAuthVersion?: number,
    resetTokenId?: string,
  ): Promise<void> {
    await this.database.prisma.$transaction(async (transaction) => {
      const owner = await lockCredentialOwner(transaction, id);
      if (expectedAuthVersion !== undefined && owner.authVersion !== expectedAuthVersion) {
        throw resetTokenId === undefined
          ? AppError.invalidCredentials()
          : AppError.invalidRecoveryToken();
      }
      if (resetTokenId !== undefined) {
        const token = await transaction.identityToken.updateMany({
          where: {
            id: resetTokenId,
            userId: id,
            purpose: 'PASSWORD_RESET',
            authVersion: owner.authVersion,
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: now },
        });
        if (token.count !== 1) throw AppError.invalidRecoveryToken();
      }
      const changed = await transaction.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          authVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        select: { authVersion: true },
      });
      await transaction.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
          ...(currentSessionId === undefined ? {} : { NOT: { id: currentSessionId } }),
        },
        data: {
          revokedAt: now,
          revokedReason: resetTokenId === undefined ? 'password_change' : 'password_reset',
        },
      });
      if (currentSessionId !== undefined) {
        await transaction.session.updateMany({
          where: { id: currentSessionId, userId: id, revokedAt: null },
          data: { authVersion: changed.authVersion },
        });
      }
      await transaction.identityToken.updateMany({
        where: { userId: id, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
    });
  }

  /** Cursor pagination ordered by identifier so pages stay stable without an ordering column. */
  public async listPage(
    limit: number,
    cursor?: string,
  ): Promise<{
    readonly users: readonly UserAccountSummary[];
    readonly nextCursor: string | null;
  }> {
    const rows = await this.database.prisma.user.findMany({
      where: cursor === undefined ? {} : { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: SUMMARY_SELECT,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    return { users: page, nextCursor: hasMore && last !== undefined ? last.id : null };
  }
  public async countAccounts(): Promise<number> {
    return this.database.prisma.user.count();
  }
  public async accountIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]> {
    const rows = await this.database.prisma.user.findMany({
      where: cursor === null ? {} : { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
  public async accountFactsForIds(ids: readonly string[]) {
    return this.database.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }
}
