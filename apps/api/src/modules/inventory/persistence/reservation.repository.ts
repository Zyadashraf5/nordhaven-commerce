import { AppError } from '../../../platform/http/app-error';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';
import type { ReservationStatusValue } from './inventory.repository';

export interface ReservationLineRecord {
  readonly id: string;
  readonly inventoryId: string;
  readonly variantId: string | null;
  readonly sku: string | null;
  readonly quantity: number;
}

export interface ReservationRecord {
  readonly id: string;
  readonly status: ReservationStatusValue;
  readonly idempotencyKey: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly ReservationLineRecord[];
}

export interface ReservationLineAttributes {
  readonly inventoryId: string;
  readonly quantity: number;
}

export interface ReservationCreateAttributes {
  readonly idempotencyKey: string;
  readonly expiresAt: Date;
  readonly lines: readonly ReservationLineAttributes[];
}

export interface ReservationListPage {
  readonly records: readonly ReservationRecord[];
  readonly hasMore: boolean;
}

const RESERVATION_SELECT = {
  id: true,
  status: true,
  idempotencyKey: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  lines: {
    orderBy: { inventoryId: 'asc' },
    select: {
      id: true,
      inventoryId: true,
      quantity: true,
      inventory: { select: { variantId: true, variant: { select: { sku: true } } } },
    },
  },
} satisfies Prisma.ReservationSelect;

type ReservationRow = Prisma.ReservationGetPayload<{ select: typeof RESERVATION_SELECT }>;

function toRecord(row: ReservationRow): ReservationRecord {
  return {
    id: row.id,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map((line) => ({
      id: line.id,
      inventoryId: line.inventoryId,
      variantId: line.inventory.variantId,
      sku: line.inventory.variant?.sku ?? null,
      quantity: line.quantity,
    })),
  };
}

/**
 * Persistence for reservations.
 *
 * A reservation and its lines are always written inside one transaction so a reservation can never be
 * observed without the holds it describes. The unique `idempotency_key` is the idempotency anchor: a
 * repeated create returns the existing reservation instead of holding stock twice.
 */
@Injectable()
export class ReservationRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findById(id: string): Promise<ReservationRecord | null> {
    const row = await this.database.prisma.reservation.findUnique({
      where: { id },
      select: RESERVATION_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  /**
   * Reads a reservation **inside the caller's transaction**, so a just-written reservation (and its
   * lines) is visible before the transaction commits. Using the outer client here would miss the
   * uncommitted row and make a successful creation look like it had disappeared.
   */
  public async findByIdWithin(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<ReservationRecord | null> {
    const row = await transaction.reservation.findUnique({
      where: { id },
      select: RESERVATION_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  public async findByIdempotencyKey(key: string): Promise<ReservationRecord | null> {
    const row = await this.database.prisma.reservation.findUnique({
      where: { idempotencyKey: key },
      select: RESERVATION_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  public async list(
    limit: number,
    cursor: { readonly createdAt: Date; readonly id: string } | null,
    status: ReservationStatusValue | null,
  ): Promise<ReservationListPage> {
    const rows = await this.database.prisma.reservation.findMany({
      where: {
        ...(status === null ? {} : { status }),
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: RESERVATION_SELECT,
    });
    const hasMore = rows.length > limit;
    return { records: (hasMore ? rows.slice(0, limit) : rows).map(toRecord), hasMore };
  }

  /** Creates the reservation and its lines atomically. */
  public async create(
    transaction: Prisma.TransactionClient,
    attributes: ReservationCreateAttributes,
  ): Promise<ReservationRecord> {
    const row = await transaction.reservation.create({
      data: {
        idempotencyKey: attributes.idempotencyKey,
        expiresAt: attributes.expiresAt,
        lines: {
          create: attributes.lines.map((line) => ({
            inventoryId: line.inventoryId,
            quantity: line.quantity,
          })),
        },
      },
      select: RESERVATION_SELECT,
    });
    return toRecord(row);
  }

  /**
   * Expires every active reservation whose expiry has passed.
   *
   * Runs before every reserved-quantity computation and every reservation attempt, so an expired hold
   * never reduces availability. The held quantities are returned to available stock in the same
   * transaction, and each release writes a movement.
   */
  public async expireLapsed(now: Date): Promise<readonly { reservationId: string }[]> {
    const lapsed = await this.database.prisma.reservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      select: {
        id: true,
        lines: { orderBy: { inventoryId: 'asc' }, select: { inventoryId: true, quantity: true } },
      },
    });
    if (lapsed.length === 0) return [];

    for (const reservation of lapsed) {
      await this.database.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.reservation.updateMany({
          where: { id: reservation.id, status: 'ACTIVE', expiresAt: { lte: now } },
          data: { status: 'EXPIRED' },
        });
        // Another process already expired it; do not release the holds twice.
        if (claimed.count === 0) return;
        for (const line of reservation.lines) {
          const record = await transaction.inventoryItem.update({
            where: { id: line.inventoryId },
            data: { reserved: { decrement: line.quantity } },
            select: { onHand: true, reserved: true },
          });
          await transaction.stockMovement.create({
            data: {
              inventoryId: line.inventoryId,
              reason: 'RESERVATION_EXPIRED',
              onHandDelta: 0,
              reservedDelta: -line.quantity,
              onHandAfter: record.onHand,
              reservedAfter: record.reserved,
              reservationId: reservation.id,
            },
          });
        }
      });
    }
    return lapsed.map((reservation) => ({ reservationId: reservation.id }));
  }

  /**
   * Moves a reservation to a terminal state if and only if it is still active. Returns the claimed row
   * count so the caller can distinguish a fresh transition (1) from an idempotent repeat (0).
   */
  public async claimTerminal(
    transaction: Prisma.TransactionClient,
    id: string,
    status: 'CONFIRMED' | 'RELEASED',
  ): Promise<number> {
    const result = await transaction.reservation.updateMany({
      where: { id, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      data: { status },
    });
    return result.count;
  }

  public async extend(id: string, extendBySeconds: number): Promise<ReservationRecord> {
    const affected = await this.database.prisma.$executeRaw`UPDATE reservations
      SET expires_at = expires_at + (${extendBySeconds} * INTERVAL '1 second'), updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}::uuid AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP`;
    if (affected !== 1) throw AppError.inventoryConflict();
    const record = await this.findById(id);
    if (record === null) throw AppError.reservationNotFound();
    return record;
  }
}
