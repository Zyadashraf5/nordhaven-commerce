import { AppError } from '../../../platform/http/app-error';
import { lockCredentialOwner } from './credential-lock';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';

export interface SessionRecord {
  readonly authVersion: number;
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly clientLabel: string | null;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
}

const SESSION_SELECT = {
  authVersion: true,
  id: true,
  userId: true,
  tokenHash: true,
  clientLabel: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  revokedReason: true,
} as const;

export type SessionRevocationReason =
  | 'logout'
  | 'logout_all'
  | 'password_reset'
  | 'password_change';

@Injectable()
export class SessionRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async create(input: {
    userId: string;
    expectedAuthVersion?: number;
    tokenHash: string;
    clientLabel: string | null;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    return this.database.prisma.$transaction(async (transaction) => {
      const owner = await lockCredentialOwner(transaction, input.userId);
      if (
        input.expectedAuthVersion !== undefined &&
        input.expectedAuthVersion !== owner.authVersion
      )
        throw AppError.invalidCredentials();
      return transaction.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          clientLabel: input.clientLabel,
          createdAt: input.createdAt,
          lastUsedAt: input.createdAt,
          expiresAt: input.expiresAt,
          authVersion: owner.authVersion,
        },
        select: SESSION_SELECT,
      });
    });
  }

  public async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.database.prisma.session.findUnique({
      where: { tokenHash },
      select: SESSION_SELECT,
    });
  }

  /**
   * Resolves a session and its owning role in one statement so authenticating a request does not
   * cost an extra round trip.
   */
  public async findByTokenHashWithOwner(tokenHash: string): Promise<
    | (SessionRecord & {
        readonly ownerId: string;
        readonly ownerRole: 'CUSTOMER' | 'ADMIN';
        readonly ownerAuthVersion: number;
        readonly ownerExists: true;
      })
    | null
  > {
    const row = await this.database.prisma.session.findUnique({
      where: { tokenHash },
      select: { ...SESSION_SELECT, user: { select: { id: true, role: true, authVersion: true } } },
    });
    if (row === null) return null;
    const { user, ...session } = row;
    return {
      ...session,
      ownerId: user.id,
      ownerRole: user.role,
      ownerAuthVersion: user.authVersion,
      ownerExists: true,
    };
  }

  public async touch(id: string, now: Date): Promise<void> {
    await this.database.prisma.session.update({
      where: { id },
      data: { lastUsedAt: now },
    });
  }

  public async findOwnedById(sessionId: string, userId: string): Promise<SessionRecord | null> {
    return this.database.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: SESSION_SELECT,
    });
  }

  public async revoke(id: string, reason: SessionRevocationReason, now: Date): Promise<boolean> {
    const result = await this.database.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    return result.count > 0;
  }

  public async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
    exceptSessionId?: string,
  ): Promise<number> {
    const result = await this.database.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId === undefined ? {} : { NOT: { id: exceptSessionId } }),
      },
      data: { revokedAt: now, revokedReason: reason },
    });
    return result.count;
  }

  public async listForUser(userId: string, now: Date): Promise<readonly SessionRecord[]> {
    return this.database.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: SESSION_SELECT,
    });
  }
}
