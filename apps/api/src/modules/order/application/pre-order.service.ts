import { OrderService } from './order.service';
import type { OrderRecord } from '../persistence/order.repository';
import { DatabaseService } from '../../../platform/database/database.service';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../platform/http/app-error';
import { CART_READER, type CartReader } from '../../cart';
import { CHECKOUT_QUOTER, type CheckoutQuote, type CheckoutQuoter } from '../../checkout';
import {
  INVENTORY_AVAILABILITY,
  INVENTORY_RESERVATION,
  type InventoryReservation,
  type AvailabilityTarget,
  type InventoryAvailability,
} from '../../inventory';
import {
  type PreOrderRecord,
  type PreOrderStatusValue,
  PreOrderRepository,
} from '../persistence/pre-order.repository';

/** The pre-order lifecycle's own transitions. */
const PRE_ORDER_TRANSITIONS: Readonly<Record<PreOrderStatusValue, readonly PreOrderStatusValue[]>> =
  {
    AWAITING_STOCK: ['STOCK_RESERVED', 'CANCELLED', 'EXPIRED'],
    STOCK_RESERVED: ['AWAITING_PAYMENT', 'CANCELLED', 'EXPIRED'],
    AWAITING_PAYMENT: ['CONVERTED', 'CANCELLED', 'EXPIRED'],
    CONVERTED: [],
    CANCELLED: [],
    EXPIRED: [],
  };

/**
 * The pre-order intent.
 *
 * A pre-order is a **distinct aggregate**, not an order in another state, so the guarantee the
 * approved decision requires is structural: a pre-order has no payable amount, no reservation, and
 * no payment reference while it is awaiting stock, so it cannot be charged.
 */
@Injectable()
export class PreOrderService {
  public constructor(
    private readonly preOrders: PreOrderRepository,
    private readonly database: DatabaseService,
    private readonly orders: OrderService,
    @Inject(INVENTORY_RESERVATION) private readonly reservations: InventoryReservation,
    @Inject(CHECKOUT_QUOTER) private readonly checkout: CheckoutQuoter,
    @Inject(CART_READER) private readonly cart: CartReader,
    @Inject(INVENTORY_AVAILABILITY) private readonly availability: InventoryAvailability,
  ) {}

  /**
   * Records a pre-order for what the customer intends to buy.
   *
   * The amount is the quote's total, so the pre-order records what the customer expected to pay,
   * and nothing is charged and no stock is held.
   */
  public async create(input: {
    readonly customerId: string;
    readonly destinationCountryCode: string;
  }): Promise<PreOrderRecord> {
    const quote = await this.checkout.quote({
      customerId: input.customerId,
      destinationCountryCode: input.destinationCountryCode,
    });
    if (quote.lines.length === 0) throw AppError.orderNotReady(['CART_EMPTY']);
    const invalid = quote.blockers.filter((blocker) => blocker.code !== 'INSUFFICIENT_STOCK');
    if (invalid.length > 0) throw AppError.orderNotReady(invalid.map((blocker) => blocker.code));

    return this.preOrders.create({
      customerId: input.customerId,
      status: 'AWAITING_STOCK',
      totalMinor: quote.totalMinor,
      currency: quote.currency,
      lines: toPreOrderLines(quote),
    });
  }

  /** The pre-orders of a customer, newest first. */
  public async listForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly PreOrderRecord[]> {
    return this.preOrders.listForCustomer(customerId, limit);
  }

  /** Every pre-order, newest first, for the administrative surface. */
  public async listAll(limit: number): Promise<readonly PreOrderRecord[]> {
    return this.preOrders.list(limit);
  }

