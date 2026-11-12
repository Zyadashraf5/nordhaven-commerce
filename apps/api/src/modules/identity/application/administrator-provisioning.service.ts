import { Injectable } from '@nestjs/common';
import { hashPassword } from '../crypto/password-hasher';
import { isUniqueConstraintViolation } from '../persistence/prisma-errors';
import { UserRepository, type UserAccountSummary } from '../persistence/user.repository';
import { assertPasswordPolicy, normalizeEmail, toAccountSummary } from './identity.support';
import { SecurityEventService } from './security-event.service';

export interface ProvisioningInput {
  readonly email: string;
  readonly password: string;
  readonly correlationId: string;
}

/**
 * The only supported way to create an administrator account.
 *
 * There is deliberately no HTTP path or self-service flow that can grant the administrator role.
 * The guard-protected operational script calls this service directly, and the provisioning attempt
 * is recorded as a durable security event.
 */
@Injectable()
export class AdministratorProvisioningService {
  public constructor(
    private readonly users: UserRepository,
    private readonly securityEvents: SecurityEventService,
  ) {}

  public async provision(input: ProvisioningInput): Promise<UserAccountSummary> {
    const email = normalizeEmail(input.email);
    assertPasswordPolicy(input.password, email);

    const existing = await this.users.findByEmail(email);
    if (existing !== null) {
      throw new Error('An account already exists for the supplied email address');
    }

    const passwordHash = await hashPassword(input.password);
    let created;
    try {
      created = await this.users.create({ email, passwordHash, role: 'ADMIN' });
    } catch (error: unknown) {
      if (isUniqueConstraintViolation(error)) {
        throw new Error('An account already exists for the supplied email address');
      }
      throw error;
    }

    await this.securityEvents.record({
      eventType: 'USER_REGISTERED',
      outcome: 'SUCCESS',
      actorUserId: created.id,
      actorRole: 'ADMIN',
      correlationId: input.correlationId,
      detail: { role: 'ADMIN', source: 'provisioning' },
    });

    return toAccountSummary(created);
  }
}
