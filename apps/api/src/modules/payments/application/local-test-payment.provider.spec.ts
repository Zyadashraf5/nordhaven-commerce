import {
  LOCAL_TEST_AMOUNT_HEADER,
  LOCAL_TEST_CURRENCY_HEADER,
  LOCAL_TEST_EVENT_ID_HEADER,
  LOCAL_TEST_EVENT_TYPE_HEADER,
  LOCAL_TEST_OCCURRED_AT_HEADER,
  LOCAL_TEST_ORDER_HEADER,
  LOCAL_TEST_REFERENCE_HEADER,
  LOCAL_TEST_SIGNING_SECRET,
  LocalTestPaymentProvider,
} from './local-test-payment.provider';
import { createHmac } from 'node:crypto';

/**
 * The local test provider's unit tests.
 *
 * The provider is the platform's only shipped payment provider, so its safety properties are
 * proven here without a database: it refuses to operate in production, it verifies a signature
 * before it trusts a body, it refuses a stale event, and it never reaches a network.
 */

function sign(body: string, headers: Readonly<Record<string, string | undefined>>): string {
  const metadata = [
    'x-local-test-event-id',
    'x-local-test-event-type',
    'x-local-test-order-id',
    'x-local-test-provider-reference',
    'x-local-test-amount-minor',
    'x-local-test-currency',
    'x-local-test-occurred-at',
  ].map((name) => headers[name] ?? null);
  return createHmac('sha256', LOCAL_TEST_SIGNING_SECRET)
    .update(JSON.stringify([body, ...metadata]), 'utf8')
    .digest('hex');
}

const BODY = JSON.stringify({ reference: 'local-1' });
let fixtureOccurredAt = '';
beforeEach(() => {
  fixtureOccurredAt = new Date().toISOString();
});

