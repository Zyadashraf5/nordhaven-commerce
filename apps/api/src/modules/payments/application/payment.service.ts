import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../platform/database/database.service';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../platform/http/app-error';
import { ORDER_LEDGER, type OrderLedger } from '../../order';
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderEvent } from '../contracts';
import { paymentTransitionPermitted } from './payment-transitions';
import {
  type PaymentAttemptRecord,
  type RefundRecord,
  PaymentIdempotencyConflictError,
  PaymentAttemptNotFoundError,
  PaymentRepository,
  RefundExceedsPaymentError,
} from '../persistence/payment.repository';

/** The provider event types the platform understands. */
const EVENT_PAYMENT_SUCCEEDED = 'payment.succeeded';
const EVENT_PAYMENT_FAILED = 'payment.failed';

/**
 * The payment lifecycle.
 *
 * The service owns the rules; the repository owns the atomicity. Every amount is an exact integer
 * count of minor units, and a provider event is applied only after the provider has **verified** it.
 */
@Injectable()
export class PaymentService {
  public constructor(
    private readonly payments: PaymentRepository,
    private readonly database: DatabaseService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(ORDER_LEDGER) private readonly orders: OrderLedger,
  ) {}

  /**
   * Creates a payment attempt for an order.
   *
   * The attempt is **idempotent** on the customer's business key, so a repeated request returns the
   * attempt the first one created and the provider is asked to create one attempt, not two.
   */
  public async createAttempt(input: {
    readonly customerId: string;
    readonly orderId: string;
    readonly idempotencyKey: string;
  }): Promise<PaymentAttemptRecord> {
    this.requireAvailableProvider();
    const created = await this.database.transaction(async () => {
      await this.database.lock(`payment-key:${input.customerId}:${input.idempotencyKey}`);
      await this.database.lock(`order:${input.orderId}`);
      const existing = await this.payments.findAttemptByIdempotencyKey(
        input.customerId,
        input.idempotencyKey,
      );
      if (existing !== null) {
        if (existing.orderId !== input.orderId)
          throw AppError.paymentNotPayable('IDEMPOTENCY_KEY_REUSED');
        return existing;
      }
      const order = await this.orders.findOrderById(input.orderId);
      if (order === null || order.customerId !== input.customerId) throw AppError.orderNotFound();
      if (order.status !== 'PENDING_PAYMENT') throw AppError.paymentNotPayable(order.status);
      const attempts = await this.payments.listAttemptsForOrder(order.id);
      if (
        attempts.some((attempt) => attempt.status === 'PENDING' || attempt.status === 'SUCCEEDED')
      ) {
        throw AppError.paymentNotPayable('PAYMENT_IN_PROGRESS');
      }
      return this.payments.createAttempt({
        orderId: input.orderId,
        customerId: input.customerId,
        status: 'PENDING',
        amountMinor: order.totalMinor,
        currency: order.currency,
        provider: this.provider.name,
        providerReference: null,
        idempotencyKey: input.idempotencyKey,
      });
    });
    if (created.status !== 'PENDING' || created.providerReference !== null) return created;
    // A provider timeout leaves a durable pending intent. Retry the same provider operation key.
    const result = await this.provider.createPayment({
      attemptId: created.id,
      orderId: created.orderId,
      amountMinor: created.amountMinor,
      currency: created.currency,
      idempotencyKey: `payment:${created.id}`,
    });
    return (
      (await this.payments.transitionAttempt(created.id, 'PENDING', 'PENDING', {
        providerReference: result.providerReference,
      })) ?? created
    );
  }

  /**
   * Verifies and applies a delivered provider event.
   *
   * The verification happens **before** anything changes, and the event is recorded whatever the
   * outcome, so a rejected, a duplicated, or an unknown event is auditable. A provider the platform
   * has no adapter for is refused, because the platform has no verification rule for it.
   */
  public async handleProviderEvent(
    provider: string,
    rawBody: string,
    headers: Readonly<Record<string, string | undefined>>,
  ): Promise<
    | { readonly verified: true; readonly result: string }
    | { readonly verified: false; readonly reason: string }
  > {
    if (!this.provider.isAvailable()) return { verified: false, reason: 'PROVIDER_UNAVAILABLE' };
    if (provider !== this.provider.name) {
      await this.payments.recordProviderEvent({
        provider,
        providerEventId: `unverified-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        eventType: 'unknown',
        outcome: 'REJECTED',
        orderId: null,
        paymentAttemptId: null,
        reason: 'UNKNOWN_PROVIDER',
        detail: { provider },
      });
      return { verified: false, reason: 'UNKNOWN_PROVIDER' };
    }

    const verification = this.provider.verifyEvent(rawBody, headers);
    if (!verification.verified) {
      await this.payments.recordProviderEvent({
        provider,
        providerEventId: `unverified-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        eventType: 'unverified',
        outcome: 'REJECTED',
        orderId: null,
        paymentAttemptId: null,
        reason: verification.reason,
        detail: { provider },
      });
      return { verified: false, reason: verification.reason };
    }

    const applied = await this.applyProviderEvent(verification.event);
    return { verified: true, result: applied.outcome };
  }

