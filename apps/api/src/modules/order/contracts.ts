/**
 * The Orders capability's published contract.
 *
 * The Milestone 10 Payments capability consumes it to record a verified payment against an order
 * and to advance the order's state. It never reaches into the Orders capability's tables, and the
 * Orders capability does not depend on the Payments capability, so the two do not form a cycle.
 */

/** The states an order may hold. */
export type OrderStatusValue =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PAID_PENDING_ALLOCATION'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FULFILLED'
  | 'REFUNDED';

/** Who caused a transition. */
export type OrderActorValue = 'CUSTOMER' | 'ADMIN' | 'SYSTEM';

/** One order line, as the Orders capability persists it. */
export interface OrderLineSnapshot {
  /** Historical bundle kind from the immutable composition, never the current catalog. */
  readonly bundleKind?: 'FIXED' | 'DYNAMIC' | null;
  readonly id: string;
  readonly variantId: string | null;
  readonly bundleId: string | null;
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
  /** The snapshotted bundle composition, when the line names a bundle. */
  readonly composition: readonly {
    readonly variantId: string;
    readonly sku: string;
    readonly quantity: number;
  }[];
}

/** One order, as the Orders capability persists it. */
export interface OrderSnapshot {
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
  readonly lines: readonly OrderLineSnapshot[];
}

/** A request to record a verified payment against an order. */
export interface OrderSettlementRequest {
  /** The order the payment settles. */
  readonly orderId: string;
  /** The Payments capability's own reference for the payment. */
  readonly paymentReference: string;
  /** The amount the payment covered, in exact integer minor units. */
  readonly amountMinor: number;
  readonly currency: string;
  /** The idempotency key of the payment event, so a repeated event is applied once. */
  readonly eventId: string;
}

/** The outcome of recording a verified payment. */
export interface OrderSettlementResult {
  /** The order's state after the event was applied. */
  readonly status: OrderStatusValue;
  /** True when the payment covered the order's full amount. */
  readonly fullySettled: boolean;
  /** True when the order's stock was confirmed as a result. */
  readonly stockAllocated: boolean;
  /** The reason the order did not reach `PAID`, when it did not. */
  readonly reason: string | null;
}

/** A request to record a failed payment against an order. */
export interface OrderFailureRequest {
  /** The order the failure refers to. */
  readonly orderId: string;
  /** The Payments capability's own reference for the failed payment. */
  readonly paymentReference: string;
  /** The reason the payment failed. */
  readonly reason: string;
  /** The idempotency key of the payment event, so a repeated event is applied once. */
  readonly eventId: string;
}

/** The outcome of recording a failed payment. */
export interface OrderFailureResult {
  /** The order's state after the event was applied. */
  readonly status: OrderStatusValue;
  /** True when the order's held stock was released. */
  readonly stockReleased: boolean;
  /** The reason the order did not change, when it did not. */
  readonly reason: string | null;
}

/**
 * The Orders capability's published contract.
 *
 * The Payments capability records a verified payment through it, and the capability itself
 * publishes the order so the administrative surface can read one.
 */
export interface OrderLedger {
  stateCounts(): Promise<readonly { state: string; count: number }[]>;
  customerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]>;
  customerCounts(ids: readonly string[]): Promise<readonly { customerId: string; count: number }[]>;
  recordIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]>;

  recordRefund(input: {
    orderId: string;
    refundId: string;
    amountMinor: number;
    cumulativeMinor: number;
  }): Promise<void>;
  /** Reads one order by its identifier. */
  findOrderById(orderId: string): Promise<OrderSnapshot | null>;
  /**
   * Every order, newest first.
   *
   * The administrative surface reads the orders through this contract, so it never reaches into the
   * Orders capability's tables.
   */
  listAll(limit: number): Promise<readonly OrderSnapshot[]>;
  /** The orders of one customer, newest first. */
  listForCustomerOf(customerId: string, limit: number): Promise<readonly OrderSnapshot[]>;
  /**
   * The customer's orders that have been paid, newest first.
   *
   * Another capability that must know whether a customer bought something - the Reviews capability,
   * when it decides whether a review is a verified purchase - asks through this contract rather
   * than reading the Orders capability's tables.
   */
  paidOrdersOf(customerId: string): Promise<readonly OrderSnapshot[]>;
  purchaseForProduct(customerId: string, productId: string): Promise<OrderSnapshot | null>;
  /**
   * Records a verified payment against an order and advances its state.
   *
   * The event is idempotent on the payment event's identifier, so a repeated or a delayed webhook
   * cannot apply the same payment twice. A payment that arrives after the order's reservation has
   * lapsed does **not** report the stock as allocated.
   */
  settlePayment(request: OrderSettlementRequest): Promise<OrderSettlementResult>;
  /**
   * Records a failed payment against an order and releases its held stock.
   *
   * The release is idempotent, so a failure event delivered twice releases the stock once.
   */
  failPayment(request: OrderFailureRequest): Promise<OrderFailureResult>;
}

/** The injection token the Orders capability publishes its ledger under. */
export const ORDER_LEDGER = Symbol('ORDER_LEDGER');