  /**
   * Evaluates whether a pre-order's stock is available.
   *
   * The evaluation is a **read**, so a pre-order whose stock is still unavailable simply stays
   * `AWAITING_STOCK` and the customer is not asked to pay. The operation is idempotent, so it may be
   * repeated without side effects.
   */
  public async evaluateReadiness(preOrderId: string, customerId?: string): Promise<PreOrderRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`pre-order:${preOrderId}`);

      let preOrder = await this.preOrders.findById(preOrderId);
      if (preOrder === null || (customerId !== undefined && preOrder.customerId !== customerId))
        throw AppError.preOrderNotFound();
      if (preOrder.status === 'AWAITING_PAYMENT' && preOrder.orderId !== null) {
        await this.orders.read(preOrder.orderId, customerId);
        return (await this.preOrders.findById(preOrder.id)) ?? preOrder;
      }
      if (preOrder.status === 'STOCK_RESERVED' && preOrder.reservationId !== null) {
        const hold = await this.reservations.read(preOrder.reservationId);
        if (hold.status === 'ACTIVE') return preOrder;
        const reset = await this.preOrders.transition(
          preOrder.id,
          'STOCK_RESERVED',
          'AWAITING_STOCK',
          {
            status: 'AWAITING_STOCK',
            statusReason: 'RESERVATION_EXPIRED',
            reservationId: null,
          },
        );
        if (reset === null) return preOrder;
        preOrder = reset;
      }
      if (preOrder.status !== 'AWAITING_STOCK') return preOrder;

      const lines = preOrderLinesOf(preOrder);
      let current;
      try {
        current = await this.cart.readIntent(
          lines.map((line) => ({
            ...line,
            lastKnownUnitPriceMinor: line.unitPriceMinor,
            lastKnownUnitCurrency: preOrder.currency,
          })),
        );
      } catch (error) {
        if (error instanceof AppError && error.code === 'PRODUCT_NOT_FOUND') return preOrder;
        throw error;
      }
      if (current.lines.some((line) => !line.purchasable || line.currentUnitCurrency !== 'EGP'))
        return preOrder;
      const targets: AvailabilityTarget[] = lines.map((line) =>
        line.bundleId !== null
          ? { kind: 'BUNDLE', bundleId: line.bundleId }
          : { kind: 'VARIANT', variantId: line.variantId ?? '' },
      );
      const readings = await this.availability.readAvailability(targets);
      const ready = readings.every((reading, index) => {
        const line = lines[index];
        return line === undefined || reading.available >= line.quantity;
      });
      if (!ready || lines.length === 0) return preOrder;
      let reservation;
      try {
        reservation = await this.reservations.hold({
          idempotencyKey: `pre-order:${preOrder.id}:${preOrder.updatedAt.getTime()}`,
          holds: current.lines.map((line) =>
            line.bundleId !== null
              ? { kind: 'BUNDLE' as const, bundleId: line.bundleId, quantity: line.quantity }
              : { kind: 'VARIANT' as const, sku: line.sku, quantity: line.quantity },
          ),
        });
      } catch (error) {
        if (error instanceof AppError && error.code === 'INVENTORY_CONFLICT') return preOrder;
        throw error;
      }
      if (reservation.status !== 'ACTIVE') return preOrder;

      const updated = await this.preOrders.transition(
        preOrder.id,
        'AWAITING_STOCK',
        'STOCK_RESERVED',
        {
          status: 'STOCK_RESERVED',
          statusReason: null,
          reservationId: reservation.id,
        },
      );
      return updated ?? (await this.preOrders.findById(preOrder.id)) ?? preOrder;
    });
  }

  public async convert(input: {
    preOrderId: string;
    customerId: string;
    expectedFingerprint: string | null;
  }): Promise<OrderRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`pre-order:${input.preOrderId}`);
      const intent = await this.preOrders.findById(input.preOrderId);
      if (intent === null || intent.customerId !== input.customerId)
        throw AppError.preOrderNotFound();
      if (intent.orderId !== null) {
        const linked = await this.orders.read(intent.orderId, input.customerId);
        if (linked === null) throw AppError.orderNotFound();
        return linked;
      }
      const ready = await this.evaluateReadiness(intent.id, input.customerId);
      if (ready.status !== 'STOCK_RESERVED' || ready.reservationId === null)
        throw AppError.orderNotReady(['INSUFFICIENT_STOCK']);
      const metadata =
        typeof ready.lines === 'object' && ready.lines !== null
          ? (ready.lines as { destinationCountryCode?: unknown })
          : {};
      if (
        typeof metadata.destinationCountryCode !== 'string' ||
        !/^[A-Z]{2}$/.test(metadata.destinationCountryCode)
      )
        throw AppError.orderNotReady(['PRE_ORDER_REQUIRES_REVIEW']);
      const order = await this.orders.createFromIntent({
        customerId: input.customerId,
        preOrderId: intent.id,
        destinationCountryCode: metadata.destinationCountryCode,
        expectedFingerprint: input.expectedFingerprint,
        reservationId: ready.reservationId,
        lines: preOrderLinesOf(ready).map((line) => ({
          ...line,
          lastKnownUnitPriceMinor: line.unitPriceMinor,
          lastKnownUnitCurrency: ready.currency,
        })),
      });
      await this.preOrders.transition(intent.id, 'STOCK_RESERVED', 'AWAITING_PAYMENT', {
        status: 'AWAITING_PAYMENT',
        statusReason: null,
        orderId: order.id,
        actor: 'CUSTOMER',
        actorUserId: input.customerId,
      });
      return order;
    });
  }

  /**
   * Cancels a pre-order.
   *
   * The cancellation is idempotent for a pre-order that is already cancelled, expired, or
   * converted.
   */
  public async cancel(input: {
    readonly preOrderId: string;
    readonly customerId: string;
    readonly actor: 'CUSTOMER' | 'ADMIN';
    readonly actorUserId: string | null;
  }): Promise<PreOrderRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`pre-order:${input.preOrderId}`);

      const preOrder = await this.preOrders.findById(input.preOrderId);
      if (preOrder === null) throw AppError.preOrderNotFound();
      if (input.actor === 'CUSTOMER' && preOrder.customerId !== input.customerId) {
        throw AppError.preOrderNotFound();
      }
      if (preOrder.status === 'CANCELLED' || preOrder.status === 'EXPIRED') return preOrder;
      if (!PRE_ORDER_TRANSITIONS[preOrder.status].includes('CANCELLED')) {
        throw AppError.preOrderNotFound();
      }
      if (preOrder.orderId !== null)
        await this.orders.cancel({
          orderId: preOrder.orderId,
          customerId: input.customerId,
          actor: input.actor,
          actorUserId: input.actorUserId,
        });
      else if (preOrder.reservationId !== null)
        await this.reservations.release(preOrder.reservationId);
      const updated = await this.preOrders.transition(preOrder.id, preOrder.status, 'CANCELLED', {
        status: 'CANCELLED',
        statusReason: 'CANCELLED_BY_' + input.actor,
        actor: input.actor,
        actorUserId: input.actorUserId,
        cancelledAt: new Date(),
      });
      return updated ?? (await this.preOrders.findById(preOrder.id)) ?? preOrder;
    });
  }
}

