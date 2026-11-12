import { Injectable } from '@nestjs/common';
import { SecurityEventRepository } from '../persistence/security-event.repository';
import { UserRepository } from '../persistence/user.repository';
import type { AccountSummary, IdentityAudit, SecurityEventSummary } from '../contracts';

/**
 * The Identity capability's administrative contract.
 *
 * The service is a thin adapter over the Identity capability's own repositories: the account list
 * and the security trail have one owner, and the administrative surface reads them through the
 * published contract rather than through another capability's tables.
 */
@Injectable()
export class IdentityAuditService implements IdentityAudit {
  public constructor(
    private readonly users: UserRepository,
    private readonly securityEvents: SecurityEventRepository,
  ) {}

  public async listAccounts(limit: number): Promise<readonly AccountSummary[]> {
    const page = await this.users.listPage(limit);
    return page.users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }));
  }

  public async recentSecurityEvents(limit: number): Promise<readonly SecurityEventSummary[]> {
    const events = await this.securityEvents.listRecent(limit);
    return events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      outcome: event.outcome,
      actorUserId: event.actorUserId,
      actorRole: event.actorRole,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    }));
  }
  public async countAccounts(): Promise<number> {
    return this.users.countAccounts();
  }
  public async accountIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]> {
    return this.users.accountIdsAfter(cursor, limit);
  }
  public async accountsForIds(ids: readonly string[]): Promise<readonly AccountSummary[]> {
    return this.users.accountFactsForIds(ids);
  }
}