  /**
   * Applies a **verified** provider event.
   *
   * The event is deduplicated on the provider's own identifier, so a repeated, a delayed, or an
   * out-of-order delivery applies exactly once. The event is recorded whatever the outcome, so a
   * rejected or a duplicated delivery is auditable.
   */
  public async applyProviderEvent(
    event: ProviderEvent,
  ): Promise<{ readonly outcome: string; readonly attemptId: string | null }> {
    return this.database.transaction(async () => {
      await this.database.lock(`provider-event:${this.provider.name}:${event.providerEventId}`);

      this.requireAvailableProvider();
      const candidate = await this.resolveAttempt(event);
      await this.database.lock(
        `order:${candidate?.orderId ?? event.orderId ?? event.providerEventId}`,
      );
      const recorded = await this.payments.findProviderEvent(
        this.provider.name,
        event.providerEventId,
      );
      if (recorded !== null) {
        return { outcome: 'DUPLICATE', attemptId: recorded.paymentAttemptId };
      }

      const attempt = await this.resolveAttempt(event);
      if (attempt === null) {
        await this.payments.recordProviderEvent({
          provider: this.provider.name,
          providerEventId: event.providerEventId,
          eventType: event.type,
          outcome: 'UNKNOWN_ORDER',
          orderId: event.orderId,
          paymentAttemptId: null,
          reason: 'NO_PAYMENT_ATTEMPT',
          detail: toDetail(event),
        });
        return { outcome: 'UNKNOWN_ORDER', attemptId: null };
      }

      if (
        (event.orderId !== null && event.orderId !== attempt.orderId) ||
        (event.type === EVENT_PAYMENT_SUCCEEDED &&
          (!Number.isSafeInteger(event.amountMinor) ||
            event.amountMinor !== attempt.amountMinor ||
            event.currency !== attempt.currency))
      ) {
        await this.payments.recordProviderEvent({
          provider: this.provider.name,
          providerEventId: event.providerEventId,
          eventType: event.type,
          outcome: 'REJECTED',
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id,
          reason: 'PAYMENT_DETAILS_MISMATCH',
          detail: toDetail(event),
        });
        return { outcome: 'REJECTED', attemptId: attempt.id };
      }

      if (event.type === EVENT_PAYMENT_FAILED) {
        return this.applyFailure(event, attempt);
      }
      if (event.type !== EVENT_PAYMENT_SUCCEEDED) {
        await this.payments.recordProviderEvent({
          provider: this.provider.name,
          providerEventId: event.providerEventId,
          eventType: event.type,
          outcome: 'REJECTED',
          orderId: event.orderId,
          paymentAttemptId: attempt.id,
          reason: 'EVENT_TYPE_NOT_ACTIONABLE',
          detail: toDetail(event),
        });
        return { outcome: 'REJECTED', attemptId: attempt.id };
      }
      return this.applySuccess(event, attempt);
    });
  }

