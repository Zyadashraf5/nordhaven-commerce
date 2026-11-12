import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type PaymentProvider,
  type ProviderEvent,
  type ProviderEventVerification,
  type ProviderPaymentRequest,
  type ProviderPaymentResult,
  type ProviderRefundRequest,
  type ProviderRefundResult,
} from '../contracts';

/**
 * The deterministic, non-production test provider.
 *
 * The provider simulates the outcomes the platform must handle - success, failure, timeout, a
 * duplicate delivery, and a delayed delivery - **without contacting any external service and
 * without moving real money**. Every outcome is a deterministic function of the request, so a test
 * states what it expects and gets exactly that.
 *
 * The provider **refuses to operate in a production environment**, so a production request can never
 * collect money through it. The refusal is the mechanism, not a setting: there is no configuration
 * that turns it off.
 */

/** The behaviour a simulated attempt exhibits. */
export type LocalTestBehaviour = 'SUCCESS' | 'FAILURE' | 'TIMEOUT' | 'DUPLICATE' | 'DELAYED';

/** The header the provider reads the simulated behaviour from. */
export const LOCAL_TEST_BEHAVIOUR_HEADER = 'x-local-test-behaviour';

/** The header the provider reads the simulated event type from. */
export const LOCAL_TEST_EVENT_TYPE_HEADER = 'x-local-test-event-type';

/** The header the provider reads the simulated event identifier from. */
export const LOCAL_TEST_EVENT_ID_HEADER = 'x-local-test-event-id';

/** The header the provider reads the simulated order identifier from. */
export const LOCAL_TEST_ORDER_HEADER = 'x-local-test-order-id';

/** The header the provider reads the simulated payment reference from. */
export const LOCAL_TEST_REFERENCE_HEADER = 'x-local-test-provider-reference';

/** The header the provider reads the simulated amount from. */
export const LOCAL_TEST_AMOUNT_HEADER = 'x-local-test-amount-minor';

/** The header the provider reads the simulated currency from. */
export const LOCAL_TEST_CURRENCY_HEADER = 'x-local-test-currency';

/** The header the provider reads the simulated occurrence time from. */
export const LOCAL_TEST_OCCURRED_AT_HEADER = 'x-local-test-occurred-at';

/**
 * The secret the local test provider signs and verifies with.
 *
 * It is a **test** value that is deliberately obvious and worthless, so it can never be mistaken
 * for a credential and can never authenticate anything outside the test environment. The provider
 * refuses to operate in production, so the value is never used there.
 */
export const LOCAL_TEST_SIGNING_SECRET = 'nordhaven-local-test-provider-secret';

const SIGNATURE_HEADER = 'x-local-test-signature';

/**
 * The accepted window for an event's timestamp, in seconds.
 *
 * An event outside the window is stale, because a replayed event from long ago must not be applied
 * as if it were new.
 */
export const LOCAL_TEST_EVENT_WINDOW_SECONDS = 300;

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

function signaturesMatch(expected: string, received: string | undefined): boolean {
  if (received === undefined) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  if (expectedBytes.length !== receivedBytes.length) return false;
  return timingSafeEqual(expectedBytes, receivedBytes);
}

function header(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name];
  return value === undefined ? undefined : value;
}

/**
 * The local test provider.
 *
 * It is a **simulation**, so its results are a function of the request and the headers, and it never
 * reaches a network.
 */
export class LocalTestPaymentProvider implements PaymentProvider {
  public readonly name = 'LOCAL_TEST';

  public constructor(
    private readonly nodeEnv: string,
    private readonly behaviour: LocalTestBehaviour = 'SUCCESS',
  ) {}

  public isAvailable(): boolean {
    // The only shipped provider refuses to operate in production, so a production request can
    // never collect money. There is no configuration that changes this.
    return this.nodeEnv !== 'production';
  }

