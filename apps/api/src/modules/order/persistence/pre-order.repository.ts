import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/** The pre-order's state, as the Orders capability persists it. */
export type PreOrderStatusValue =
  | 'AWAITING_STOCK'
  | 'STOCK_RESERVED'
  | 'AWAITING_PAYMENT'
  | 'CONVERTED'
  | 'CANCELLED'
  | 'EXPIRED';

/** One pre-order, as the Orders capability persists it. */
export interface PreOrderRecord {
  readonly id: string;
  readonly customerId: string;
  readonly status: PreOrderStatusValue;
  readonly totalMinor: number;
  readonly currency: string;
  readonly lines: unknown;
  readonly orderId: string | null;
  readonly reservationId: string | null;
  readonly statusReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly cancelledAt: Date | null;
}

/** The attributes a new pre-order carries. */
export interface PreOrderAttributes {
  readonly customerId: string;
  readonly status: PreOrderStatusValue;
  readonly totalMinor: number;
  readonly currency: string;
  readonly lines: Prisma.InputJsonValue;
}

/** The attributes a pre-order's state change carries. */
export interface PreOrderTransitionAttributes {
  readonly status: PreOrderStatusValue;
  readonly statusReason: string | null;
  readonly orderId?: string | null | undefined;
  readonly reservationId?: string | null | undefined;
  readonly cancelledAt?: Date | null | undefined;
  readonly actor?: string;
  readonly actorUserId?: string | null;
}

const PRE_ORDER_SELECT = {
  id: true,
  customerId: true,
  status: true,
  totalMinor: true,
  currency: true,
  lines: true,
  orderId: true,
  reservationId: true,
  statusReason: true,
  createdAt: true,
  updatedAt: true,
  cancelledAt: true,
} satisfies Prisma.PreOrderSelect;

type PreOrderRow = Prisma.PreOrderGetPayload<{ select: typeof PRE_ORDER_SELECT }>;

function toPreOrderRecord(row: PreOrderRow): PreOrderRecord {
  return { ...row, status: row.status as PreOrderStatusValue };
}

/**
 * Persistence for the pre-order intent.
 *
 * A pre-order is a separate record with its own lifecycle, not an order in a different state, so
 * it can never be paid: it has no payable amount, no reservation, and no payment reference.
 */
@Injectable()
export class PreOrderRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findByOrderId(orderId: string): Promise<PreOrderRecord | null> {
    const row = await this.database.prisma.preOrder.findUnique({
      where: { orderId },
      select: PRE_ORDER_SELECT,
    });
    return row === null ? null : toPreOrderRecord(row);
  }

  public async findById(preOrderId: string): Promise<PreOrderRecord | null> {
    const row = await this.database.prisma.preOrder.findUnique({
      where: { id: preOrderId },
      select: PRE_ORDER_SELECT,
    });
    return row === null ? null : toPreOrderRecord(row);
  }

  /** The pre-orders of a customer, newest first. */
  public async listForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly PreOrderRecord[]> {
    const rows = await this.database.prisma.preOrder.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: PRE_ORDER_SELECT,
    });
    return rows.map(toPreOrderRecord);
  }

  /** Every pre-order, newest first, for the administrative surface. */
  public async list(limit: number): Promise<readonly PreOrderRecord[]> {
    const rows = await this.database.prisma.preOrder.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: PRE_ORDER_SELECT,
    });
    return rows.map(toPreOrderRecord);
  }

  /** Creates a pre-order in the awaiting-stock state. */
  public async create(attributes: PreOrderAttributes): Promise<PreOrderRecord> {
    const row = await this.database.prisma.$transaction(async (tx) => {
      const created = await tx.preOrder.create({ data: attributes, select: PRE_ORDER_SELECT });
      await tx.preOrderEvent.create({
        data: {
          preOrderId: created.id,
          previousStatus: null,
          nextStatus: created.status,
          actor: 'CUSTOMER',
          actorUserId: created.customerId,
          reason: null,
          reservationId: null,
        },
      });
      return created;
    });
    return toPreOrderRecord(row);
  }

  /**
   * Moves a pre-order to a new state.
   *
   * The update is conditional on the pre-order's **current** state, so two concurrent transitions
   * cannot both apply.
   */
  public async transition(
    preOrderId: string,
    from: PreOrderStatusValue,
    to: PreOrderStatusValue,
    changes: PreOrderTransitionAttributes,
  ): Promise<PreOrderRecord | null> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const updated = await transaction.preOrder.updateMany({
        where: { id: preOrderId, status: from },
        data: {
          status: to,
          statusReason: changes.statusReason,
          ...(changes.orderId === undefined ? {} : { orderId: changes.orderId }),
          ...(changes.reservationId === undefined ? {} : { reservationId: changes.reservationId }),
          ...(changes.cancelledAt === undefined ? {} : { cancelledAt: changes.cancelledAt }),
        },
      });
      if (updated.count === 0) return null;
      const current = await transaction.preOrder.findUnique({
        where: { id: preOrderId },
        select: PRE_ORDER_SELECT,
      });
      if (current === null) throw new Error('The pre-order disappeared during a transition');
      await transaction.preOrderEvent.create({
        data: {
          preOrderId,
          previousStatus: from,
          nextStatus: to,
          actor: changes.actor ?? 'SYSTEM',
          actorUserId: changes.actorUserId ?? null,
          reason: changes.statusReason,
          reservationId: current.reservationId,
        },
      });
      return current;
    });
    return row === null ? null : toPreOrderRecord(row);
  }
}
