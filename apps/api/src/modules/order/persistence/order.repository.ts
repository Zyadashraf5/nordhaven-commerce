import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { OrderActor, OrderStatus } from '../../../generated/prisma/enums';
import { DatabaseService } from '../../../platform/database/database.service';
import { isUniqueConstraintViolation } from './prisma-errors';

/** The order's state. */
export type OrderStatusValue = OrderStatus;

/** Who caused a transition. */
export type OrderActorValue = OrderActor;

/** One order line, as the Orders capability persists it. */
export interface OrderLineRecord {
  readonly id: string;
  readonly orderId: string;
  readonly variantId: string | null;
  readonly bundleId: string | null;
  readonly sourceLineId: string | null;
  readonly sku: string;
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly unitCurrency: string;
  readonly discountBasisPoints: number;
  readonly taxRateBasisPoints: number;
  readonly taxInclusive: boolean;
  readonly taxClassification: string;
  readonly netMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly composition: Prisma.JsonValue;
  readonly createdAt: Date;
}

/** One order, as the Orders capability persists it. */
export interface OrderRecord {
  readonly refundedMinor: number;
  readonly id: string;
  readonly customerId: string;
  readonly status: OrderStatusValue;
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly taxTotalMinor: number;
  readonly totalMinor: number;
  readonly destinationCountryCode: string;
  readonly taxJurisdiction: string;
  readonly quoteFingerprint: string;
  readonly reservationId: string | null;
  readonly idempotencyKey: string;
  readonly statusReason: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly fulfilledAt: Date | null;
}

/** One recorded transition. */
export interface OrderEventRecord {
  readonly id: string;
  readonly orderId: string;
  readonly eventType: string;
  readonly previousStatus: OrderStatusValue | null;
  readonly nextStatus: OrderStatusValue | null;
  readonly actor: OrderActorValue;
  readonly actorUserId: string | null;
  readonly externalEventId: string | null;
  readonly reason: string | null;
  readonly detail: Prisma.JsonValue;
  readonly createdAt: Date;
}

/** The attributes a new order carries. */
export interface OrderAttributes {
  readonly customerId: string;
  readonly status: OrderStatusValue;
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly taxTotalMinor: number;
  readonly totalMinor: number;
  readonly destinationCountryCode: string;
  readonly taxJurisdiction: string;
  readonly quoteFingerprint: string;
  readonly reservationId: string | null;
  readonly idempotencyKey: string;
  readonly statusReason: string | null;
  readonly expiresAt: Date;
}

/** One order line's attributes. */
export interface OrderLineAttributes {
  readonly variantId: string | null;
  readonly bundleId: string | null;
  readonly sourceLineId: string | null;
  readonly sku: string;
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly unitCurrency: string;
  readonly discountBasisPoints: number;
  readonly taxRateBasisPoints: number;
  readonly taxInclusive: boolean;
  readonly taxClassification: string;
  readonly netMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly composition: Prisma.InputJsonValue;
}

/** One event's attributes. */
export interface OrderEventAttributes {
  readonly eventType: string;
  readonly previousStatus: OrderStatusValue | null;
  readonly nextStatus: OrderStatusValue | null;
  readonly actor: OrderActorValue;
  readonly actorUserId: string | null;
  readonly externalEventId: string | null;
  readonly reason: string | null;
  readonly detail: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
}

const ORDER_SELECT = {
  refundedMinor: true,
  id: true,
  customerId: true,
  status: true,
  currency: true,
  subtotalMinor: true,
  taxTotalMinor: true,
  totalMinor: true,
  destinationCountryCode: true,
  taxJurisdiction: true,
  quoteFingerprint: true,
  reservationId: true,
  idempotencyKey: true,
  statusReason: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
  cancelledAt: true,
  fulfilledAt: true,
} satisfies Prisma.OrderSelect;

const ORDER_LINE_SELECT = {
  id: true,
  orderId: true,
  variantId: true,
  bundleId: true,
  sourceLineId: true,
  sku: true,
  productId: true,
  productName: true,
  quantity: true,
  unitPriceMinor: true,
  unitCurrency: true,
  discountBasisPoints: true,
  taxRateBasisPoints: true,
  taxInclusive: true,
  taxClassification: true,
  netMinor: true,
  taxMinor: true,
  totalMinor: true,
  composition: true,
  createdAt: true,
} satisfies Prisma.OrderLineSelect;

