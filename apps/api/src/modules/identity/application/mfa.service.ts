import { Inject, Injectable } from '@nestjs/common';
import {
  ENVIRONMENT_CONFIGURATION,
  type EnvironmentConfiguration,
} from '../../../platform/config/environment';
import { AppError } from '../../../platform/http/app-error';
import {
  generateRecoveryCode,
  generateToken,
  hashToken,
  normalizeRecoveryCode,
} from '../crypto/token';
import { SecretCipher } from '../crypto/secret-cipher';
import { generateSharedSecret, TOTP_DEFAULTS, verifyTotpCode } from '../crypto/totp';
import { IdentityTokenRepository } from '../persistence/identity-token.repository';
import { MfaRepository } from '../persistence/mfa.repository';
import { UserRepository, type UserAccountSummary } from '../persistence/user.repository';
import { addSeconds, toAccountSummary } from './identity.support';
import { SecurityEventService } from './security-event.service';
import { type IssuedSession } from './session.service';

const ENROLLMENT_TTL_SECONDS = 900;
const VERIFICATION_TTL_SECONDS = 300;
const RECOVERY_CODE_COUNT = 10;

export type AdministrativeMfaState = 'NOT_ENROLLED' | 'PENDING_CONFIRMATION' | 'ENROLLED';
export type ChallengePurpose = 'MFA_ENROLLMENT' | 'MFA_VERIFICATION';

export interface MfaChallenge {
  readonly token: string;
  readonly purpose: ChallengePurpose;
  readonly expiresAt: Date;
}

export interface EnrollmentDetails {
  readonly secret: string;
  readonly otpauthUri: string;
  readonly issuer: string;
  readonly algorithm: 'SHA1';
  readonly digits: number;
  readonly periodSeconds: number;
  readonly expiresAt: Date;
}

export interface EnrollmentConfirmation {
  readonly recoveryCodes: readonly string[];
  readonly confirmedAt: Date;
}

export interface VerificationOutcome {
  readonly session: IssuedSession;
  readonly user: UserAccountSummary;
}

export interface VerificationInput {
  readonly challengeToken: string;
  readonly code?: string;
  readonly recoveryCode?: string;
  readonly clientLabel: string | null;
  readonly correlationId: string;
}

function buildOtpAuthUri(input: {
  readonly issuer: string;
  readonly account: string;
  readonly secret: string;
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const parameters = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DEFAULTS.digits),
    period: String(TOTP_DEFAULTS.periodSeconds),
  });
  return `otpauth://totp/${label}?${parameters.toString()}`;
}

/**
 * Administrator multi-factor authentication (RFC 6238 TOTP) plus single-use recovery codes.
 *
 * Enrollment and sign-in both start from a purpose-bound, single-use challenge token, so no
 * authentication material is ever derived from a client-supplied identifier.
 */
@Injectable()
export class MfaService {
  private readonly cipher: SecretCipher;

  public constructor(
    private readonly users: UserRepository,
    private readonly mfa: MfaRepository,
    private readonly tokens: IdentityTokenRepository,
    private readonly securityEvents: SecurityEventService,
    @Inject(ENVIRONMENT_CONFIGURATION) private readonly configuration: EnvironmentConfiguration,
  ) {
    this.cipher = new SecretCipher(configuration.authEncryptionKey);
  }

  public async administrativeState(userId: string): Promise<AdministrativeMfaState> {
    const credential = await this.mfa.findCredential(userId);
    if (credential === null) return 'NOT_ENROLLED';
    return credential.confirmedAt === null ? 'PENDING_CONFIRMATION' : 'ENROLLED';
  }

  public async startEnrollment(
    userId: string,
    correlationId: string,
    expectedAuthVersion?: number,
  ): Promise<MfaChallenge> {
    const now = new Date();
    const token = generateToken();
    const expiresAt = addSeconds(now, ENROLLMENT_TTL_SECONDS);
    await this.tokens.create({
      userId,
      purpose: 'MFA_ENROLLMENT',
      expectedAuthVersion,
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
    });
    await this.securityEvents.record({
      eventType: 'MFA_ENROLLMENT_STARTED',
      outcome: 'SUCCESS',
      actorUserId: userId,
      actorRole: 'ADMIN',
      correlationId,
    });
    return { token, purpose: 'MFA_ENROLLMENT', expiresAt };
  }

  /** Attaches freshly generated shared secret material to an in-progress enrollment. */
  public async beginEnrollment(
    challengeToken: string,
    correlationId: string,
  ): Promise<EnrollmentDetails> {
    const now = new Date();
    const challenge = await this.tokens.findUsableByHash(
      hashToken(challengeToken),
      'MFA_ENROLLMENT',
      now,
    );
    if (challenge === null) throw AppError.invalidChallenge();

    const user = await this.users.findById(challenge.userId);
    if (user === null || user.role !== 'ADMIN') throw AppError.invalidChallenge();

    const credential = await this.mfa.findCredential(user.id);
    if (credential !== null && credential.confirmedAt !== null) {
      throw AppError.mfaAlreadyEnrolled();
    }

    const secret = generateSharedSecret();
    await this.mfa.upsertPendingSecret(user.id, this.cipher.encrypt(secret), now);
    await this.securityEvents.record({
      eventType: 'MFA_ENROLLMENT_STARTED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: 'ADMIN',
      correlationId,
      detail: { phase: 'secret_issued' },
    });

    return {
      secret,
      otpauthUri: buildOtpAuthUri({
        issuer: this.configuration.authMfaIssuer,
        account: user.email,
        secret,
      }),
      issuer: this.configuration.authMfaIssuer,
      algorithm: TOTP_DEFAULTS.algorithm,
      digits: TOTP_DEFAULTS.digits,
      periodSeconds: TOTP_DEFAULTS.periodSeconds,
      expiresAt: challenge.expiresAt,
    };
  }

