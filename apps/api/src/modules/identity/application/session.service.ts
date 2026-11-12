import { Inject, Injectable } from '@nestjs/common';
import {
  ENVIRONMENT_CONFIGURATION,
  type EnvironmentConfiguration,
} from '../../../platform/config/environment';
import { AppError } from '../../../platform/http/app-error';
import type {
  AuthenticatedPrincipal,
  SessionAuthenticationContext,
  SessionAuthenticator,
} from '../../../platform/security/principal';
import { generateToken, hashToken } from '../crypto/token';
import { SessionRepository, type SessionRevocationReason } from '../persistence/session.repository';
import { SecurityEventService } from './security-event.service';

/** A session's last-use timestamp is refreshed at most this often to bound write load. */
const TOUCH_INTERVAL_MS = 60_000;

export interface IssuedSession {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export interface SessionView {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
  readonly clientLabel: string | null;
  readonly current: boolean;
}

@Injectable()
export class SessionService implements SessionAuthenticator {
  public constructor(
    private readonly sessions: SessionRepository,
    private readonly securityEvents: SecurityEventService,
    @Inject(ENVIRONMENT_CONFIGURATION) private readonly configuration: EnvironmentConfiguration,
  ) {}

  public async issue(
    userId: string,
    clientLabel: string | null,
    now: Date,
    expectedAuthVersion?: number,
  ): Promise<IssuedSession> {
    const token = generateToken();
    const expiresAt = new Date(
      now.getTime() + this.configuration.authSessionAbsoluteTtlSeconds * 1000,
    );
    const session = await this.sessions.create({
      userId,
      ...(expectedAuthVersion === undefined ? {} : { expectedAuthVersion }),
      tokenHash: hashToken(token),
      clientLabel,
      createdAt: now,
      expiresAt,
    });
    return { token, sessionId: session.id, expiresAt: session.expiresAt };
  }

  /**
   * Resolves a presented credential. Any unusable session (unknown, revoked, idle-expired, or
   * absolutely expired) returns `null`, which the guard reports as `401 UNAUTHENTICATED` without
   * distinguishing the cause to the caller.
   */
  public async authenticate(
    credential: string,
    context: SessionAuthenticationContext,
  ): Promise<AuthenticatedPrincipal | null> {
    const session = await this.sessions.findByTokenHashWithOwner(hashToken(credential));
    if (session === null) return null;

    const now = new Date();
    const idleDeadlineMs =
      session.lastUsedAt.getTime() + this.configuration.authSessionIdleTtlSeconds * 1000;
    const unusable =
      session.authVersion !== session.ownerAuthVersion ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime() ||
      idleDeadlineMs <= now.getTime();

    if (unusable) {
      await this.securityEvents.record({
        eventType: 'SESSION_REJECTED',
        outcome: 'FAILURE',
        correlationId: context.correlationId,
        actorUserId: session.ownerId,
        actorRole: session.ownerRole,
        detail: {
          reason: session.revokedAt !== null ? 'revoked' : 'expired',
        },
      });
      return null;
    }

    if (now.getTime() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.sessions.touch(session.id, now);
    }

    return {
      userId: session.ownerId,
      role: session.ownerRole,
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt,
    };
  }

  public async list(
    userId: string,
    currentSessionId: string,
    now: Date,
  ): Promise<readonly SessionView[]> {
    const idleTtlMs = this.configuration.authSessionIdleTtlSeconds * 1000;
    const sessions = await this.sessions.listForUser(userId, now);
    return sessions
      .filter((session) => session.lastUsedAt.getTime() + idleTtlMs > now.getTime())
      .map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        clientLabel: session.clientLabel,
        current: session.id === currentSessionId,
      }));
  }

  public async revoke(
    sessionId: string,
    reason: SessionRevocationReason,
    now: Date,
  ): Promise<void> {
    await this.sessions.revoke(sessionId, reason, now);
  }

  /** Describes one session of the principal, or `null` when it is no longer usable. */
  public async describe(sessionId: string, userId: string, now: Date): Promise<SessionView | null> {
    const record = await this.sessions.findOwnedById(sessionId, userId);
    if (
      record === null ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }
    const idleDeadlineMs =
      record.lastUsedAt.getTime() + this.configuration.authSessionIdleTtlSeconds * 1000;
    if (idleDeadlineMs <= now.getTime()) return null;
    return {
      id: record.id,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      expiresAt: record.expiresAt,
      clientLabel: record.clientLabel,
      current: true,
    };
  }

  /** Signs out the presented session only. */
  public async revokeCurrent(
    principal: AuthenticatedPrincipal,
    correlationId: string,
  ): Promise<void> {
    const now = new Date();
    await this.sessions.revoke(principal.sessionId, 'logout', now);
    await this.securityEvents.record({
      eventType: 'SESSION_REVOKED',
      outcome: 'SUCCESS',
      actorUserId: principal.userId,
      actorRole: principal.role,
      correlationId,
      detail: { scope: 'current' },
    });
  }

  /** Signs out everywhere, including the presented session. */
  public async revokeAllOwn(
    principal: AuthenticatedPrincipal,
    correlationId: string,
  ): Promise<number> {
    const now = new Date();
    const revokedCount = await this.sessions.revokeAllForUser(principal.userId, 'logout_all', now);
    await this.securityEvents.record({
      eventType: 'SESSIONS_REVOKED',
      outcome: 'SUCCESS',
      actorUserId: principal.userId,
      actorRole: principal.role,
      correlationId,
      detail: { revokedCount },
    });
    return revokedCount;
  }

  /** Revokes one session owned by the principal; a foreign identifier is reported as not found. */
  public async revokeOwned(
    sessionId: string,
    principal: AuthenticatedPrincipal,
    correlationId: string,
  ): Promise<void> {
    const owned = await this.sessions.findOwnedById(sessionId, principal.userId);
    if (owned === null) throw AppError.sessionNotFound();

    const now = new Date();
    await this.sessions.revoke(owned.id, 'logout', now);
    await this.securityEvents.record({
      eventType: 'SESSION_REVOKED',
      outcome: 'SUCCESS',
      actorUserId: principal.userId,
      actorRole: principal.role,
      correlationId,
      detail: { scope: 'single' },
    });
  }

  public revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    now: Date,
    exceptSessionId?: string,
  ): Promise<number> {
    return this.sessions.revokeAllForUser(userId, reason, now, exceptSessionId);
  }
}
