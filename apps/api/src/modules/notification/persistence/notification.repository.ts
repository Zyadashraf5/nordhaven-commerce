import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/** One notification, as the capability persists it. */
export interface NotificationRecord {
  readonly metadata: Prisma.JsonValue;
  readonly id: string;
  readonly kind: string;
  readonly recipientUserId: string;
  readonly subject: string;
  readonly body: string;
  readonly status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
  readonly provider: string | null;
  readonly providerReference: string | null;
  readonly failureReason: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
}

const NOTIFICATION_SELECT = {
  metadata: true,
  id: true,
  kind: true,
  recipientUserId: true,
  subject: true,
  body: true,
  status: true,
  provider: true,
  providerReference: true,
  failureReason: true,
  idempotencyKey: true,
  createdAt: true,
  sentAt: true,
} satisfies Prisma.NotificationSelect;

/**
 * Persistence for the notifications.
 *
 * The business key is unique, so a retried workflow produces **one** notification and therefore one
 * delivery, and the delivery attempts are recorded beside it.
 */
@Injectable()
export class NotificationRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findByIdempotencyKey(idempotencyKey: string): Promise<NotificationRecord | null> {
    const row = await this.database.prisma.notification.findUnique({
      where: { idempotencyKey },
      select: NOTIFICATION_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  public async create(input: {
    readonly kind: string;
    readonly recipientUserId: string;
    readonly subject: string;
    readonly body: string;
    readonly idempotencyKey: string;
    readonly metadata?: Prisma.InputJsonValue;
  }): Promise<NotificationRecord> {
    const row = await this.database.prisma.notification.create({
      data: {
        metadata: input.metadata ?? {},
        kind: input.kind,
        recipientUserId: input.recipientUserId,
        subject: input.subject,
        body: input.body,
        status: 'PENDING',
        idempotencyKey: input.idempotencyKey,
      },
      select: NOTIFICATION_SELECT,
    });
    return toRecord(row);
  }

  public async claimDelivery(notificationId: string): Promise<string | null> {
    const token = randomUUID();
    const changed = await this.database.prisma.notification.updateMany({
      where: {
        id: notificationId,
        status: { in: ['PENDING', 'FAILED'] },
        OR: [
          { deliveryClaimedAt: null },
          { deliveryClaimedAt: { lt: new Date(Date.now() - 300000) } },
        ],
      },
      data: { deliveryClaimedAt: new Date(), deliveryClaimToken: token },
    });
    return changed.count === 1 ? token : null;
  }

  public async recordDelivery(input: {
    readonly notificationId: string;
    readonly claimToken: string;
    readonly provider: string;
    readonly delivered: boolean;
    readonly providerReference: string | null;
    readonly failureReason: string | null;
    readonly status: 'DELIVERED' | 'FAILED' | 'SKIPPED';
    readonly actorUserId: string | null;
  }): Promise<NotificationRecord> {
    const row = await this.database.prisma.$transaction(async (tx) => {
      const changed = await tx.notification.updateMany({
        where: { id: input.notificationId, deliveryClaimToken: input.claimToken },
        data: {
          status: input.status,
          provider: input.provider,
          providerReference: input.providerReference,
          failureReason: input.failureReason,
          deliveryClaimedAt: null,
          deliveryClaimToken: null,
          ...(input.delivered ? { sentAt: new Date() } : {}),
        },
      });
      if (changed.count === 1) {
        const count = await tx.notificationDelivery.count({
          where: { notificationId: input.notificationId },
        });
        await tx.notificationDelivery.create({
          data: {
            notificationId: input.notificationId,
            attempt: count + 1,
            provider: input.provider,
            delivered: input.delivered,
            failureReason: input.failureReason,
            actorUserId: input.actorUserId,
          },
        });
      }
      const current = await tx.notification.findUniqueOrThrow({
        where: { id: input.notificationId },
        select: NOTIFICATION_SELECT,
      });
      return current;
    });
    return toRecord(row);
  }

  public async listForRecipient(
    recipientUserId: string,
    limit: number,
  ): Promise<readonly NotificationRecord[]> {
    const rows = await this.database.prisma.notification.findMany({
      where: { recipientUserId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: NOTIFICATION_SELECT,
    });
    return rows.map(toRecord);
  }

  public async list(limit: number): Promise<readonly NotificationRecord[]> {
    const rows = await this.database.prisma.notification.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: NOTIFICATION_SELECT,
    });
    return rows.map(toRecord);
  }

  public async findById(id: string): Promise<NotificationRecord | null> {
    const row = await this.database.prisma.notification.findUnique({
      where: { id },
      select: NOTIFICATION_SELECT,
    });
    return row === null ? null : toRecord(row);
  }
  public async stateCounts(): Promise<readonly { state: string; count: number }[]> {
    const rows = await this.database.prisma.notification.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return rows
      .map((row) => ({ state: row.status, count: row._count._all }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }
}

function toRecord(row: {
  metadata: Prisma.JsonValue;
  id: string;
  kind: string;
  recipientUserId: string;
  subject: string;
  body: string;
  status: string;
  provider: string | null;
  providerReference: string | null;
  failureReason: string | null;
  idempotencyKey: string;
  createdAt: Date;
  sentAt: Date | null;
}): NotificationRecord {
  return {
    metadata: row.metadata,
    id: row.id,
    kind: row.kind,
    recipientUserId: row.recipientUserId,
    subject: row.subject,
    body: row.body,
    status: row.status as NotificationRecord['status'],
    provider: row.provider,
    providerReference: row.providerReference,
    failureReason: row.failureReason,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}
