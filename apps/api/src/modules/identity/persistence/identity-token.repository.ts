import { AppError } from '../../../platform/http/app-error';
import { lockCredentialOwner } from './credential-lock';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';

export type IdentityTokenPurpose = 'PASSWORD_RESET' | 'MFA_ENROLLMENT' | 'MFA_VERIFICATION';

export interface IdentityTokenRecord {
  readonly authVersion: number;
  readonly id: string;
  readonly userId: string;
  readonly purpose: IdentityTokenPurpose;
  readonly expiresAt: Date;
}

const TOKEN_SELECT = {
  authVersion: true,
  id: true,
  userId: true,
  purpose: true,
  expiresAt: true,
} as const;

@Injectable()
export class IdentityTokenRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async create(input: {
    userId: string;
    expectedAuthVersion?: number | undefined;
    purpose: IdentityTokenPurpose;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.prisma.$transaction(async (transaction) => {
      const owner = await lockCredentialOwner(transaction, input.userId);
      if (
        input.expectedAuthVersion !== undefined &&
        input.expectedAuthVersion !== owner.authVersion
      )
        throw AppError.invalidCredentials();
      await transaction.identityToken.updateMany({
        where: {
          userId: input.userId,
          purpose: input.purpose,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: input.createdAt },
      });
      await transaction.identityToken.create({
        data: {
          userId: input.userId,
          purpose: input.purpose,
          tokenHash: input.tokenHash,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
          authVersion: owner.authVersion,
        },
      });
    });
  }

  /** Supersedes every outstanding token of the same purpose, so only the newest one can be used. */
  public async invalidateOutstanding(
    userId: string,
    purpose: IdentityTokenPurpose,
    now: Date,
  ): Promise<void> {
    await this.database.prisma.identityToken.updateMany({
      where: { userId, purpose, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
  }

  /** Purpose-locked lookup: a token issued for one flow can never be replayed into another. */
  public async findUsableByHash(
    tokenHash: string,
    purpose: IdentityTokenPurpose,
    now: Date,
  ): Promise<IdentityTokenRecord | null> {
    return this.database.prisma.identityToken.findFirst({
      where: {
        tokenHash,
        purpose,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: now },
      },
      select: TOKEN_SELECT,
    });
  }

  public async consume(id: string, now: Date): Promise<boolean> {
    return this.database.prisma.$transaction(async (transaction) => {
      const token = await transaction.identityToken.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (token === null) return false;
      const owner = await lockCredentialOwner(transaction, token.userId);
      const result = await transaction.identityToken.updateMany({
        where: {
          id,
          authVersion: owner.authVersion,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: now },
      });
      return result.count === 1;
    });
  }
}