  /**
   * Records a successful payment and advances the order.
   *
   * The order's own transition happens through the Orders capability's published contract, so the
   * payment's state and the order's state and the stock allocation change together. A payment that
   * arrives after the order's reservation lapsed does **not** report the stock as allocated, and the
   * Orders capability records the discrepancy.
   */
  private async applySuccess(
    event: ProviderEvent,
    attempt: PaymentAttemptRecord,
  ): Promise<{ readonly outcome: string; readonly attemptId: string | null }> {
    if (attempt.status === 'SUCCEEDED') {
      await this.payments.recordProviderEvent({
        provider: this.provider.name,
        providerEventId: event.providerEventId,
        eventType: event.type,
        outcome: 'DUPLICATE',
        orderId: attempt.orderId,
        paymentAttemptId: attempt.id,
        reason: 'ATTEMPT_ALREADY_SUCCEEDED',
        detail: toDetail(event),
      });
      return { outcome: 'DUPLICATE', attemptId: attempt.id };
    }
    if (!paymentTransitionPermitted(attempt.status, 'SUCCEEDED')) {
      await this.payments.recordProviderEvent({
        provider: this.provider.name,
        providerEventId: event.providerEventId,
        eventType: event.type,
        outcome: 'REJECTED',
        orderId: attempt.orderId,
        paymentAttemptId: attempt.id,
        reason: 'TRANSITION_NOT_PERMITTED',
        detail: toDetail(event),
      });
      return { outcome: 'REJECTED', attemptId: attempt.id };
    }

    const settlement = await this.orders.settlePayment({
      orderId: attempt.orderId,
      paymentReference: event.providerEventId,
      amountMinor: event.amountMinor ?? attempt.amountMinor,
      currency: event.currency ?? attempt.currency,
      eventId: event.providerEventId,
    });

    const updated = await this.payments.transitionAttempt(attempt.id, attempt.status, 'SUCCEEDED', {
      providerReference: event.providerReference ?? attempt.providerReference,
      lastEventId: event.providerEventId,
      statusReason: settlement.reason,
      succeededAt: new Date(),
    });
    if (updated === null) {
      // A concurrent event already moved the attempt, so the recorded outcome stands.
      return { outcome: 'DUPLICATE', attemptId: attempt.id };
    }

    await this.payments.recordProviderEvent({
      provider: this.provider.name,
      providerEventId: event.providerEventId,
      eventType: event.type,
      outcome: 'APPLIED',
      orderId: attempt.orderId,
      paymentAttemptId: attempt.id,
      reason: settlement.reason,
      detail: toDetail(event),
    });
    return { outcome: 'APPLIED', attemptId: attempt.id };
  }

  /**
   * Records a failed payment and releases the order's held stock.
   *
   * The release happens through the Orders capability's published contract, so the hold is released
   * once even when the failure event is delivered twice.
   */
  private async applyFailure(
    event: ProviderEvent,
    attempt: PaymentAttemptRecord,
  ): Promise<{ readonly outcome: string; readonly attemptId: string | null }> {
    if (attempt.status === 'FAILED') {
      await this.payments.recordProviderEvent({
        provider: this.provider.name,
        providerEventId: event.providerEventId,
        eventType: event.type,
        outcome: 'DUPLICATE',
        orderId: attempt.orderId,
        paymentAttemptId: attempt.id,
        reason: 'ATTEMPT_ALREADY_FAILED',
        detail: toDetail(event),
      });
      return { outcome: 'DUPLICATE', attemptId: attempt.id };
    }
    if (!paymentTransitionPermitted(attempt.status, 'FAILED')) {
      await this.payments.recordProviderEvent({
        provider: this.provider.name,
        providerEventId: event.providerEventId,
        eventType: event.type,
        outcome: 'REJECTED',
        orderId: attempt.orderId,
        paymentAttemptId: attempt.id,
        reason: 'TRANSITION_NOT_PERMITTED',
        detail: toDetail(event),
      });
      return { outcome: 'REJECTED', attemptId: attempt.id };
    }

    const updated = await this.payments.transitionAttempt(attempt.id, attempt.status, 'FAILED', {
      providerReference: event.providerReference ?? attempt.providerReference,
      lastEventId: event.providerEventId,
      statusReason: 'PAYMENT_FAILED',
      failedAt: new Date(),
    });
    if (updated === null) {
      return { outcome: 'DUPLICATE', attemptId: attempt.id };
    }

    // The order's held stock is released through the Orders capability's published contract, so the
    // release happens once even when the failure event is delivered twice.
    await this.orders.failPayment({
      orderId: attempt.orderId,
      paymentReference: event.providerEventId,
      reason: 'PAYMENT_FAILED',
      eventId: event.providerEventId,
    });

    await this.payments.recordProviderEvent({
      provider: this.provider.name,
      providerEventId: event.providerEventId,
      eventType: event.type,
      outcome: 'APPLIED',
      orderId: attempt.orderId,
      paymentAttemptId: attempt.id,
      reason: 'PAYMENT_FAILED',
      detail: toDetail(event),
    });
    return { outcome: 'APPLIED', attemptId: attempt.id };
  }

  /** The attempt the event refers to, or null when there is none. */
  private async resolveAttempt(event: ProviderEvent): Promise<PaymentAttemptRecord | null> {
    if (event.providerReference !== null) {
      return this.payments.findAttemptByProviderReference(
        this.provider.name,
        event.providerReference,
      );
    }
    if (event.orderId !== null) {
      const attempts = await this.payments.listAttemptsForOrder(event.orderId);
      const pending = attempts.find((attempt) => attempt.status === 'PENDING');
      if (pending !== undefined) return pending;
      return attempts[0] ?? null;
    }
    return null;
  }