  /**
   * Creates a pending attempt.
   *
   * The simulation holds no state, so the result is a deterministic function of the request. The
   * method is `async` because the interface it implements is, and because a real provider's
   * equivalent call is.
   */
  public createPayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    if (!this.isAvailable()) return Promise.reject(new Error('Local test provider unavailable'));
    return Promise.resolve({
      providerReference: `local-test-payment-${request.attemptId}`,
      status: 'PENDING',
      detail: { simulated: true },
    });
  }

  /** Captures a created attempt. */
  public capturePayment(request: ProviderPaymentRequest): Promise<ProviderPaymentResult> {
    if (!this.isAvailable()) return Promise.reject(new Error('Local test provider unavailable'));
    if (this.behaviour === 'TIMEOUT')
      return Promise.reject(new Error('Simulated provider timeout'));
    return Promise.resolve({
      providerReference: `local-test-payment-${request.attemptId}`,
      status: this.behaviour === 'FAILURE' ? 'FAILED' : 'SUCCEEDED',
      detail: { simulated: true },
    });
  }

  /** Refunds a captured payment. */
  public refundPayment(request: ProviderRefundRequest): Promise<ProviderRefundResult> {
    if (!this.isAvailable()) return Promise.reject(new Error('Local test provider unavailable'));
    if (this.behaviour === 'TIMEOUT')
      return Promise.reject(new Error('Simulated provider timeout'));
    return Promise.resolve({
      providerReference: `local-test-refund-${request.refundId}`,
      status: this.behaviour === 'FAILURE' ? 'FAILED' : 'SUCCEEDED',
      detail: { simulated: true },
    });
  }

  /**
   * The provider's authoritative state for a payment.
   *
   * The simulation holds no state, so it reports the payment as succeeded whenever it is asked about
   * one. The reconciliation compares that with the platform's own record, which is how a difference
   * between the two is found.
   */
  public lookupPayment(providerReference: string): Promise<ProviderPaymentResult | null> {
    if (!this.isAvailable()) return Promise.reject(new Error('Local test provider unavailable'));
    return Promise.resolve({
      providerReference,
      status:
        this.behaviour === 'FAILURE'
          ? 'FAILED'
          : this.behaviour === 'DELAYED'
            ? 'PENDING'
            : 'SUCCEEDED',
      detail: { simulated: true },
    });
  }

  /**
   * Verifies a delivered event.
   *
   * The signature is checked over the **raw body**, before the body is parsed, so a body that was
   * altered after signing is refused. The timestamp is checked against the accepted window, and the
   * identifier is required, because it is what makes the delivery deduplicated.
   */
  public verifyEvent(
    rawBody: string,
    headers: Readonly<Record<string, string | undefined>>,
  ): ProviderEventVerification {
    if (!this.isAvailable()) return { verified: false, reason: 'PROVIDER_UNAVAILABLE' };
    const signature = header(headers, SIGNATURE_HEADER);
    if (signature === undefined) {
      return { verified: false, reason: 'SIGNATURE_MISSING' };
    }
    if (!signaturesMatch(sign(rawBody, headers), signature)) {
      return { verified: false, reason: 'SIGNATURE_INVALID' };
    }

    const eventId = header(headers, LOCAL_TEST_EVENT_ID_HEADER);
    if (eventId === undefined || eventId.trim().length === 0 || eventId.length > 200) {
      return { verified: false, reason: 'EVENT_ID_MISSING' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { verified: false, reason: 'BODY_NOT_JSON' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { verified: false, reason: 'BODY_NOT_AN_OBJECT' };
    }

    const occurredAtRaw = header(headers, LOCAL_TEST_OCCURRED_AT_HEADER);
    if (occurredAtRaw === undefined) return { verified: false, reason: 'OCCURRED_AT_INVALID' };
    const occurredAt = new Date(occurredAtRaw);
    if (Number.isNaN(occurredAt.getTime())) {
      return { verified: false, reason: 'OCCURRED_AT_INVALID' };
    }
    const ageSeconds = Math.abs(Date.now() - occurredAt.getTime()) / 1000;
    if (ageSeconds > LOCAL_TEST_EVENT_WINDOW_SECONDS) {
      return { verified: false, reason: 'EVENT_STALE' };
    }

    const amountRaw = header(headers, LOCAL_TEST_AMOUNT_HEADER);
    const amountMinor = amountRaw === undefined ? null : Number(amountRaw);
    if (
      amountRaw !== undefined &&
      (amountMinor === null ||
        !Number.isSafeInteger(amountMinor) ||
        amountMinor < 0 ||
        !/^\d+$/.test(amountRaw))
    ) {
      return { verified: false, reason: 'AMOUNT_INVALID' };
    }

    const orderId = header(headers, LOCAL_TEST_ORDER_HEADER);
    if (
      orderId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
    ) {
      return { verified: false, reason: 'ORDER_ID_INVALID' };
    }
    const currency = header(headers, LOCAL_TEST_CURRENCY_HEADER);
    if (currency !== undefined && !/^[A-Z]{3}$/.test(currency))
      return { verified: false, reason: 'CURRENCY_INVALID' };
    const event: ProviderEvent = {
      providerEventId: eventId.trim(),
      type: header(headers, LOCAL_TEST_EVENT_TYPE_HEADER) ?? 'payment.succeeded',
      orderId: header(headers, LOCAL_TEST_ORDER_HEADER) ?? null,
      providerReference: header(headers, LOCAL_TEST_REFERENCE_HEADER) ?? null,
      amountMinor,
      currency: header(headers, LOCAL_TEST_CURRENCY_HEADER) ?? null,
      occurredAt,
      detail: { simulated: true },
    };
    return { verified: true, event };
  }
}
