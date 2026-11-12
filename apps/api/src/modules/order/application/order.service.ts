import {
  ENVIRONMENT_CONFIGURATION,
  type EnvironmentConfiguration,
} from '../../../platform/config/environment';
import { PreOrderRepository } from '../persistence/pre-order.repository';
import type { CartIntentLine } from '../../cart';
import { DatabaseService } from '../../../platform/database/database.service';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../platform/http/app-error';
import { CART_READER, CART_WRITER, type CartReader, type CartWriter } from '../../cart';
import { CHECKOUT_QUOTER, type CheckoutQuote, type CheckoutQuoter } from '../../checkout';
import {
  type BundleComposition,
  INVENTORY_BUNDLES,
  INVENTORY_RESERVATION,
  type InventoryBundles,
  type InventoryReservation,
  type ReservationHold,
} from '../../inventory';
import {
  type OrderFailureRequest,
  type OrderFailureResult,
  type OrderLedger,
  type OrderSettlementRequest,
  type OrderSettlementResult,
  type OrderSnapshot,
} from '../contracts';
import {
  type OrderActorValue,
  type OrderLineRecord,
  type OrderRecord,
  type OrderStatusValue,
  OrderIdempotencyConflictError,
  OrderRepository,
} from '../persistence/order.repository';
import { holdsReservation, transitionPermitted } from './order-transitions';

/**
 * The order lifecycle.
 *
 * The service owns the rules; the repository owns the atomicity. An order is created from a
 * **recomputed** quote, so a client never supplies an amount, and it stores an immutable snapshot
 * of every figure the customer confirmed.
 */
@Injectable()
export class OrderService implements OrderLedger {
  public constructor(
    private readonly orders: OrderRepository,
    private readonly database: DatabaseService,
    @Inject(ENVIRONMENT_CONFIGURATION) private readonly configuration: EnvironmentConfiguration,
    private readonly preOrders: PreOrderRepository,
    @Inject(CHECKOUT_QUOTER) private readonly checkout: CheckoutQuoter,
    @Inject(INVENTORY_RESERVATION) private readonly reservations: InventoryReservation,
    @Inject(INVENTORY_BUNDLES) private readonly bundles: InventoryBundles,
    @Inject(CART_READER) private readonly cart: CartReader,
    @Inject(CART_WRITER) private readonly cartWriter: CartWriter,
  ) {}