  /**
   * Refunds a payment, in full or in part.
   *
   * The refund is **idempotent** on the customer's business key, and the cumulative refunded total
   * is advanced with a conditional update inside the write, so two concurrent refunds cannot both
   * succeed past the amount that was paid.
   */
  public async refund(input: {
    readonly customerId: string;
    readonly paymentAttemptId: string;
    readonly actorUserId?: string | null;
    readonly idempotencyKey: string;
    readonly amountMinor: number;
    readonly reason: string | null;
  }): Promise<{
    readonly refundId: string;
    readonly status: string;
    readonly amountMinor: number;
  }> {
    this.requireAvailableProvider();
    let claimed: RefundRecord;
    try {
      claimed = await this.database.transaction(async () => {
        await this.database.lock(`refund-key:${input.customerId}:${input.idempotencyKey}`);
        const existing = await this.payments.findRefundByIdempotencyKey(
          input.customerId,
          input.idempotencyKey,
        );
        if (existing !== null) {
          this.validateRefundReplay(input, existing);
          return existing;
        }
        const attempt = await this.payments.findAttemptById(input.paymentAttemptId);
        if (attempt === null || attempt.customerId !== input.customerId)
          throw AppError.paymentNotFound();
        if (attempt.status !== 'SUCCEEDED') throw AppError.refundNotAllowed(attempt.status);
        return this.payments.createRefund(
          {
            paymentAttemptId: attempt.id,
            orderId: attempt.orderId,
            customerId: input.customerId,
            status: 'PENDING',
            amountMinor: input.amountMinor,
            currency: attempt.currency,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
            providerReference: null,
          },
          input.actorUserId ?? null,
        );
      });
    } catch (error) {
      if (error instanceof RefundExceedsPaymentError)
        throw AppError.refundExceedsPayment(error.remainingMinor);
      if (error instanceof PaymentAttemptNotFoundError) throw AppError.paymentNotFound();
      if (!(error instanceof PaymentIdempotencyConflictError)) throw error;
      // Recovery must happen after rollback, never inside PostgreSQL's failed transaction.
      const winner = await this.payments.findRefundByIdempotencyKey(
        input.customerId,
        input.idempotencyKey,
      );
      if (winner === null) throw error;
      this.validateRefundReplay(input, winner);
      claimed = winner;
    }
    // The provider runs after the durable claim transaction commits.
    if (claimed.status === 'PENDING') return this.completeRefund(claimed);
    return { refundId: claimed.id, status: claimed.status, amountMinor: claimed.amountMinor };
  }

  private validateRefundReplay(
    input: { readonly paymentAttemptId: string; readonly amountMinor: number },
    existing: RefundRecord,
  ): void {
    if (
      existing.paymentAttemptId !== input.paymentAttemptId ||
      existing.amountMinor !== input.amountMinor
    )
      throw AppError.refundNotAllowed('IDEMPOTENCY_KEY_REUSED');
  }

  private async completeRefund(created: RefundRecord): Promise<{
    readonly refundId: string;
    readonly status: string;
    readonly amountMinor: number;
  }> {
    const attempt = await this.payments.findAttemptById(created.paymentAttemptId);
    if (attempt === null) throw AppError.paymentNotFound();
    const result = await this.provider.refundPayment({
      refundId: created.id,
      providerReference: attempt.providerReference ?? created.id,
      amountMinor: created.amountMinor,
      currency: created.currency,
      idempotencyKey: `refund:${created.id}`,
    });
    return this.database.transaction(async () => {
      await this.database.lock(`order:${created.orderId}`);
      const updated = await this.payments.transitionRefund(created.id, 'PENDING', result.status, {
        providerReference: result.providerReference,
        succeededAt: result.status === 'SUCCEEDED' ? new Date() : null,
      });
      if (updated !== null && updated.status === 'SUCCEEDED')
        await this.orders.recordRefund({
          orderId: created.orderId,
          refundId: created.id,
          amountMinor: created.amountMinor,
          cumulativeMinor: await this.payments.successfulRefundedMinor(created.paymentAttemptId),
        });
      const current =
        updated ??
        (await this.payments.findRefundByIdempotencyKey(
          created.customerId,
          created.idempotencyKey,
        ));
      return {
        refundId: created.id,
        status: current?.status ?? created.status,
        amountMinor: created.amountMinor,
      };
    });
  }

