import { Inject, Injectable } from '@nestjs/common';
import {
  ENVIRONMENT_CONFIGURATION,
  type EnvironmentConfiguration,
} from '../../../platform/config/environment';
import { AppError } from '../../../platform/http/app-error';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../crypto/password-hasher';
import { isUniqueConstraintViolation } from '../persistence/prisma-errors';
import {
  UserRepository,
  type UserAccountSummary,
  type UserRecord,
} from '../persistence/user.repository';
import { assertPasswordPolicy, normalizeEmail, toAccountSummary } from './identity.support';
import { MfaService, type MfaChallenge } from './mfa.service';
import { SecurityEventService } from './security-event.service';
import { SessionService, type SessionView } from './session.service';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export interface RegistrationInput {
  readonly email: string;
  readonly password: string;
  readonly correlationId: string;
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly clientLabel: string | null;
  readonly correlationId: string;
}

export type SignInResult =
  | {
      readonly status: 'AUTHENTICATED';
      readonly sessionToken: string;
      readonly sessionExpiresAt: Date;
      readonly user: UserAccountSummary;
    }
  | { readonly status: 'MFA_REQUIRED'; readonly challenge: MfaChallenge }
  | { readonly status: 'MFA_ENROLLMENT_REQUIRED'; readonly challenge: MfaChallenge };

export interface ChangePasswordInput {
  readonly userId: string;
  readonly currentSessionId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly correlationId: string;
}

export interface AccountPage {
  readonly users: readonly UserAccountSummary[];
  readonly nextCursor: string | null;
}

@Injectable()
export class IdentityService {
  public constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly securityEvents: SecurityEventService,
    @Inject(ENVIRONMENT_CONFIGURATION) private readonly configuration: EnvironmentConfiguration,
  ) {}

  public async register(input: RegistrationInput): Promise<UserAccountSummary> {
    const email = normalizeEmail(input.email);
    assertPasswordPolicy(input.password, email);

    const existing = await this.users.findByEmail(email);
    if (existing !== null) {
      await this.securityEvents.record({
        eventType: 'REGISTRATION_REJECTED',
        outcome: 'FAILURE',
        correlationId: input.correlationId,
        detail: { reason: 'already_registered' },
      });
      throw AppError.registrationNotAllowed();
    }

    const passwordHash = await hashPassword(input.password);
    let created: UserRecord;
    try {
      created = await this.users.create({ email, passwordHash, role: 'CUSTOMER' });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        await this.securityEvents.record({
          eventType: 'REGISTRATION_REJECTED',
          outcome: 'FAILURE',
          correlationId: input.correlationId,
          detail: { reason: 'already_registered' },
        });
        throw AppError.registrationNotAllowed();
      }
      throw error;
    }

    await this.securityEvents.record({
      eventType: 'USER_REGISTERED',
      outcome: 'SUCCESS',
      actorUserId: created.id,
      actorRole: created.role,
      correlationId: input.correlationId,
    });
    return toAccountSummary(created);
  }

  /**
   * Password verification step of sign-in.
   *
   * Unknown, locked, and wrong-password accounts all fail identically with
   * `401 INVALID_CREDENTIALS` after one password-cost derivation, so the response and its timing do
   * not reveal whether an account exists, is locked, or used the wrong password.
   */
  public async signIn(input: SignInInput): Promise<SignInResult> {
    const email = normalizeEmail(input.email);
    const now = new Date();
    const user = await this.users.findByEmail(email);
    const isLocked = user !== null && user.lockedUntil !== null && user.lockedUntil > now;

    if (user === null || isLocked) {
      await verifyDummyPassword(input.password);
      await this.securityEvents.record({
        eventType: 'LOGIN_FAILED',
        outcome: 'FAILURE',
        correlationId: input.correlationId,
        detail: { reason: user === null ? 'unknown_account' : 'locked' },
      });
      throw AppError.invalidCredentials();
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      const outcome = await this.users.registerFailedLogin(user.id, {
        maxAttempts: this.configuration.authMaxFailedAttempts,
        lockoutSeconds: this.configuration.authLockoutSeconds,
        now,
      });
      await this.securityEvents.record({
        eventType: 'LOGIN_FAILED',
        outcome: 'FAILURE',
        actorUserId: user.id,
        actorRole: user.role,
        correlationId: input.correlationId,
        detail: { failedAttempts: outcome.failedLoginAttempts },
      });
      if (outcome.lockedUntil !== null) {
        await this.securityEvents.record({
          eventType: 'ACCOUNT_LOCKED',
          outcome: 'FAILURE',
          actorUserId: user.id,
          actorRole: user.role,
          correlationId: input.correlationId,
          detail: { lockoutSeconds: this.configuration.authLockoutSeconds },
        });
      }
      throw AppError.invalidCredentials();
    }

    await this.users.clearFailedLogins(user.id);

    if (user.role === 'ADMIN') {
      const state = await this.mfa.administrativeState(user.id);
      if (state === 'ENROLLED') {
        return {
          status: 'MFA_REQUIRED',
          challenge: await this.mfa.startVerification(user.id, user.authVersion),
        };
      }
      return {
        status: 'MFA_ENROLLMENT_REQUIRED',
        challenge: await this.mfa.startEnrollment(user.id, input.correlationId, user.authVersion),
      };
    }

    const session = await this.sessions.issue(user.id, input.clientLabel, now, user.authVersion);
    await this.securityEvents.record({
      eventType: 'LOGIN_SUCCEEDED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: user.role,
      correlationId: input.correlationId,
    });
    return {
      status: 'AUTHENTICATED',
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      user: toAccountSummary(user),
    };
  }

  /**
   * Authenticated password change. Requires reauthentication with the current password and revokes
   * every other session of the account.
   */
  public async changePassword(
    principal: AuthenticatedPrincipal,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await this.users.findById(principal.userId);
    if (user === null) throw AppError.unauthenticated();

    const matches = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!matches) {
      await this.securityEvents.record({
        eventType: 'LOGIN_FAILED',
        outcome: 'FAILURE',
        actorUserId: user.id,
        actorRole: user.role,
        correlationId: input.correlationId,
        detail: { context: 'password_change' },
      });
      throw AppError.invalidCredentials();
    }

    assertPasswordPolicy(input.newPassword, user.email);

    const now = new Date();
    await this.users.updatePassword(
      user.id,
      await hashPassword(input.newPassword),
      now,
      input.currentSessionId,
      user.authVersion,
    );
    await this.securityEvents.record({
      eventType: 'PASSWORD_CHANGED',
      outcome: 'SUCCESS',
      actorUserId: user.id,
      actorRole: user.role,
      correlationId: input.correlationId,
    });
  }

  public async listAccounts(
    principal: AuthenticatedPrincipal,
    query: { readonly limit?: number; readonly cursor?: string },
  ): Promise<AccountPage> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = await this.users.listPage(limit, query.cursor);
    return { users: page.users, nextCursor: page.nextCursor };
  }

  /** Principal projection used by `GET /auth/principal`. */
  public async describePrincipal(
    principal: AuthenticatedPrincipal,
  ): Promise<{ readonly user: UserAccountSummary; readonly session: SessionView }> {
    const now = new Date();
    const [user, session] = await Promise.all([
      this.users.findById(principal.userId),
      this.sessions.describe(principal.sessionId, principal.userId, now),
    ]);
    if (user === null || session === null) throw AppError.unauthenticated();
    return { user: toAccountSummary(user), session };
  }
}
