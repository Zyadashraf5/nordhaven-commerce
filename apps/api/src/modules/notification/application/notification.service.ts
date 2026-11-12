import { DatabaseService } from '../../../platform/database/database.service';
import { Prisma } from '../../../generated/prisma/client';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import {
  NOTIFICATION_PROVIDER,
  type NotificationOutcome,
  type CustomerNotificationKind,
  type NotificationProvider,
  type NotificationRequest,
  type NotificationSender,
} from '../contracts';
import {
  NotificationRepository,
  type NotificationRecord,
} from '../persistence/notification.repository';

/**
 * The notification delivery.
 *
 * The service owns the rules; the repository owns the persistence. Every message is **recorded**
 * before it is delivered, so the platform knows what it would have sent even when the channel sends
 * nothing, and a repeated request with the same business key produces the same notification and
 * therefore one delivery.
 */
@Injectable()
export class NotificationService implements NotificationSender {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly database: DatabaseService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  public async notify(request: NotificationRequest): Promise<NotificationOutcome> {
    const result = await this.enqueue(request);
    if (this.database.inTransaction) {
      this.database.afterCommit(async () => {
        try {
          await this.dispatch(result.notificationId);
        } catch {
          /* Persisted pending/failed intent remains available for administrative retry. */
        }
      });
      return result;
    }
    return this.dispatch(result.notificationId);
  }

  public async enqueue(request: NotificationRequest): Promise<NotificationOutcome> {
    const metadata = JSON.parse(JSON.stringify(request.metadata ?? {})) as Prisma.InputJsonValue;
    return this.database.transaction(async () => {
      await this.database.lock('notification-key:' + request.idempotencyKey);
      const existing = await this.notifications.findByIdempotencyKey(request.idempotencyKey);
      if (existing !== null) {
        if (
          existing.kind !== request.kind ||
          existing.recipientUserId !== request.recipientUserId ||
          existing.subject !== request.subject ||
          existing.body !== request.body ||
          canonical(existing.metadata) !== canonical(metadata)
        )
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            details: [
              {
                path: 'Idempotency-Key',
                message: 'Key belongs to a different notification intent',
              },
            ],
          });
        return outcome(existing);
      }
      return outcome(await this.notifications.create({ ...request, metadata }));
    });
  }

  public async dispatch(
    notificationId: string,
    actorUserId: string | null = null,
  ): Promise<NotificationOutcome> {
    if (this.database.inTransaction)
      throw new Error('Notification delivery requires committed intent');
    const record = await this.notifications.findById(notificationId);
    if (record === null) throw AppError.notificationNotFound();
    if (record.status === 'DELIVERED' || record.status === 'SKIPPED') return outcome(record);
    const claimToken = await this.notifications.claimDelivery(notificationId);
    if (claimToken === null) {
      const current = await this.notifications.findById(notificationId);
      if (current === null) throw AppError.notificationNotFound();
      return outcome(current);
    }
    const base = { notificationId, claimToken, provider: this.provider.name, actorUserId };
    if (!this.provider.isAvailable())
      return outcome(
        await this.notifications.recordDelivery({
          ...base,
          delivered: false,
          providerReference: null,
          failureReason: 'PROVIDER_UNAVAILABLE',
          status: 'SKIPPED',
        }),
      );
    let result;
    try {
      result = await this.provider.deliver({
        deliveryKey: record.id,
        kind: record.kind as CustomerNotificationKind,
        recipient: { userId: record.recipientUserId },
        subject: record.subject,
        body: record.body,
        metadata: record.metadata as Readonly<Record<string, unknown>>,
      });
    } catch {
      await this.notifications.recordDelivery({
        ...base,
        delivered: false,
        providerReference: null,
        failureReason: 'PROVIDER_FAILED',
        status: 'FAILED',
      });
      throw AppError.notificationFailed(notificationId);
    }
    return outcome(
      await this.notifications.recordDelivery({
        ...base,
        provider: result.transport,
        delivered: result.delivered,
        providerReference: result.providerReference ?? null,
        failureReason: result.failureReason ?? null,
        status: result.delivered ? 'DELIVERED' : 'FAILED',
      }),
    );
  }

  /** The notifications addressed to one recipient, newest first. */
  public async listForRecipient(recipientUserId: string, limit: number) {
    return this.notifications.listForRecipient(recipientUserId, limit);
  }

  /** Every message the platform produced, newest first, for the administrative surface. */
  public async listAll(limit: number) {
    return this.notifications.list(limit);
  }

  /** The messages addressed to one recipient, newest first, for the administrative surface. */
  public async listForRecipientOf(recipientUserId: string, limit: number) {
    return this.notifications.listForRecipient(recipientUserId, limit);
  }

  /** Every notification, newest first. */
  public async list(limit: number) {
    return this.notifications.list(limit);
  }

  /** One notification by its identifier. */
  public async findById(id: string) {
    return this.notifications.findById(id);
  }
  public async stateCounts(): Promise<readonly { state: string; count: number }[]> {
    return this.notifications.stateCounts();
  }
}

function outcome(record: NotificationRecord): NotificationOutcome {
  return {
    notificationId: record.id,
    status: record.status,
    transport: record.provider,
    delivered: record.status === 'DELIVERED',
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => JSON.stringify(key) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
