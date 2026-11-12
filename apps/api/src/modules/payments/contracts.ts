/**
 * The payment provider abstraction.
 *
 * The platform's payment behaviour is written against this interface, and every provider-specific
 * type is confined to the adapter that implements it. A provider's own vocabulary never becomes a
 * core domain model, so a new provider is an adapter rather than a change to the payment rules.
 */

/** The states a payment attempt may hold. */
export type PaymentStatusValue = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

/** The states a refund may hold. */
export type RefundStatusValue = 'PENDING' | 'SUCCEEDED' | 'FAILED';

/** What the platform asks a provider to do. */
export type PaymentProviderOperation = 'CREATE_PAYMENT' | 'CAPTURE_PAYMENT' | 'REFUND_PAYMENT';

/** A request to create a payment attempt with the provider. */
export interface ProviderPaymentRequest {
  /** The platform's own identifier for the attempt. */
  readonly attemptId: string;
  /** The order the attempt pays for. */
  readonly orderId: string;
  /** The exact integer minor units the attempt covers. */
  readonly amountMinor: number;
  /** The settlement currency. */
  readonly currency: string;
  /** The stable business key, so a repeated request creates one attempt at the provider. */
  readonly idempotencyKey: string;
}

/** A request to refund a payment with the provider. */
export interface ProviderRefundRequest {
  /** The platform's own identifier for the refund. */
  readonly refundId: string;
  /** The provider's reference for the payment being refunded. */
  readonly providerReference: string;
  /** The exact integer minor units the refund covers. */
  readonly amountMinor: number;
  /** The settlement currency. */
  readonly currency: string;
  /** The stable business key, so a repeated request refunds once. */
  readonly idempotencyKey: string;
}

