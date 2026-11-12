import type { PaymentStatusValue, RefundStatusValue } from '../contracts';

/**
 * The payment state machines.
 *
 * The permitted transitions are **data** rather than a `switch` inside the service, so the permitted
 * set is one reviewable artifact that the transition check reads and the audit trail cannot
 * disagree with.
 *
 * The payment attempt's states are:
 *
 * - `PENDING` - the attempt exists and the provider has not answered.
 * - `SUCCEEDED` - the payment was recorded and the order was advanced.
 * - `FAILED` - the payment attempt failed.
 * - `CANCELLED` - the attempt was cancelled.
 * - `REFUNDED` - the refunds cover the whole amount that was paid.
 *
 * The refund's states are `PENDING`, `SUCCEEDED`, and `FAILED`.
 */

/** The transitions a payment attempt may make, keyed by the state the attempt is in. */
export const PAYMENT_TRANSITIONS: Readonly<
  Record<PaymentStatusValue, readonly PaymentStatusValue[]>
> = {
  PENDING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** The transitions a refund may make, keyed by the state the refund is in. */
export const REFUND_TRANSITIONS: Readonly<Record<RefundStatusValue, readonly RefundStatusValue[]>> =
  {
    PENDING: ['SUCCEEDED', 'FAILED'],
    SUCCEEDED: [],
    FAILED: [],
  };

/** True when the attempt may move from one state to another. */
export function paymentTransitionPermitted(
  from: PaymentStatusValue,
  to: PaymentStatusValue,
): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** True when the refund may move from one state to another. */
export function refundTransitionPermitted(from: RefundStatusValue, to: RefundStatusValue): boolean {
  return REFUND_TRANSITIONS[from].includes(to);
}