describe('the local test payment provider', () => {
  describe('its availability', () => {
    it('operates outside production', () => {
      expect(new LocalTestPaymentProvider('test').isAvailable()).toBe(true);
      expect(new LocalTestPaymentProvider('development').isAvailable()).toBe(true);
    });

    it('refuses to operate in production', () => {
      expect(new LocalTestPaymentProvider('production').isAvailable()).toBe(false);
    });
  });

  describe('its event verification', () => {
    const provider = new LocalTestPaymentProvider('test');

    it('accepts a correctly signed event', () => {
      const verification = provider.verifyEvent(BODY, {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_EVENT_TYPE_HEADER]: 'payment.succeeded',
        [LOCAL_TEST_ORDER_HEADER]: '11111111-1111-4111-8111-111111111111',
        [LOCAL_TEST_REFERENCE_HEADER]: 'reference-1',
        [LOCAL_TEST_AMOUNT_HEADER]: '148086',
        [LOCAL_TEST_CURRENCY_HEADER]: 'EGP',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        'x-local-test-signature': sign(BODY, {
          [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
          [LOCAL_TEST_EVENT_TYPE_HEADER]: 'payment.succeeded',
          [LOCAL_TEST_ORDER_HEADER]: '11111111-1111-4111-8111-111111111111',
          [LOCAL_TEST_REFERENCE_HEADER]: 'reference-1',
          [LOCAL_TEST_AMOUNT_HEADER]: '148086',
          [LOCAL_TEST_CURRENCY_HEADER]: 'EGP',
          [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        }),
      });

      expect(verification.verified).toBe(true);
      if (!verification.verified) return;
      expect(verification.event).toMatchObject({
        providerEventId: 'event-1',
        type: 'payment.succeeded',
        orderId: '11111111-1111-4111-8111-111111111111',
        providerReference: 'reference-1',
        amountMinor: 148086,
        currency: 'EGP',
      });
    });

    it('refuses an event with no signature', () => {
      const verification = provider.verifyEvent(BODY, {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
      });

      expect(verification).toEqual({ verified: false, reason: 'SIGNATURE_MISSING' });
    });

    it('refuses an event with a wrong signature', () => {
      const verification = provider.verifyEvent(BODY, {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        'x-local-test-signature': '0'.repeat(64),
      });

      expect(verification).toEqual({ verified: false, reason: 'SIGNATURE_INVALID' });
    });

    it('refuses an event whose body was altered after it was signed', () => {
      const verification = provider.verifyEvent(JSON.stringify({ reference: 'altered' }), {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        'x-local-test-signature': sign(BODY, {
          [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
          [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        }),
      });

      expect(verification).toEqual({ verified: false, reason: 'SIGNATURE_INVALID' });
    });

    it('refuses an event with no identifier', () => {
      const verification = provider.verifyEvent(BODY, {
        [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        'x-local-test-signature': sign(BODY, {
          [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        }),
      });

      expect(verification).toEqual({ verified: false, reason: 'EVENT_ID_MISSING' });
    });

    it('refuses an event that is not JSON', () => {
      const body = 'not json';
      const verification = provider.verifyEvent(body, {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        'x-local-test-signature': sign(body, {
          [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
          [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        }),
      });

      expect(verification).toEqual({ verified: false, reason: 'BODY_NOT_JSON' });
    });

    it('refuses an event that is not an object', () => {
      const body = '[]';
      const verification = provider.verifyEvent(body, {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        'x-local-test-signature': sign(body, {
          [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
          [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
        }),
      });

      expect(verification).toEqual({ verified: false, reason: 'BODY_NOT_AN_OBJECT' });
    });

    it('refuses a stale event', () => {
      const stale = new Date(Date.now() - 3_600_000).toISOString();
      const verification = provider.verifyEvent(BODY, {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: stale,
        'x-local-test-signature': sign(BODY, {
          [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
          [LOCAL_TEST_OCCURRED_AT_HEADER]: stale,
        }),
      });

      expect(verification).toEqual({ verified: false, reason: 'EVENT_STALE' });
    });

    it('refuses an event whose occurrence time is not a date', () => {
      const verification = provider.verifyEvent(BODY, {
        [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
        [LOCAL_TEST_OCCURRED_AT_HEADER]: 'not-a-date',
        'x-local-test-signature': sign(BODY, {
          [LOCAL_TEST_EVENT_ID_HEADER]: 'event-1',
          [LOCAL_TEST_OCCURRED_AT_HEADER]: 'not-a-date',
        }),
      });

      expect(verification).toEqual({ verified: false, reason: 'OCCURRED_AT_INVALID' });
    });
  });

  describe('its simulated results', () => {
    const provider = new LocalTestPaymentProvider('test');

    it('creates a pending attempt deterministically', async () => {
      const request = {
        attemptId: 'attempt-1',
        orderId: '11111111-1111-4111-8111-111111111111',
        amountMinor: 148086,
        currency: 'EGP',
        idempotencyKey: 'key-1',
      };

      const first = await provider.createPayment(request);
      const second = await provider.createPayment(request);

      expect(first).toEqual(second);
      expect(first.providerReference).toBe('local-test-payment-attempt-1');
      expect(first.status).toBe('PENDING');
    });

    it('captures an attempt as succeeded deterministically', async () => {
      const request = {
        attemptId: 'attempt-1',
        orderId: '11111111-1111-4111-8111-111111111111',
        amountMinor: 148086,
        currency: 'EGP',
        idempotencyKey: 'key-1',
      };

      const result = await provider.capturePayment(request);
      expect(result.status).toBe('SUCCEEDED');
    });

    it('refunds deterministically', async () => {
      const request = {
        refundId: 'refund-1',
        providerReference: 'local-test-payment-attempt-1',
        amountMinor: 148086,
        currency: 'EGP',
        idempotencyKey: 'key-1',
      };

      const result = await provider.refundPayment(request);
      expect(result.status).toBe('SUCCEEDED');
      expect(result.providerReference).toBe('local-test-refund-refund-1');
    });
  });
});

describe('independent provider safety regressions', () => {
  const body = '{ "reference": "raw bytes retained" }';
  function validHeaders(): Record<string, string> {
    const headers = {
      [LOCAL_TEST_EVENT_ID_HEADER]: 'security-event',
      [LOCAL_TEST_EVENT_TYPE_HEADER]: 'payment.succeeded',
      [LOCAL_TEST_ORDER_HEADER]: '11111111-1111-4111-8111-111111111111',
      [LOCAL_TEST_REFERENCE_HEADER]: 'reference',
      [LOCAL_TEST_AMOUNT_HEADER]: '100',
      [LOCAL_TEST_CURRENCY_HEADER]: 'EGP',
      [LOCAL_TEST_OCCURRED_AT_HEADER]: fixtureOccurredAt,
    };
    return { ...headers, 'x-local-test-signature': sign(body, headers) };
  }
  it.each([
    LOCAL_TEST_EVENT_ID_HEADER,
    LOCAL_TEST_EVENT_TYPE_HEADER,
    LOCAL_TEST_ORDER_HEADER,
    LOCAL_TEST_REFERENCE_HEADER,
    LOCAL_TEST_AMOUNT_HEADER,
    LOCAL_TEST_CURRENCY_HEADER,
    LOCAL_TEST_OCCURRED_AT_HEADER,
  ])('authenticates metadata %s along with the exact raw body', (name) => {
    const headers = validHeaders();
    expect(new LocalTestPaymentProvider('test').verifyEvent(body, headers).verified).toBe(true);
    headers[name] = 'changed';
    expect(new LocalTestPaymentProvider('test').verifyEvent(body, headers)).toEqual({
      verified: false,
      reason: 'SIGNATURE_INVALID',
    });
  });
  it('requires an authenticated occurrence time', () => {
    const headers = validHeaders();
    delete headers[LOCAL_TEST_OCCURRED_AT_HEADER];
    headers['x-local-test-signature'] = sign(body, headers);
    expect(new LocalTestPaymentProvider('test').verifyEvent(body, headers)).toEqual({
      verified: false,
      reason: 'OCCURRED_AT_INVALID',
    });
  });
  it.each(['1x', '-1', '1.2', '9007199254740992'])(
    'rejects a malformed or unsafe amount %s',
    (amount) => {
      const headers = validHeaders();
      headers[LOCAL_TEST_AMOUNT_HEADER] = amount;
      headers['x-local-test-signature'] = sign(body, headers);
      expect(new LocalTestPaymentProvider('test').verifyEvent(body, headers)).toEqual({
        verified: false,
        reason: 'AMOUNT_INVALID',
      });
    },
  );
  it('refuses every simulated financial operation and signed event in production', async () => {
    const provider = new LocalTestPaymentProvider('production');
    const payment = {
      attemptId: 'a',
      orderId: 'o',
      amountMinor: 100,
      currency: 'EGP',
      idempotencyKey: 'k',
    };
    await expect(provider.createPayment(payment)).rejects.toThrow('unavailable');
    await expect(provider.capturePayment(payment)).rejects.toThrow('unavailable');
    await expect(
      provider.refundPayment({
        refundId: 'r',
        providerReference: 'p',
        amountMinor: 100,
        currency: 'EGP',
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow('unavailable');
    await expect(provider.lookupPayment('p')).rejects.toThrow('unavailable');
    expect(provider.verifyEvent(body, validHeaders())).toEqual({
      verified: false,
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('explicit non-production simulation scenarios', () => {
  const request = {
    attemptId: 'scenario',
    orderId: 'order',
    amountMinor: 100,
    currency: 'EGP',
    idempotencyKey: 'scenario',
  };
  it('simulates definitive provider failure without external calls', async () => {
    expect(
      (await new LocalTestPaymentProvider('test', 'FAILURE').capturePayment(request)).status,
    ).toBe('FAILED');
  });
  it('simulates an unknown timeout outcome', async () => {
    await expect(
      new LocalTestPaymentProvider('test', 'TIMEOUT').capturePayment(request),
    ).rejects.toThrow('Simulated provider timeout');
  });
  it('keeps delayed attempts pending until an explicit completion event', async () => {
    const provider = new LocalTestPaymentProvider('test', 'DELAYED');
    const pending = await provider.createPayment(request);
    expect(pending.status).toBe('PENDING');
    expect((await provider.lookupPayment(pending.providerReference))?.status).toBe('PENDING');
  });
  it('makes duplicate simulated creation return the same provider reference', async () => {
    const provider = new LocalTestPaymentProvider('test', 'DUPLICATE');
    expect(await provider.createPayment(request)).toEqual(await provider.createPayment(request));
  });
});