  /**
   * Creates an order from the customer's confirmed quote.
   *
   * The request is **idempotent** on the customer's business key: a repeated request returns the
   * order the first one created and holds the stock only once.
   */
  public async create(input: {
    readonly customerId: string;
    readonly idempotencyKey: string;
    readonly destinationCountryCode: string;
    /** The fingerprint of the quote the customer confirmed, when the customer confirmed one. */
    readonly expectedFingerprint: string | null;
  }): Promise<OrderRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`order-customer:${input.customerId}`);

      const existing = await this.orders.findByIdempotencyKey(
        input.customerId,
        input.idempotencyKey,
      );
      if (existing !== null) return existing;

      await this.cart.lockForCustomer(input.customerId);
      const quote = await this.checkout.quote({
        customerId: input.customerId,
        destinationCountryCode: input.destinationCountryCode,
      });

      if (!quote.ready) {
        // The cart cannot be checked out, so no order is created and no stock is held. The reason is
        // reported to the customer, who fixes the cart and tries again.
        throw AppError.orderNotReady(quote.blockers.map((blocker) => blocker.code));
      }
      if (input.expectedFingerprint !== null && input.expectedFingerprint !== quote.fingerprint) {
        // The price moved between the confirmation and the order, so the customer confirms the new
        // figure rather than the platform charging one they never saw.
        throw AppError.orderQuoteChanged();
      }

      const compositions = await this.resolveCompositions(quote);
      const reservation = await this.holdStock(input, quote, compositions);

      try {
        const order = await this.persistQuotedOrder(input, quote, reservation, compositions);
        await this.clearOrderedCartLines(input.customerId, quote);
        return order;
      } catch (error) {
        if (error instanceof OrderIdempotencyConflictError) {
          // A concurrent request with the same key won the race; its order is the order.
          const winner = await this.orders.findByIdempotencyKey(
            input.customerId,
            input.idempotencyKey,
          );
          if (winner !== null) return winner;
        }
        throw error;
      }
    });
  }

  /** Reads one order by its identifier, with its lines and its recorded transitions. */
  public async read(orderId: string, customerId?: string): Promise<OrderSnapshot | null> {
    return this.database.transaction(async () => {
      await this.database.lock(`order:${orderId}`);
      let order = await this.orders.findById(orderId);
      if (order === null || (customerId !== undefined && order.customerId !== customerId))
        return null;
      if (order.status === 'PENDING_PAYMENT' && order.expiresAt <= new Date()) {
        if (order.reservationId !== null) await this.reservations.release(order.reservationId);
        order =
          (await this.orders.transition(
            order.id,
            'PENDING_PAYMENT',
            'EXPIRED',
            {
              eventType: 'ORDER_EXPIRED',
              previousStatus: 'PENDING_PAYMENT',
              nextStatus: 'EXPIRED',
              actor: 'SYSTEM',
              actorUserId: null,
              externalEventId: null,
              reason: 'PAYMENT_WINDOW_EXPIRED',
              detail: Prisma.JsonNull,
            },
            { statusReason: 'PAYMENT_WINDOW_EXPIRED' },
          )) ?? order;
      }
      if (order.status === 'EXPIRED')
        await this.syncPreOrder(order.id, 'EXPIRED', 'PAYMENT_WINDOW_EXPIRED');
      return toSnapshot(order, await this.orders.listLines(orderId));
    });
  }

  /** Reads one order by its identifier, as the published ledger contract states. */
  public async findOrderById(orderId: string): Promise<OrderSnapshot | null> {
    return this.read(orderId);
  }

  /** The orders of a customer, newest first. */
  public async listForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly OrderSnapshot[]> {
    const records = await this.orders.listForCustomer(customerId, limit);
    const snapshots = await Promise.all(records.map((order) => this.read(order.id, customerId)));
    return snapshots.filter((order): order is OrderSnapshot => order !== null);
  }

  /** Every order, newest first, for the administrative surface. */
  public async listAll(limit: number): Promise<readonly OrderSnapshot[]> {
    const records = await this.orders.list(limit);
    const snapshots = await Promise.all(records.map((order) => this.read(order.id)));
    return snapshots.filter((order): order is OrderSnapshot => order !== null);
  }

  /** The orders of one customer, newest first, for the administrative surface. */
  public async listForCustomerOf(
    customerId: string,
    limit: number,
  ): Promise<readonly OrderSnapshot[]> {
    return this.listForCustomer(customerId, limit);
  }

  /**
   * The customer's orders that have been paid, newest first.
   *
   * An order that was paid and later refunded still counts as a purchase, because the customer
   * did buy the goods; the Orders capability's own refunded projection is what records the money.
   */
  public async purchaseForProduct(
    customerId: string,
    productId: string,
  ): Promise<OrderSnapshot | null> {
    const record = await this.orders.purchaseForProduct(customerId, productId);
    return record === null ? null : toSnapshot(record, await this.orders.listLines(record.id));
  }

  public async paidOrdersOf(customerId: string): Promise<readonly OrderSnapshot[]> {
    const records = await this.orders.listForCustomer(customerId, 100);
    const snapshots = await Promise.all(records.map((order) => this.read(order.id, customerId)));
    return snapshots.filter(
      (order): order is OrderSnapshot =>
        order !== null &&
        (order.status === 'PAID' || order.status === 'FULFILLED' || order.status === 'REFUNDED'),
    );
  }

  /** The recorded transitions of an order, oldest first. */
  public async eventsOf(orderId: string) {
    return this.orders.listEvents(orderId);
  }

  /**
   * Cancels an order.
   *
   * The cancellation is idempotent for an order that is already cancelled or expired, it releases
   * the held stock, and it is **refused** for an order that has already been paid, because a paid
   * order needs the refund workflow of Milestone 10 rather than a silent cancellation.
   */
  public async cancel(input: {
    readonly orderId: string;
    readonly customerId: string;
    readonly actor: OrderActorValue;
    readonly actorUserId: string | null;
  }): Promise<OrderRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`order:${input.orderId}`);

      const order = await this.orders.findById(input.orderId);
      if (order === null) throw AppError.orderNotFound();
      if (input.actor === 'CUSTOMER' && order.customerId !== input.customerId) {
        // An order that belongs to another customer is answered exactly like one that never existed.
        throw AppError.orderNotFound();
      }
      if (order.status === 'CANCELLED' || order.status === 'EXPIRED') return order;
      if (order.status === 'PAID' || order.status === 'FULFILLED') {
        await this.recordRefusedTransition(order, 'CANCELLED', input.actor, input.actorUserId);
        throw AppError.orderNotCancellable();
      }
      if (!transitionPermitted(order.status, 'CANCELLED')) {
        await this.recordRefusedTransition(order, 'CANCELLED', input.actor, input.actorUserId);
        throw AppError.orderNotCancellable();
      }

      if (order.reservationId !== null) {
        await this.reservations.release(order.reservationId);
      }

      const updated = await this.orders.transition(
        order.id,
        order.status,
        'CANCELLED',
        {
          eventType: 'ORDER_CANCELLED',
          previousStatus: order.status,
          nextStatus: 'CANCELLED',
          actor: input.actor,
          actorUserId: input.actorUserId,
          externalEventId: null,
          reason: null,
          detail: Prisma.JsonNull,
        },
        { statusReason: 'CANCELLED_BY_' + input.actor, cancelledAt: new Date() },
      );
      if (updated === null) {
        const current = await this.orders.findById(order.id);
        if (current === null) throw AppError.orderNotFound();
        return current;
      }
      await this.syncPreOrder(order.id, 'CANCELLED', 'ORDER_CANCELLED');
      return updated;
    });
  }

  /**
   * Records a failed payment against an order and releases its held stock.
   *
   * The release is idempotent, so a failure event delivered twice releases the stock once, and the
   * order moves to `PAYMENT_FAILED` only from `PENDING_PAYMENT`.
   */
  public async failPayment(request: OrderFailureRequest): Promise<OrderFailureResult> {
    return this.database.transaction(async () => {
      await this.database.lock(`order:${request.orderId}`);

      const applied = await this.orders.findAppliedPaymentEvent(request.eventId);
      if (applied !== null) {
        const order = await this.orders.findById(request.orderId);
        return {
          status: order?.status ?? 'PENDING_PAYMENT',
          stockReleased: false,
          reason: 'ALREADY_APPLIED',
        };
      }

      const order = await this.orders.findById(request.orderId);
      if (order === null) throw AppError.orderNotFound();

      if (order.status !== 'PENDING_PAYMENT') {
        await this.orders.recordEvent(order.id, {
          eventType: 'PAYMENT_FAILURE_IGNORED',
          previousStatus: order.status,
          nextStatus: order.status,
          actor: 'SYSTEM',
          actorUserId: null,
          externalEventId: request.eventId,
          reason: 'ORDER_NOT_PENDING_PAYMENT',
          detail: { paymentReference: request.paymentReference, reason: request.reason },
        });
        return {
          status: order.status,
          stockReleased: false,
          reason: 'ORDER_NOT_PENDING_PAYMENT',
        };
      }

      let stockReleased = false;
      if (order.reservationId !== null) {
        // The release is idempotent, so a repeated failure event releases the stock once.
        await this.reservations.release(order.reservationId);
        stockReleased = true;
      }

      const updated = await this.orders.transition(
        order.id,
        'PENDING_PAYMENT',
        'PAYMENT_FAILED',
        {
          eventType: 'PAYMENT_FAILED',
          previousStatus: 'PENDING_PAYMENT',
          nextStatus: 'PAYMENT_FAILED',
          actor: 'SYSTEM',
          actorUserId: null,
          externalEventId: request.eventId,
          reason: request.reason,
          detail: { paymentReference: request.paymentReference, stockReleased },
        },
        { statusReason: 'PAYMENT_FAILED' },
      );
      if (updated === null) {
        const current = await this.orders.findById(order.id);
        return {
          status: current?.status ?? 'PENDING_PAYMENT',
          stockReleased: false,
          reason: 'CONCURRENT_TRANSITION',
        };
      }
      await this.syncPreOrder(order.id, 'EXPIRED', 'PAYMENT_FAILED');
      return { status: 'PAYMENT_FAILED', stockReleased, reason: null };
    });
  }

  /**
   * Records a verified payment against an order and advances its state.
   *
   * The event is idempotent on the payment event's identifier, so a repeated or a delayed webhook
   * cannot apply the same payment twice. A payment that arrives after the reservation has lapsed
   * moves the order to `PAID_PENDING_ALLOCATION` and does **not** report the stock as allocated.
   */
  public async settlePayment(request: OrderSettlementRequest): Promise<OrderSettlementResult> {
    return this.database.transaction(async () => {
      await this.database.lock(`order:${request.orderId}`);

      const applied = await this.orders.findAppliedPaymentEvent(request.eventId);
      if (applied !== null) {
        const order = await this.orders.findById(request.orderId);
        return {
          status: order?.status ?? 'PENDING_PAYMENT',
          fullySettled: order?.totalMinor === request.amountMinor,
          stockAllocated: order?.status === 'PAID',
          reason: null,
        };
      }

      const order = await this.orders.findById(request.orderId);
      if (order === null) throw AppError.orderNotFound();

      if (order.status !== 'PENDING_PAYMENT' && order.status !== 'EXPIRED') {
        // The order already left the pending state, so the payment is recorded as a discrepancy
        // rather than applied.
        await this.orders.recordEvent(order.id, {
          eventType: 'PAYMENT_IGNORED',
          previousStatus: order.status,
          nextStatus: order.status,
          actor: 'SYSTEM',
          actorUserId: null,
          externalEventId: request.eventId,
          reason: 'ORDER_NOT_PENDING_PAYMENT',
          detail: { paymentReference: request.paymentReference, amountMinor: request.amountMinor },
        });
        return {
          status: order.status,
          fullySettled: false,
          stockAllocated: false,
          reason: 'ORDER_NOT_PENDING_PAYMENT',
        };
      }

      if (
        !Number.isSafeInteger(request.amountMinor) ||
        request.amountMinor !== order.totalMinor ||
        request.currency !== order.currency
      ) {
        await this.orders.recordEvent(order.id, {
          eventType: 'PAYMENT_REJECTED',
          previousStatus: order.status,
          nextStatus: order.status,
          actor: 'SYSTEM',
          actorUserId: null,
          externalEventId: request.eventId,
          reason: 'PAYMENT_DETAILS_MISMATCH',
          detail: { amountMinor: request.amountMinor, currency: request.currency },
        });
        return {
          status: order.status,
          fullySettled: false,
          stockAllocated: false,
          reason: 'PAYMENT_DETAILS_MISMATCH',
        };
      }
      const fullySettled = true;
      let stockAllocated = false;
      let nextStatus: OrderStatusValue = 'PAID_PENDING_ALLOCATION';

      // The order holds its reservation only while it is pending payment. Any other state means the
      // hold was released or expired, so a later payment must not consume stock the order no longer
      // holds.
      if (order.reservationId !== null && holdsReservation(order.status)) {
        try {
          const confirmed = await this.reservations.confirm(order.reservationId);
          if (confirmed.status === 'CONFIRMED') {
            stockAllocated = true;
            nextStatus = 'PAID';
          }
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== 'INVENTORY_CONFLICT') throw error;
          // The reservation is gone, so the stock was not held and cannot be allocated. The order
          // records that the money arrived and that the stock was not allocated.
          stockAllocated = false;
          nextStatus = 'PAID_PENDING_ALLOCATION';
        }
      }

      const updated = await this.orders.transition(
        order.id,
        order.status,
        nextStatus,
        {
          eventType: 'PAYMENT_RECORDED',
          previousStatus: order.status,
          nextStatus,
          actor: 'SYSTEM',
          actorUserId: null,
          externalEventId: request.eventId,
          reason: stockAllocated ? null : 'RESERVATION_UNAVAILABLE',
          detail: {
            paymentReference: request.paymentReference,
            amountMinor: request.amountMinor,
            fullySettled,
            stockAllocated,
          },
        },
        { statusReason: stockAllocated ? null : 'RESERVATION_UNAVAILABLE', paidAt: new Date() },
      );
      if (updated === null) {
        const current = await this.orders.findById(order.id);
        return {
          status: current?.status ?? 'PENDING_PAYMENT',
          fullySettled,
          stockAllocated: false,
          reason: 'CONCURRENT_TRANSITION',
        };
      }
      const preOrder = await this.preOrders.findByOrderId(order.id);
      if (preOrder?.status === 'AWAITING_PAYMENT')
        await this.preOrders.transition(preOrder.id, 'AWAITING_PAYMENT', 'CONVERTED', {
          status: 'CONVERTED',
          statusReason: null,
        });
      return {
        status: nextStatus,
        fullySettled,
        stockAllocated,
        reason: stockAllocated ? null : 'RESERVATION_UNAVAILABLE',
      };
    });
  }

  private async syncPreOrder(
    orderId: string,
    status: 'CANCELLED' | 'EXPIRED',
    reason: string,
  ): Promise<void> {
    const preOrder = await this.preOrders.findByOrderId(orderId);
    if (preOrder?.status === 'AWAITING_PAYMENT')
      await this.preOrders.transition(preOrder.id, 'AWAITING_PAYMENT', status, {
        status,
        statusReason: reason,
      });
  }

  public async recordRefund(input: {
    orderId: string;
    refundId: string;
    amountMinor: number;
    cumulativeMinor: number;
  }): Promise<void> {
    await this.database.transaction(async () => {
      await this.database.lock(`order:${input.orderId}`);
      if ((await this.orders.findAppliedPaymentEvent(`refund:${input.refundId}`)) !== null) return;
      const order = await this.orders.findById(input.orderId);
      if (order === null) throw AppError.orderNotFound();
      if (
        !Number.isSafeInteger(input.cumulativeMinor) ||
        input.cumulativeMinor < order.refundedMinor ||
        input.cumulativeMinor > order.totalMinor
      )
        throw AppError.refundExceedsPayment(order.totalMinor - order.refundedMinor);
      await this.orders.recordRefund(input);
    });
  }

  /**
   * Holds the ordered stock with the Inventory capability's atomic reservation.
   *
   * The idempotency key is derived from the order's business key, so a retried order request holds
   * the stock exactly once.
   */
  private async persistQuotedOrder(
    input: { customerId: string; idempotencyKey: string },
    quote: CheckoutQuote,
    reservation: { id: string; expiresAt: Date },
    compositions: ReadonlyMap<string, BundleComposition>,
  ): Promise<OrderRecord> {
    return this.orders.create(
      {
        customerId: input.customerId,
        status: 'PENDING_PAYMENT',
        currency: quote.currency,
        subtotalMinor: quote.netSubtotalMinor,
        taxTotalMinor: quote.taxTotalMinor,
        totalMinor: quote.totalMinor,
        destinationCountryCode: quote.destinationCountryCode,
        taxJurisdiction: quote.taxJurisdiction,
        quoteFingerprint: quote.fingerprint,
        reservationId: reservation.id,
        idempotencyKey: input.idempotencyKey,
        statusReason: null,
        expiresAt: reservation.expiresAt,
      },
      quote.lines.map((line) => ({
        variantId: line.variantId,
        bundleId: line.bundleId,
        sourceLineId: line.lineId,
        sku: line.sku,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        unitCurrency: line.unitCurrency,
        discountBasisPoints: line.discountBasisPoints,
        taxRateBasisPoints: line.taxRateBasisPoints,
        taxInclusive: line.taxInclusive,
        taxClassification: line.taxClassification,
        netMinor: line.netMinor,
        taxMinor: line.taxMinor,
        totalMinor: line.totalMinor,
        composition: toCompositionJson(compositions.get(line.lineId)),
      })),
      {
        eventType: 'ORDER_CREATED',
        previousStatus: null,
        nextStatus: 'PENDING_PAYMENT',
        actor: 'CUSTOMER',
        actorUserId: input.customerId,
        externalEventId: null,
        reason: null,
        detail: {
          quoteFingerprint: quote.fingerprint,
          reservationId: reservation.id,
          quoteSnapshot: JSON.parse(JSON.stringify(quote)) as Prisma.InputJsonValue,
        },
      },
    );
  }

  /** Converts a saved intent using current catalog/tax facts and its existing verified hold. */
  public async createFromIntent(input: {
    customerId: string;
    preOrderId: string;
    destinationCountryCode: string;
    expectedFingerprint: string | null;
    reservationId: string;
    lines: readonly CartIntentLine[];
  }): Promise<OrderRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`order-customer:${input.customerId}`);
      const idempotencyKey = `pre-order:${input.preOrderId}`;
      const existing = await this.orders.findByIdempotencyKey(input.customerId, idempotencyKey);
      if (existing !== null) return existing;
      const quote = await this.checkout.quote({
        customerId: input.customerId,
        destinationCountryCode: input.destinationCountryCode,
        intent: input.lines,
      });
      const blockers = quote.blockers.filter((blocker) => blocker.code !== 'INSUFFICIENT_STOCK');
      if (blockers.length > 0)
        throw AppError.orderNotReady(blockers.map((blocker) => blocker.code));
      if (input.expectedFingerprint !== null && input.expectedFingerprint !== quote.fingerprint)
        throw AppError.orderQuoteChanged();
      const holds: ReservationHold[] = quote.lines.map((line) =>
        line.bundleId !== null
          ? { kind: 'BUNDLE', bundleId: line.bundleId, quantity: line.quantity }
          : { kind: 'VARIANT', sku: line.sku, quantity: line.quantity },
      );
      if (!(await this.reservations.matches(input.reservationId, holds)))
        throw AppError.orderNotReady(['RESERVATION_UNAVAILABLE']);
      const reservation = await this.reservations.read(input.reservationId);
      return this.persistQuotedOrder(
        { customerId: input.customerId, idempotencyKey },
        quote,
        reservation,
        await this.resolveCompositions(quote),
      );
    });
  }

  private async holdStock(
    input: { readonly customerId: string; readonly idempotencyKey: string },
    quote: CheckoutQuote,
    compositions: ReadonlyMap<string, BundleComposition>,
  ): Promise<{ readonly id: string; readonly expiresAt: Date }> {
    const holds: ReservationHold[] = [];
    for (const line of quote.lines) {
      if (line.bundleId !== null) {
        const composition = compositions.get(line.lineId);
        if (composition === undefined || composition.kind === 'FIXED') {
          holds.push({ kind: 'BUNDLE', bundleId: line.bundleId, quantity: line.quantity });
          continue;
        }
        // A DYNAMIC bundle holds its components, because it keeps no stock of its own.
        for (const component of composition.lines) {
          holds.push({
            kind: 'VARIANT',
            sku: component.sku,
            quantity: component.quantity * line.quantity,
          });
        }
        continue;
      }
      holds.push({ kind: 'VARIANT', sku: line.sku, quantity: line.quantity });
    }

    const reservation = await this.reservations.hold({
      idempotencyKey: `order:${input.customerId}:${input.idempotencyKey}`,
      holds,
      expiresInSeconds:
        this.configuration.orderReservationTtlSeconds ?? ORDER_RESERVATION_TTL_SECONDS,
    });
    return { id: reservation.id, expiresAt: reservation.expiresAt };
  }

  /**
   * Resolves the composition of every bundle line, so the order snapshots what a bundle resolved to
   * at the moment the order was created.
   */
  private async resolveCompositions(
    quote: CheckoutQuote,
  ): Promise<ReadonlyMap<string, BundleComposition>> {
    const compositions = new Map<string, BundleComposition>();
    for (const line of quote.lines) {
      if (line.bundleId === null) continue;
      const composition = await this.bundles.compositionOf(line.bundleId);
      if (composition === null) throw AppError.bundleNotFound();
      compositions.set(line.lineId, composition);
    }
    return compositions;
  }

  /**
   * Removes the cart lines the order covers.
   *
   * A failure here leaves the cart unchanged, which is harmless: the order's own reservation
   * already holds the stock, so the next quote would report the reduced availability.
   */
  private async clearOrderedCartLines(customerId: string, quote: CheckoutQuote): Promise<void> {
    // This operation now joins order creation. Any database failure must roll back the whole unit.
    await this.cartWriter.removeLinesForCustomer(
      customerId,
      quote.lines.map((line) => line.lineId),
    );
  }

  /** Records a refused transition without changing the order's state. */
  private recordRefusedTransition(
    order: OrderRecord,
    attempted: OrderStatusValue,
    actor: OrderActorValue,
    actorUserId: string | null,
  ): Promise<void> {
    this.database.afterRollback(async () => {
      await this.orders.recordEvent(order.id, {
        eventType: 'TRANSITION_REFUSED',
        previousStatus: order.status,
        nextStatus: attempted,
        actor,
        actorUserId,
        externalEventId: null,
        reason: 'TRANSITION_NOT_PERMITTED',
        detail: Prisma.JsonNull,
      });
    });
    return Promise.resolve();
  }
  public async stateCounts(): Promise<readonly { state: string; count: number }[]> {
    return this.orders.stateCounts();
  }
  public async customerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]> {
    return this.orders.customerIdsAfter(cursor, limit);
  }
  public async customerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    return this.orders.customerCounts(ids);
  }
  public async recordIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]> {
    return this.orders.recordIdsForCustomer(customerId, limit);
  }
}

