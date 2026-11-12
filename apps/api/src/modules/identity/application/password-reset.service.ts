import { Inject, Injectable } from '@nestjs/common';
import {
  ENVIRONMENT_CONFIGURATION,
  type EnvironmentConfiguration,
} from '../../../platform/config/environment';
import { AppError } from '../../../platform/http/app-error';
import { hashPassword } from '../crypto/password-hasher';
import { generateToken, hashToken } from '../crypto/token';
import { IdentityTokenRepository } from '../persistence/identity-token.repository';
import { UserRepository } from '../persistence/user.repository';
import { NOTIFICATION_PORT, type NotificationPort } from './notification/notification.port';
import { assertPasswordPolicy, normalizeEmail } from './identity.support';
import { SecurityEventService } from './security-event.service';
import { SessionService } from './session.service';

export interface ResetRequestInput {
  readonly email: string;
  readonly correlationId: string;
}

export interface ResetCompletionInput {
  readonly token: string;
  readonly newPassword: string;
  readonly correlationId: string;
}

/**
 * Secure password recovery.
 *
 * A request answers identically whether or not the address is registered. The recovery token is
 * single-use, purpose-bound, expiring, stored only as a digest, and re-issue supersedes every
 * outstanding token. Delivery happens through the notification boundary, which currently has no
 * production transport (HC-DEC-014), so the skip is recorded rather than silently ignored.
 */
@Injectable()
export class PasswordResetService {
  public constructor(
    private readonly users: UserRepository,
    private readonly tokens: IdentityTokenRepository,
    private readonly sessions: SessionService,
    private readonly securityEvents: SecurityEventService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(ENVIRONMENT_CONFIGURATION) private readonly configuration: EnvironmentConfiguration,
  ) {}

  public async requestReset(input: ResetRequestInput): Promise<void> {
    const email = normalizeEmail(input.email);
    const now = new Date();
    const user = await this.users.findByEmail(email);

    if (user === null) {
      await this.securityEvents.record({
        eventType: 'PASSWORD_RESET_REQUESTED',
        outcome: 'SUCCESS',
        correlationId: input.correlationId,
        detail: { matched: false },
      });
      return;
    }

    const token = generateToken();
    const expiresAt = new Date(
      now.getTime() + this.configuration.authPasswordResetTtlSeconds * 1000,
    );
    await this.tokens.create({
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
    });

    const delivery = await this.notifications.deliver({
      kind: 'PASSWORD_RESET',
      recipient: user.email,
      subject: 'Reset your Nordhaven Commerce password',
      body: `Use this single-use recovery token to choose a new password: ${token}`,
      expiresAt,
    });

    await this.securityEvents.record({
      eventType: 'PASSWORD_RESET_REQUESTED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: user.role,
      correlationId: input.correlationId,
      detail: { matched: true, delivered: delivery.delivered, transport: delivery.transport },
    });

    if (!delivery.delivered) {
      await this.securityEvents.record({
        eventType: 'NOTIFICATION_DELIVERY_SKIPPED',
        outcome: 'FAILURE',
        actorUserId: user.id,
        actorRole: user.role,
        correlationId: input.correlationId,
        detail: { kind: 'PASSWORD_RESET', transport: delivery.transport },
      });
    }
  }

  public async completeReset(input: ResetCompletionInput): Promise<void> {
    const now = new Date();
    const record = await this.tokens.findUsableByHash(
      hashToken(input.token),
      'PASSWORD_RESET',
      now,
    );

    if (record === null) {
      await this.securityEvents.record({
        eventType: 'PASSWORD_RESET_COMPLETED',
        outcome: 'FAILURE',
        correlationId: input.correlationId,
        detail: { reason: 'invalid_token' },
      });
      throw AppError.invalidRecoveryToken();
    }

    const user = await this.users.findById(record.userId);
    if (user === null) throw AppError.invalidRecoveryToken();

    // Policy is validated before consumption so a rejected password does not burn the token.
    assertPasswordPolicy(input.newPassword, user.email);

    const passwordHash = await hashPassword(input.newPassword);
    await this.users.updatePassword(
      user.id,
      passwordHash,
      now,
      undefined,
      record.authVersion,
      record.id,
    );
    await this.securityEvents.record({
      eventType: 'PASSWORD_RESET_COMPLETED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: user.role,
      correlationId: input.correlationId,
    });
  }
}
