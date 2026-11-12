import { Injectable } from '@nestjs/common';
import type {
  AuthorizationAuditInput,
  AuthorizationAuditPort,
} from '../../../platform/security/authorization-audit.port';
import { SecurityEventService } from './security-event.service';

/** Persists authorization decisions as durable security events. */
@Injectable()
export class IdentityAuthorizationAudit implements AuthorizationAuditPort {
  public constructor(private readonly securityEvents: SecurityEventService) {}

  public async record(input: AuthorizationAuditInput): Promise<void> {
    const granted = input.outcome === 'GRANTED';
    await this.securityEvents.record({
      eventType: granted ? 'ADMIN_ACCESS_GRANTED' : 'ADMIN_ACCESS_DENIED',
      outcome: granted ? 'SUCCESS' : 'DENIED',
      correlationId: input.correlationId,
      ...(input.principal === undefined
        ? {}
        : { actorUserId: input.principal.userId, actorRole: input.principal.role }),
      detail: { permission: input.permission },
    });
  }
}
