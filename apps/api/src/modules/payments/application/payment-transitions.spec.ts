import {
  PAYMENT_TRANSITIONS,
  REFUND_TRANSITIONS,
  paymentTransitionPermitted,
  refundTransitionPermitted,
} from './payment-transitions';

/**
 * The payment state machine's unit tests.
 *
 * The permitted transitions are **data**, so the set is one reviewable artifact and the test
 * asserts it directly rather than a copy of it.
 */

describe('the payment state machine', () => {
  it('permits a pending attempt to succeed, fail, or be cancelled', () => {
    expect(PAYMENT_TRANSITIONS.PENDING).toEqual(['SUCCEEDED', 'FAILED', 'CANCELLED']);
    expect(paymentTransitionPermitted('PENDING', 'SUCCEEDED')).toBe(true);
    expect(paymentTransitionPermitted('PENDING', 'FAILED')).toBe(true);
    expect(paymentTransitionPermitted('PENDING', 'CANCELLED')).toBe(true);
  });

  it('permits a succeeded attempt only to be refunded', () => {
    expect(PAYMENT_TRANSITIONS.SUCCEEDED).toEqual(['REFUNDED']);
    expect(paymentTransitionPermitted('SUCCEEDED', 'REFUNDED')).toBe(true);
    expect(paymentTransitionPermitted('SUCCEEDED', 'FAILED')).toBe(false);
  });

  it('makes a failed, a cancelled, and a refunded attempt terminal', () => {
    expect(PAYMENT_TRANSITIONS.FAILED).toEqual([]);
    expect(PAYMENT_TRANSITIONS.CANCELLED).toEqual([]);
    expect(PAYMENT_TRANSITIONS.REFUNDED).toEqual([]);
    expect(paymentTransitionPermitted('FAILED', 'SUCCEEDED')).toBe(false);
    expect(paymentTransitionPermitted('REFUNDED', 'SUCCEEDED')).toBe(false);
  });

  it('permits a pending refund only to succeed or fail', () => {
    expect(REFUND_TRANSITIONS.PENDING).toEqual(['SUCCEEDED', 'FAILED']);
    expect(refundTransitionPermitted('PENDING', 'SUCCEEDED')).toBe(true);
    expect(refundTransitionPermitted('SUCCEEDED', 'FAILED')).toBe(false);
    expect(refundTransitionPermitted('FAILED', 'SUCCEEDED')).toBe(false);
  });
});