/**
 * The initial pending-payment reservation window, in seconds.
 *
 * The approved decision names a configurable fifteen-minute window, and the Inventory
 * capability's existing default is already fifteen minutes. The value is a constant of this
 * capability as the backwards-compatible default; ORDER_RESERVATION_TTL_SECONDS can override it.
 */
export const ORDER_RESERVATION_TTL_SECONDS = 900;

/**
 * The snapshotted composition of a bundle line.
 *
 * A line that names no bundle stores an empty composition, so the column is never null and a
 * reader never has to distinguish "no bundle" from "no composition".
 */
function toCompositionJson(composition: BundleComposition | undefined): Prisma.InputJsonValue {
  if (composition === undefined) return { lines: [] };
  return {
    bundleId: composition.bundleId,
    kind: composition.kind,
    lines: composition.lines.map((line) => ({
      variantId: line.variantId,
      sku: line.sku,
      quantity: line.quantity,
    })),
  };
}

function toSnapshot(order: OrderRecord, lines: readonly OrderLineRecord[]): OrderSnapshot {
  return {
    id: order.id,
    refundedMinor: order.refundedMinor,
    customerId: order.customerId,
    status: order.status,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    taxTotalMinor: order.taxTotalMinor,
    totalMinor: order.totalMinor,
    destinationCountryCode: order.destinationCountryCode,
    taxJurisdiction: order.taxJurisdiction,
    quoteFingerprint: order.quoteFingerprint,
    reservationId: order.reservationId,
    idempotencyKey: order.idempotencyKey,
    statusReason: order.statusReason,
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    fulfilledAt: order.fulfilledAt,
    lines: lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      bundleId: line.bundleId,
      bundleKind: readBundleKind(line.composition),
      sku: line.sku,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      unitCurrency: line.unitCurrency,
      discountBasisPoints: line.discountBasisPoints,
      taxRateBasisPoints: line.taxRateBasisPoints,
      taxInclusive: line.taxInclusive,
      taxClassification: line.taxClassification,
      netMinor: line.netMinor,
      taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
      composition: readComposition(line.composition),
    })),
  };
}

/** Reads the snapshotted composition of a bundle line. */
function readComposition(
  value: Prisma.JsonValue,
): readonly { variantId: string; sku: string; quantity: number }[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const lines = (value as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  return lines.filter(
    (line): line is { variantId: string; sku: string; quantity: number } =>
      typeof line === 'object' &&
      line !== null &&
      typeof (line as { variantId?: unknown }).variantId === 'string' &&
      typeof (line as { sku?: unknown }).sku === 'string' &&
      typeof (line as { quantity?: unknown }).quantity === 'number',
  );
}

function readBundleKind(value: Prisma.JsonValue): 'FIXED' | 'DYNAMIC' | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value.kind === 'FIXED' || value.kind === 'DYNAMIC' ? value.kind : null;
}