/** The snapshotted lines of a pre-order. */
interface PreOrderLine {
  readonly lineId: string;
  readonly variantId: string | null;
  readonly bundleId: string | null;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly totalMinor: number;
}

function toPreOrderLines(quote: CheckoutQuote): Prisma.InputJsonValue {
  return {
    destinationCountryCode: quote.destinationCountryCode,
    taxJurisdiction: quote.taxJurisdiction,
    quoteFingerprint: quote.fingerprint,
    quoteSnapshot: JSON.parse(JSON.stringify(quote)) as Prisma.InputJsonValue,
    lines: quote.lines.map((line) => ({
      lineId: line.lineId,
      variantId: line.variantId,
      bundleId: line.bundleId,
      sku: line.sku,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      totalMinor: line.totalMinor,
    })),
  };
}

function preOrderLinesOf(preOrder: PreOrderRecord): readonly PreOrderLine[] {
  const invalid = () => AppError.orderNotReady(['PRE_ORDER_REQUIRES_REVIEW']);
  if (typeof preOrder.lines !== 'object' || preOrder.lines === null) throw invalid();
  const lines = (preOrder.lines as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 200) throw invalid();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const valid = lines.every((line: unknown) => {
    if (typeof line !== 'object' || line === null) return false;
    const value = line as Partial<PreOrderLine>;
    return (
      typeof value.lineId === 'string' &&
      uuid.test(value.lineId) &&
      typeof value.sku === 'string' &&
      ((typeof value.variantId === 'string' &&
        uuid.test(value.variantId) &&
        value.bundleId === null) ||
        (typeof value.bundleId === 'string' &&
          uuid.test(value.bundleId) &&
          value.variantId === null)) &&
      typeof value.quantity === 'number' &&
      Number.isSafeInteger(value.quantity) &&
      value.quantity > 0 &&
      value.quantity <= 999 &&
      typeof value.unitPriceMinor === 'number' &&
      Number.isSafeInteger(value.unitPriceMinor) &&
      value.unitPriceMinor >= 0
    );
  });
  if (!valid) throw invalid();
  return lines as PreOrderLine[];
}