const ORDER_EVENT_SELECT = {
  id: true,
  orderId: true,
  eventType: true,
  previousStatus: true,
  nextStatus: true,
  actor: true,
  actorUserId: true,
  externalEventId: true,
  reason: true,
  detail: true,
  createdAt: true,
} satisfies Prisma.OrderEventSelect;

function toOrderRecord(row: Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>): OrderRecord {
  return { ...row };
}

function toOrderLineRecord(
  row: Prisma.OrderLineGetPayload<{ select: typeof ORDER_LINE_SELECT }>,
): OrderLineRecord {
  return { ...row, composition: row.composition };
}

function toOrderEventRecord(
  row: Prisma.OrderEventGetPayload<{ select: typeof ORDER_EVENT_SELECT }>,
): OrderEventRecord {
  return { ...row, detail: row.detail };
}

/**
 * Persistence for the order aggregate.
 *
 * The Orders capability owns these tables. It references no other capability's tables: the
 * customer's identifier is a stable foreign identifier with no foreign key, and the reservation is
 * the Inventory capability's own record, referenced by its identifier.
 */
@Injectable()
export class OrderRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * The order a customer's idempotency key already created, or null.
   *
   * The lookup is the one that makes a repeated request safe: the second request finds the first
   * order rather than creating a new one.
   */
  public async findByIdempotencyKey(
    customerId: string,
    idempotencyKey: string,
  ): Promise<OrderRecord | null> {
    const row = await this.database.prisma.order.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
      select: ORDER_SELECT,
    });
    return row === null ? null : toOrderRecord(row);
  }

  public async recordRefund(input: {
    orderId: string;
    refundId: string;
    amountMinor: number;
    cumulativeMinor: number;
  }): Promise<void> {
    await this.database.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
      const status =
        input.cumulativeMinor === order.totalMinor ? ('REFUNDED' as const) : order.status;
      await tx.order.update({
        where: { id: order.id },
        data: { refundedMinor: input.cumulativeMinor, status },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'REFUND_RECORDED',
          previousStatus: order.status,
          nextStatus: status,
          actor: 'SYSTEM',
          actorUserId: null,
          externalEventId: `refund:${input.refundId}`,
          reason: null,
          detail: { amountMinor: input.amountMinor, cumulativeMinor: input.cumulativeMinor },
        },
      });
    });
  }

  public async purchaseForProduct(
    customerId: string,
    productId: string,
  ): Promise<OrderRecord | null> {
    const row = await this.database.prisma.order.findFirst({
      where: {
        customerId,
        status: { in: ['PAID', 'FULFILLED', 'REFUNDED'] },
        lines: { some: { productId } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ORDER_SELECT,
    });
    return row === null ? null : toOrderRecord(row);
  }

  public async findById(orderId: string): Promise<OrderRecord | null> {
    const row = await this.database.prisma.order.findUnique({
      where: { id: orderId },
      select: ORDER_SELECT,
    });
    return row === null ? null : toOrderRecord(row);
  }

  /** The orders of a customer, newest first. */
  public async listForCustomer(customerId: string, limit: number): Promise<readonly OrderRecord[]> {
    const rows = await this.database.prisma.order.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: ORDER_SELECT,
    });
    return rows.map(toOrderRecord);
  }

  /** Every order, newest first, for the administrative surface. */
  public async list(limit: number): Promise<readonly OrderRecord[]> {
    const rows = await this.database.prisma.order.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: ORDER_SELECT,
    });
    return rows.map(toOrderRecord);
  }

  /** The lines of an order, in the order they were created. */
  public async listLines(orderId: string): Promise<readonly OrderLineRecord[]> {
    const rows = await this.database.prisma.orderLine.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ORDER_LINE_SELECT,
    });
    return rows.map(toOrderLineRecord);
  }

  /** The recorded transitions of an order, oldest first. */
  public async listEvents(orderId: string): Promise<readonly OrderEventRecord[]> {
    const rows = await this.database.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ORDER_EVENT_SELECT,
    });
    return rows.map(toOrderEventRecord);
  }

  /**
   * Creates an order with its lines and its first event, in one transaction.
   *
   * The whole write is one transaction, so an order never exists without its lines and the record
   * of how it came to be. A concurrent request with the same idempotency key is refused by the
   * unique constraint, and the caller then reads the winner's order.
   */
  public async create(
    attributes: OrderAttributes,
    lines: readonly OrderLineAttributes[],
    firstEvent: OrderEventAttributes,
  ): Promise<OrderRecord> {
    try {
      const row = await this.database.prisma.$transaction(async (transaction) => {
        const created = await transaction.order.create({
          data: {
            ...attributes,
            lines: { create: lines.map((line) => ({ ...line })) },
          },
          select: ORDER_SELECT,
        });
        await transaction.orderEvent.create({ data: { orderId: created.id, ...firstEvent } });
        return created;
      });
      return toOrderRecord(row);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new OrderIdempotencyConflictError();
      throw error;
    }
  }

  /**
   * Moves an order to a new state and records the transition, in one transaction.
   *
   * The update is conditional on the order's **current** state, so two concurrent transitions
   * cannot both apply: the second one updates nothing and is reported as a conflict.
   */
  public async transition(
    orderId: string,
    from: OrderStatusValue,
    to: OrderStatusValue,
    event: OrderEventAttributes,
    changes: {
      readonly statusReason?: string | null | undefined;
      readonly paidAt?: Date | null | undefined;
      readonly cancelledAt?: Date | null | undefined;
      readonly fulfilledAt?: Date | null | undefined;
      readonly reservationId?: string | null | undefined;
    } = {},
  ): Promise<OrderRecord | null> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const updated = await transaction.order.updateMany({
        where: { id: orderId, status: from },
        data: {
          status: to,
          ...(changes.statusReason === undefined ? {} : { statusReason: changes.statusReason }),
          ...(changes.paidAt === undefined ? {} : { paidAt: changes.paidAt }),
          ...(changes.cancelledAt === undefined ? {} : { cancelledAt: changes.cancelledAt }),
          ...(changes.fulfilledAt === undefined ? {} : { fulfilledAt: changes.fulfilledAt }),
          ...(changes.reservationId === undefined ? {} : { reservationId: changes.reservationId }),
        },
      });
      if (updated.count === 0) return null;
      await transaction.orderEvent.create({ data: { orderId, ...event } });
      const current = await transaction.order.findUnique({
        where: { id: orderId },
        select: ORDER_SELECT,
      });
      if (current === null) throw new Error('The order disappeared during a transition');
      return current;
    });
    return row === null ? null : toOrderRecord(row);
  }

  /**
   * Records an event without changing the order's state.
   *
   * A refused transition is a fact an operator needs, so it is recorded while the order's own
   * state is left untouched.
   */
  public async recordEvent(orderId: string, event: OrderEventAttributes): Promise<void> {
    await this.database.prisma.orderEvent.create({ data: { orderId, ...event } });
  }

  /** The payment events already applied, so a repeated event is applied once. */
  public async findAppliedPaymentEvent(eventId: string): Promise<OrderEventRecord | null> {
    const row = await this.database.prisma.orderEvent.findUnique({
      where: { externalEventId: eventId },
      select: ORDER_EVENT_SELECT,
    });
    return row === null ? null : toOrderEventRecord(row);
  }
  public async stateCounts(): Promise<readonly { state: string; count: number }[]> {
    const rows = await this.database.prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return rows
      .map((row) => ({ state: row.status, count: row._count._all }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }
  public async customerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]> {
    const rows = await this.database.prisma.order.groupBy({
      by: ['customerId'],
      where: cursor === null ? {} : { customerId: { gt: cursor } },
      orderBy: { customerId: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.customerId);
  }
  public async customerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    if (ids.length === 0) return [];
    const rows = await this.database.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: [...ids] } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ customerId: row.customerId, count: row._count._all }));
  }
  public async recordIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]> {
    const rows = await this.database.prisma.order.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

/** Raised when a concurrent request already created the order for an idempotency key. */
export class OrderIdempotencyConflictError extends Error {
  public constructor() {
    super('An order already exists for that idempotency key');
    this.name = 'OrderIdempotencyConflictError';
  }
}
