import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import type { PrincipalRole } from '../../../platform/security/principal';

export type SecurityEventType =
  | 'USER_REGISTERED'
  | 'REGISTRATION_REJECTED'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'MFA_ENROLLMENT_STARTED'
  | 'MFA_ENROLLED'
  | 'MFA_VERIFIED'
  | 'MFA_VERIFICATION_FAILED'
  | 'RECOVERY_CODE_USED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PASSWORD_CHANGED'
  | 'SESSION_REVOKED'
  | 'SESSIONS_REVOKED'
  | 'SESSION_REJECTED'
  | 'ADMIN_ACCESS_DENIED'
  | 'ADMIN_ACCESS_GRANTED'
  | 'NOTIFICATION_DELIVERY_SKIPPED';

export type SecurityEventOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

/** Closed detail shape: primitives only, so no nested structure can smuggle secret material. */
export type SecurityEventDetail = Readonly<Record<string, string | number | boolean>>;

export interface SecurityEventInput {
  readonly eventType: SecurityEventType;
  readonly outcome: SecurityEventOutcome;
  readonly correlationId: string;
  readonly actorUserId?: string;
  readonly actorRole?: PrincipalRole;
  readonly detail?: SecurityEventDetail;
}

export interface SecurityEventRecord {
  readonly id: string;
  readonly eventType: SecurityEventType;
  readonly outcome: SecurityEventOutcome;
  readonly actorUserId: string | null;
  readonly actorRole: PrincipalRole | null;
  readonly correlationId: string;
  readonly detail: unknown;
  readonly createdAt: Date;
}

const EVENT_SELECT = {
  id: true,
  eventType: true,
  outcome: true,
  actorUserId: true,
  actorRole: true,
  correlationId: true,
  detail: true,
  createdAt: true,
} as const;

@Injectable()
export class SecurityEventRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async insert(event: SecurityEventInput): Promise<void> {
    await this.database.prisma.securityEvent.create({
      data: {
        eventType: event.eventType,
        outcome: event.outcome,
        correlationId: event.correlationId,
        ...(event.actorUserId === undefined ? {} : { actorUserId: event.actorUserId }),
        ...(event.actorRole === undefined ? {} : { actorRole: event.actorRole }),
        ...(event.detail === undefined ? {} : { detail: { ...event.detail } }),
      },
    });
  }

  public async listRecent(limit: number): Promise<readonly SecurityEventRecord[]> {
    return this.database.prisma.securityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: EVENT_SELECT,
    });
  }

  public async deleteAllForUser(userId: string): Promise<void> {
    await this.database.prisma.securityEvent.deleteMany({ where: { actorUserId: userId } });
  }
}
