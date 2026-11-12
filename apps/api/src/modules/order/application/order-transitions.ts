import type { OrderStatusValue } from '../persistence/order.repository';

/**
 * The order state machine.
 *
 * The permitted transitions are **data** rather than a `switch` inside the service, so the
 * permitted set is one reviewable table and the transition check reads it. Every transition the
 * platform performs is recorded against the same table, so the rule and the audit trail cannot
 * disagree.
 *
 * The states are:
 *
 * - `PENDING_PAYMENT` - the order exists, its stock is held, and the customer has not paid.
 * - `PAID` - the payment was recorded and the stock was confirmed as allocated.
 * - `PAID_PENDING_ALLOCATION` - the payment arrived but the reservation was already gone, so the
 *   money is recorded and the stock is **not** allocated. The discrepancy is recorded as an event
 *   and resolved by reconciliation.
 * - `PAYMENT_FAILED` - the payment attempt failed and the hold was released.
 * - `CANCELLED` - the customer or an administrator cancelled the order.
 * - `EXPIRED` - the payment window lapsed before the customer paid.
 * - `FULFILLED` - the order was fulfilled.
 */

/** The transitions the order may make, keyed by the state the order is in. */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatusValue, readonly OrderStatusValue[]>> = {
  PENDING_PAYMENT: ['PAID', 'PAID_PENDING_ALLOCATION', 'PAYMENT_FAILED', 'CANCELLED', 'EXPIRED'],
  PAID: ['FULFILLED', 'REFUNDED'],
  PAID_PENDING_ALLOCATION: ['REFUNDED'],
  PAYMENT_FAILED: [],
  CANCELLED: [],
  EXPIRED: ['PAID_PENDING_ALLOCATION'],
  FULFILLED: ['REFUNDED'],
  REFUNDED: [],
};

/** True when the order may move from one state to another. */
export function transitionPermitted(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** The states an order may no longer leave, because they are terminal. */
export function isTerminal(status: OrderStatusValue): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

/**
 * True when the order still holds its reservation.
 *
 * Only a `PENDING_PAYMENT` order holds stock. Every other state means the hold was confirmed,
 * released, or expired, so a later payment must not report the stock as allocated.
 */
export function holdsReservation(status: OrderStatusValue): boolean {
  return status === 'PENDING_PAYMENT';
}