  public async confirmEnrollment(
    challengeToken: string,
    code: string,
    correlationId: string,
  ): Promise<EnrollmentConfirmation> {
    const now = new Date();
    const challenge = await this.tokens.findUsableByHash(
      hashToken(challengeToken),
      'MFA_ENROLLMENT',
      now,
    );
    if (challenge === null) throw AppError.invalidChallenge();

    const user = await this.users.findById(challenge.userId);
    if (user === null || user.role !== 'ADMIN') throw AppError.invalidChallenge();

    const credential = await this.mfa.findCredential(user.id);
    if (credential === null) throw AppError.invalidChallenge();
    if (credential.confirmedAt !== null) throw AppError.mfaAlreadyEnrolled();

    const verification = verifyTotpCode(
      this.cipher.decrypt(credential.secretCiphertext),
      code,
      now.getTime(),
      { lastAcceptedStep: credential.lastAcceptedStep },
    );
    if (!verification.valid || verification.timeStep === undefined) {
      await this.securityEvents.record({
        eventType: 'MFA_VERIFICATION_FAILED',
        outcome: 'FAILURE',
        actorUserId: user.id,
        actorRole: 'ADMIN',
        correlationId,
        detail: { phase: 'enrollment' },
      });
      throw AppError.invalidMfaCode();
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    await this.mfa.confirmEnrollmentWithin({
      userId: user.id,
      challengeId: challenge.id,
      secretCiphertext: credential.secretCiphertext,
      timeStep: verification.timeStep,
      codeHashes: recoveryCodes.map(recoveryCodeHash),
      now,
    });

    await this.securityEvents.record({
      eventType: 'MFA_ENROLLED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: 'ADMIN',
      correlationId,
    });

    return { recoveryCodes, confirmedAt: now };
  }

  public async startVerification(
    userId: string,
    expectedAuthVersion?: number,
  ): Promise<MfaChallenge> {
    const credential = await this.mfa.findCredential(userId);
    if (credential === null || credential.confirmedAt === null) throw AppError.invalidChallenge();

    const now = new Date();
    const token = generateToken();
    const expiresAt = addSeconds(now, VERIFICATION_TTL_SECONDS);
    await this.tokens.create({
      userId,
      purpose: 'MFA_VERIFICATION',
      expectedAuthVersion,
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
    });
    return { token, purpose: 'MFA_VERIFICATION', expiresAt };
  }

  public async completeVerification(input: VerificationInput): Promise<VerificationOutcome> {
    const now = new Date();
    const challenge = await this.tokens.findUsableByHash(
      hashToken(input.challengeToken),
      'MFA_VERIFICATION',
      now,
    );
    if (challenge === null) throw AppError.invalidChallenge();

    const user = await this.users.findById(challenge.userId);
    if (user === null || user.role !== 'ADMIN') throw AppError.invalidChallenge();

    const credential = await this.mfa.findCredential(user.id);
    if (credential === null || credential.confirmedAt === null) throw AppError.invalidChallenge();

    let verified = false;
    let acceptedStep: number | undefined;
    let recoveryCodeId: string | undefined;
    if (input.code !== undefined) {
      const verification = verifyTotpCode(
        this.cipher.decrypt(credential.secretCiphertext),
        input.code,
        now.getTime(),
        { lastAcceptedStep: credential.lastAcceptedStep },
      );
      if (verification.valid && verification.timeStep !== undefined) {
        verified = true;
        acceptedStep = verification.timeStep;
      }
    } else if (input.recoveryCode !== undefined) {
      const record = await this.mfa.findRecoveryCodeByHash(
        user.id,
        hashToken(normalizeRecoveryCode(input.recoveryCode)),
      );
      if (record !== null && record.usedAt === null) {
        verified = true;
        recoveryCodeId = record.id;
      }
    }

    if (!verified) {
      await this.securityEvents.record({
        eventType: 'MFA_VERIFICATION_FAILED',
        outcome: 'FAILURE',
        actorUserId: user.id,
        actorRole: 'ADMIN',
        correlationId: input.correlationId,
        detail: { phase: 'sign_in' },
      });
      throw AppError.invalidMfaCode();
    }

    const token = generateToken();
    const persisted = await this.mfa.completeVerificationWithin({
      userId: user.id,
      challengeId: challenge.id,
      secretCiphertext: credential.secretCiphertext,
      timeStep: acceptedStep,
      recoveryCodeId,
      now,
      sessionHash: hashToken(token),
      sessionExpiresAt: addSeconds(now, this.configuration.authSessionAbsoluteTtlSeconds),
      clientLabel: input.clientLabel,
    });
    const session: IssuedSession = {
      token,
      sessionId: persisted.id,
      expiresAt: persisted.expiresAt,
    };
    if (recoveryCodeId !== undefined)
      await this.securityEvents.record({
        eventType: 'RECOVERY_CODE_USED',
        outcome: 'SUCCESS',
        actorUserId: user.id,
        actorRole: 'ADMIN',
        correlationId: input.correlationId,
      });
    await this.securityEvents.record({
      eventType: 'MFA_VERIFIED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: 'ADMIN',
      correlationId: input.correlationId,
      detail: { method: input.code === undefined ? 'recovery_code' : 'totp' },
    });
    await this.securityEvents.record({
      eventType: 'LOGIN_SUCCEEDED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: 'ADMIN',
      correlationId: input.correlationId,
      detail: { mfa: 'completed' },
    });

    return { session, user: toAccountSummary(user) };
  }
}

/** Recovery codes are stored only as a digest of their normalized form. */
export function recoveryCodeHash(code: string): string {
  return hashToken(normalizeRecoveryCode(code));
}
