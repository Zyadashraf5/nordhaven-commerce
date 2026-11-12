import type { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../platform/http/app-error';
import { lockCredentialOwner } from './credential-lock';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';

export interface MfaCredentialRecord {
  readonly secretCiphertext: string;
  readonly confirmedAt: Date | null;
  readonly lastAcceptedStep: number | null;
}

export interface RecoveryCodeRecord {
  readonly id: string;
  readonly usedAt: Date | null;
}

@Injectable()
export class MfaRepository {
  public constructor(private readonly database: DatabaseService) {}

  /** Creates or restarts enrollment: an unconfirmed credential with a freshly generated secret. */
  public async upsertPendingSecret(
    userId: string,
    secretCiphertext: string,
    now: Date,
  ): Promise<void> {
    await this.database.prisma.$transaction(async (transaction) => {
      await lockCredentialOwner(transaction, userId);
      const current = await transaction.adminMfaCredential.findUnique({
        where: { userId },
        select: { confirmedAt: true },
      });
      if (current?.confirmedAt != null) throw AppError.mfaAlreadyEnrolled();
      await transaction.adminMfaCredential.upsert({
        where: { userId },
        create: { userId, secretCiphertext, createdAt: now },
        update: { secretCiphertext, confirmedAt: null, lastAcceptedStep: null },
      });
    });
  }

  public async findCredential(userId: string): Promise<MfaCredentialRecord | null> {
    return this.database.prisma.adminMfaCredential.findUnique({
      where: { userId },
      select: { secretCiphertext: true, confirmedAt: true, lastAcceptedStep: true },
    });
  }

  public async confirm(userId: string, now: Date): Promise<void> {
    await this.database.prisma.adminMfaCredential.update({
      where: { userId },
      data: { confirmedAt: now },
    });
  }

  public async recordAcceptedStep(userId: string, timeStep: number): Promise<void> {
    await this.database.prisma.adminMfaCredential.update({
      where: { userId },
      data: { lastAcceptedStep: timeStep },
    });
  }

  public async replaceRecoveryCodes(
    userId: string,
    codeHashes: readonly string[],
    now: Date,
  ): Promise<void> {
    await this.database.prisma.$transaction([
      this.database.prisma.adminMfaRecoveryCode.deleteMany({ where: { userId } }),
      this.database.prisma.adminMfaRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash, createdAt: now })),
      }),
    ]);
  }

  public async findRecoveryCodeByHash(
    userId: string,
    codeHash: string,
  ): Promise<RecoveryCodeRecord | null> {
    return this.database.prisma.adminMfaRecoveryCode.findFirst({
      where: { userId, codeHash },
      select: { id: true, usedAt: true },
    });
  }

  public async consumeRecoveryCode(id: string, now: Date): Promise<boolean> {
    const result = await this.database.prisma.adminMfaRecoveryCode.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: now },
    });
    return result.count > 0;
  }
  private async consumeChallenge(
    transaction: Prisma.TransactionClient,
    userId: string,
    challengeId: string,
    purpose: 'MFA_ENROLLMENT' | 'MFA_VERIFICATION',
    authVersion: number,
    now: Date,
  ): Promise<void> {
    const claimed = await transaction.identityToken.updateMany({
      where: {
        id: challengeId,
        userId,
        purpose,
        authVersion,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) throw AppError.invalidChallenge();
  }

  public async confirmEnrollmentWithin(input: {
    userId: string;
    challengeId: string;
    secretCiphertext: string;
    timeStep: number;
    codeHashes: readonly string[];
    now: Date;
  }): Promise<void> {
    await this.database.prisma.$transaction(async (transaction) => {
      const owner = await lockCredentialOwner(transaction, input.userId);
      await this.consumeChallenge(
        transaction,
        input.userId,
        input.challengeId,
        'MFA_ENROLLMENT',
        owner.authVersion,
        input.now,
      );
      const confirmed = await transaction.adminMfaCredential.updateMany({
        where: {
          userId: input.userId,
          secretCiphertext: input.secretCiphertext,
          confirmedAt: null,
          OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: input.timeStep } }],
        },
        data: { confirmedAt: input.now, lastAcceptedStep: input.timeStep },
      });
      if (confirmed.count !== 1) throw AppError.invalidMfaCode();
      await transaction.adminMfaRecoveryCode.deleteMany({ where: { userId: input.userId } });
      await transaction.adminMfaRecoveryCode.createMany({
        data: input.codeHashes.map((codeHash) => ({
          userId: input.userId,
          codeHash,
          createdAt: input.now,
        })),
      });
    });
  }

  public async completeVerificationWithin(input: {
    userId: string;
    challengeId: string;
    secretCiphertext: string;
    timeStep?: number | undefined;
    recoveryCodeId?: string | undefined;
    now: Date;
    sessionHash: string;
    sessionExpiresAt: Date;
    clientLabel: string | null;
  }): Promise<{ id: string; expiresAt: Date }> {
    return this.database.prisma.$transaction(async (transaction) => {
      const owner = await lockCredentialOwner(transaction, input.userId);
      await this.consumeChallenge(
        transaction,
        input.userId,
        input.challengeId,
        'MFA_VERIFICATION',
        owner.authVersion,
        input.now,
      );
      const credential = await transaction.adminMfaCredential.findUnique({
        where: { userId: input.userId },
      });
      if (credential?.confirmedAt == null || credential.secretCiphertext !== input.secretCiphertext)
        throw AppError.invalidChallenge();
      if (input.timeStep !== undefined) {
        const claimed = await transaction.adminMfaCredential.updateMany({
          where: {
            userId: input.userId,
            OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: input.timeStep } }],
          },
          data: { lastAcceptedStep: input.timeStep },
        });
        if (claimed.count !== 1) throw AppError.invalidMfaCode();
      } else if (input.recoveryCodeId !== undefined) {
        const used = await transaction.adminMfaRecoveryCode.updateMany({
          where: { id: input.recoveryCodeId, userId: input.userId, usedAt: null },
          data: { usedAt: input.now },
        });
        if (used.count !== 1) throw AppError.invalidMfaCode();
      } else {
        throw AppError.invalidMfaCode();
      }
      return transaction.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.sessionHash,
          authVersion: owner.authVersion,
          clientLabel: input.clientLabel,
          createdAt: input.now,
          lastUsedAt: input.now,
          expiresAt: input.sessionExpiresAt,
        },
        select: { id: true, expiresAt: true },
      });
    });
  }
}