/** What the provider answered. */
export interface ProviderPaymentResult {
  /** The provider's own reference for the attempt, which the platform stores. */
  readonly providerReference: string;
  /** The state the provider considers the attempt to be in. */
  readonly status: PaymentStatusValue;
  /** The non-sensitive detail of the result. */
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** What the provider answered about a refund. */
export interface ProviderRefundResult {
  readonly providerReference: string;
  readonly status: RefundStatusValue;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * One event a provider delivered.
 *
 * The platform never trusts the body before the adapter has verified it, so the verification
 * outcome is part of the event rather than a separate step the caller could forget.
 */
export interface ProviderEvent {
  /** The provider's own identifier for the event. */
  readonly providerEventId: string;
  /** The provider's own type name, which the adapter maps to the platform's vocabulary. */
  readonly type: string;
  /** The order the event refers to, when the adapter could resolve one. */
  readonly orderId: string | null;
  /** The provider's reference for the payment the event refers to, when the adapter could resolve one. */
  readonly providerReference: string | null;
  /** The exact integer minor units the event covers, when it carries one. */
  readonly amountMinor: number | null;
  /** The settlement currency, when the event carries one. */
  readonly currency: string | null;
  /** When the provider says the event happened. */
  readonly occurredAt: Date;
  /** The non-sensitive detail of the event. */
  readonly detail: Readonly<Record<string, unknown>>;
}

/** The outcome of verifying a delivered event. */
export type ProviderEventVerification =
  | { readonly verified: true; readonly event: ProviderEvent }
  | { readonly verified: false; readonly reason: string };

/**
 * A payment provider.
 *
 * The interface is deliberately small: the platform creates an attempt, captures it, refunds it,
 * and receives verified events. Everything else about a provider is the adapter's business.
 */
export interface PaymentProvider {
  /** The provider's own name, which the platform stores on every attempt. */
  readonly name: string;
  /**
   * True when the provider may operate.
   *
   * The shipped test adapter refuses to operate in a production environment, so a production
   * request can never collect money.
   */
  isAvailable(): boolean;
  /** Creates a payment attempt with the provider. */
  createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  /** Captures a created attempt. */
  capturePayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult>;
  /** Refunds a captured payment. */
  refundPayment(request: ProviderRefundRequest): Promise<ProviderRefundResult>;
  /**
   * Verifies a delivered event.
   *
   * The adapter checks the signature, the timestamp, and the shape, and returns the platform's
   * vocabulary. An event that fails any check is refused, and the platform changes nothing.
   */
  verifyEvent(
    rawBody: string,
    headers: Readonly<Record<string, string | undefined>>,
  ): ProviderEventVerification;
  /**
   * The provider's authoritative state for a payment.
   *
   * The reconciliation asks the provider, so the provider's record - and not a client callback - is
   * what establishes the truth.
   */
  lookupPayment(providerReference: string): Promise<ProviderPaymentResult | null>;
}

/** The injection token the Payments capability publishes its provider registry under. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

// ---------------------------------------------------------------------------------------------
// The refund contract.
//
// A refund is a money movement, so the Payments capability owns it: the cumulative refund limit,
// the idempotency key, and the provider call all belong here. Another capability that must refund
// money - the Shipping capability, when a received return is refunded - asks for it through this
// contract rather than writing the payment rows itself.
// ---------------------------------------------------------------------------------------------

/** A request to refund an order's payment. */
export interface OrderRefundRequest {
  /** The order whose payment is refunded. */
  readonly orderId: string;
  /** The customer the refund belongs to. */
  readonly customerId: string;
  /** The exact integer minor units the refund covers. */
  readonly amountMinor: number;
  /** Why the money is returned, recorded on the refund. */
  readonly reason: string;
  /** The stable business key, so a repeated request refunds exactly once. */
  readonly idempotencyKey: string;
  /** The administrator who caused the refund, when one did. */
  readonly actorUserId?: string | null;
}

/** The outcome of a refund request. */
export interface OrderRefundOutcome {
  readonly refundId: string;
  readonly status: RefundStatusValue;
  readonly amountMinor: number;
  readonly currency: string;
}

/**
 * Refunds an order's payment.
 *
 * The attempt is resolved by the Payments capability, so a caller never has to know which attempt
 * paid the order, and the cumulative refund limit is applied before any money moves.
 */
export interface PaymentRefunds {
  refundOrder(request: OrderRefundRequest): Promise<OrderRefundOutcome>;
}

/** The injection token the Payments capability publishes its refund contract under. */
export const PAYMENT_REFUNDS = Symbol('PAYMENT_REFUNDS');

/** The money the platform holds, as an exact count of minor units. */
export interface PaymentFinancialSummary {
  /** The total amount the successful payments collected. */
  readonly collectedMinor: number;
  /** The total amount the succeeded refunds returned. */
  readonly refundedMinor: number;
  /** The total amount the pending refunds have reserved. */
  readonly pendingRefundMinor: number;
  /** The number of attempts, by state. */
  readonly attempts: Readonly<Record<string, number>>;
  /** The number of refunds, by state. */
  readonly refunds: Readonly<Record<string, number>>;
  /** The settlement currency every amount is counted in. */
  readonly currency: string;
}

/** One payment attempt, as the administrative surface reads it. */
export interface PaymentAttemptSummary {
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly status: PaymentStatusValue;
  readonly amountMinor: number;
  readonly currency: string;
  readonly provider: string;
  readonly createdAt: Date;
}

/**
 * The Payments capability's administrative contract.
 *
 * The financial operations read the platform's own money through this contract, so the
 * administrative surface never reaches into the Payments capability's tables and never computes a
 * total from a row it read itself.
 */
export interface PaymentOperations {
  /** The money the platform holds. */
  financialSummary(): Promise<PaymentFinancialSummary>;
  /** Every payment attempt, newest first. */
  listAll(limit: number): Promise<readonly PaymentAttemptSummary[]>;
}

/** The injection token the Payments capability publishes its operations contract under. */
export const PAYMENT_OPERATIONS = Symbol('PAYMENT_OPERATIONS');
