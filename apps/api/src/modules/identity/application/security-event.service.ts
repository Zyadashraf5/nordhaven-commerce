import { Injectable, Logger } from '@nestjs/common';
import {
  SecurityEventRepository,
  type SecurityEventInput,
} from '../persistence/security-event.repository';

/**
 * Emits every security-relevant fact to the structured log and to the durable audit table.
 *
 * A persistence failure is caught, logged without sensitive fields, and never changes the
 * authentication or authorization outcome.
 */
@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  public constructor(private readonly repository: SecurityEventRepository) {}

  public async record(input: SecurityEventInput): Promise<void> {
    this.logger.log({
      event: 'security_event',
      securityEventType: input.eventType,
      outcome: input.outcome,
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      detail: input.detail,
    });

    try {
      await this.repository.insert(input);
    } catch (error: unknown) {
      this.logger.error({
        event: 'security_event_persist_failed',
        securityEventType: input.eventType,
        correlationId: input.correlationId,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
  }
}