  /**
   * Reconciles the platform's records with the provider's.
   *
   * The provider's record is the authority, so a difference is reported rather than silently
   * resolved in the platform's favour. The operation is a **read**: it reports and records, and it
   * never moves money.
   */
  public async reconcile(actorUserId: string | null = null): Promise<{
    readonly checked: number;
    readonly differences: readonly {
      readonly attemptId: string;
      readonly orderId: string;
      readonly platformStatus: string;
      readonly providerStatus: string | null;
      readonly reason: string;
    }[];
  }> {
    this.requireAvailableProvider();
    const at = new Date();
    let cursor: { createdAt: Date; id: string } | null = null;
    let checked = 0;
    const differences: {
      attemptId: string;
      orderId: string;
      platformStatus: string;
      providerStatus: string | null;
      reason: string;
    }[] = [];

    while (true) {
      const attempts = await this.payments.reconciliationPage(at, cursor, 200);
      if (attempts.length === 0) break;
      checked += attempts.length;
      for (const attempt of attempts) {
        if (attempt.providerReference === null) {
          differences.push({
            attemptId: attempt.id,
            orderId: attempt.orderId,
            platformStatus: attempt.status,
            providerStatus: null,
            reason: 'NO_PROVIDER_REFERENCE',
          });
          continue;
        }
        const providerState = await this.provider.lookupPayment(attempt.providerReference);
        if (providerState === null) {
          differences.push({
            attemptId: attempt.id,
            orderId: attempt.orderId,
            platformStatus: attempt.status,
            providerStatus: null,
            reason: 'UNKNOWN_TO_PROVIDER',
          });
          continue;
        }
        if (attempt.status === 'SUCCEEDED') {
          const order = await this.orders.findOrderById(attempt.orderId);
          const reason =
            order?.status === 'PAID_PENDING_ALLOCATION'
              ? 'STOCK_NOT_ALLOCATED'
              : order === null || !['PAID', 'FULFILLED', 'REFUNDED'].includes(order.status)
                ? 'ORDER_PAYMENT_STATE_MISMATCH'
                : null;
          if (reason !== null)
            differences.push({
              attemptId: attempt.id,
              orderId: attempt.orderId,
              platformStatus: attempt.status,
              providerStatus: providerState.status,
              reason,
            });
        }
        if (providerState.status !== attempt.status) {
          differences.push({
            attemptId: attempt.id,
            orderId: attempt.orderId,
            platformStatus: attempt.status,
            providerStatus: providerState.status,
            reason: 'STATUS_MISMATCH',
          });
        }
      }

      const last = attempts.at(-1);
      if (last === undefined) break;
      cursor = { createdAt: last.createdAt, id: last.id };
    }
    await this.payments.recordProviderEvent({
      provider: this.provider.name,
      providerEventId: `reconciliation-${randomUUID()}`,
      eventType: 'reconciliation.completed',
      outcome: 'APPLIED',
      orderId: null,
      paymentAttemptId: null,
      reason: differences.length === 0 ? null : 'DISCREPANCIES_FOUND',
      detail: { actorUserId, checked, differences, asOf: at.toISOString() },
    });
    return { checked, differences };
  }

  private requireAvailableProvider(): void {
    if (!this.provider.isAvailable())
      throw new ServiceUnavailableException('Payment provider unavailable');
  }

  /** The attempts of an order, oldest first. */
  public async attemptsForOrder(orderId: string): Promise<readonly PaymentAttemptRecord[]> {
    return this.payments.listAttemptsForOrder(orderId);
  }

  /** One attempt by its identifier, or null. */
  public async attemptOf(attemptId: string): Promise<PaymentAttemptRecord | null> {
    return this.payments.findAttemptById(attemptId);
  }

  /** The attempts of a customer, newest first. */
  public async attemptsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly PaymentAttemptRecord[]> {
    return this.payments.listAttemptsForCustomer(customerId, limit);
  }

  /** Every attempt, newest first. */
  public async allAttempts(limit: number): Promise<readonly PaymentAttemptRecord[]> {
    return this.payments.listAttempts(limit);
  }

  /** The recorded provider events, newest first. */
  public async events(orderId: string | null, limit: number) {
    return this.payments.listProviderEvents(orderId, limit);
  }

  /** The refunds of a payment, oldest first. */
  public async refundsForAttempt(attemptId: string) {
    return this.payments.listRefundsForAttempt(attemptId);
  }
}

function toDetail(event: ProviderEvent): Prisma.InputJsonValue {
  return {
    type: event.type,
    amountMinor: event.amountMinor,
    currency: event.currency,
    occurredAt: event.occurredAt.toISOString(),
    ...event.detail,
  };
}
