import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { PaymentStatus, RefundStatus } from '../../../generated/prisma/enums';
import { DatabaseService } from '../../../platform/database/database.service';
import { isUniqueConstraintViolation } from './prisma-errors';

/** The payment attempt, as the Payments capability persists it. */
export interface PaymentAttemptRecord {
  readonly pendingRefundMinor: number;
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly provider: string;
  readonly providerReference: string | null;
  readonly idempotencyKey: string;
  readonly refundedMinor: number;
  readonly lastEventId: string | null;
  readonly statusReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly succeededAt: Date | null;
  readonly failedAt: Date | null;
}

/** One provider event, as the Payments capability persists it. */
export interface ProviderEventRecord {
  readonly id: string;
  readonly provider: string;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly outcome: 'APPLIED' | 'DUPLICATE' | 'REJECTED' | 'UNKNOWN_ORDER';
  readonly orderId: string | null;
  readonly paymentAttemptId: string | null;
  readonly reason: string | null;
  readonly detail: Prisma.JsonValue;
  readonly createdAt: Date;
}

/** One refund, as the Payments capability persists it. */
export interface RefundRecord {
  readonly id: string;
  readonly paymentAttemptId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly status: RefundStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly reason: string | null;
  readonly idempotencyKey: string;
  readonly providerReference: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly succeededAt: Date | null;
}

/** The attributes a new attempt carries. */
export interface PaymentAttemptAttributes {
  readonly orderId: string;
  readonly customerId: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly provider: string;
  readonly providerReference: string | null;
  readonly idempotencyKey: string;
}

/** The attributes a new refund carries. */
export interface RefundAttributes {
  readonly paymentAttemptId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly status: RefundStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly reason: string | null;
  readonly idempotencyKey: string;
  readonly providerReference: string | null;
}

const ATTEMPT_SELECT = {
  pendingRefundMinor: true,
  id: true,
  orderId: true,
  customerId: true,
  status: true,
  amountMinor: true,
  currency: true,
  provider: true,
  providerReference: true,
  idempotencyKey: true,
  refundedMinor: true,
  lastEventId: true,
  statusReason: true,
  createdAt: true,
  updatedAt: true,
  succeededAt: true,
  failedAt: true,
} satisfies Prisma.PaymentAttemptSelect;

const EVENT_SELECT = {
  id: true,
  provider: true,
  providerEventId: true,
  eventType: true,
  outcome: true,
  orderId: true,
  paymentAttemptId: true,
  reason: true,
  detail: true,
  createdAt: true,
} satisfies Prisma.ProviderEventSelect;

const REFUND_SELECT = {
  id: true,
  paymentAttemptId: true,
  orderId: true,
  customerId: true,
  status: true,
  amountMinor: true,
  currency: true,
  reason: true,
  idempotencyKey: true,
  providerReference: true,
  createdAt: true,
  updatedAt: true,
  succeededAt: true,
} satisfies Prisma.RefundSelect;

/**
 * Persistence for the payment records.
 *
 * The Payments capability owns these tables. It references no other capability's tables: the order
 * and the customer are stable foreign identifiers, and the order's own state is changed through the
 * Orders capability's published contract rather than by writing its rows.
 */
@Injectable()
export class PaymentRepository {
  public constructor(private readonly database: DatabaseService) {}

  /** The attempt a customer's idempotency key already created, or null. */
  public async findAttemptByIdempotencyKey(
    customerId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttemptRecord | null> {
    const row = await this.database.prisma.paymentAttempt.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
      select: ATTEMPT_SELECT,
    });
    return row === null ? null : row;
  }

  public async findAttemptById(attemptId: string): Promise<PaymentAttemptRecord | null> {
    const row = await this.database.prisma.paymentAttempt.findUnique({
      where: { id: attemptId },
      select: ATTEMPT_SELECT,
    });
    return row === null ? null : row;
  }

  /** The attempts of an order, oldest first. */
  public async listAttemptsForOrder(orderId: string): Promise<readonly PaymentAttemptRecord[]> {
    const rows = await this.database.prisma.paymentAttempt.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ATTEMPT_SELECT,
    });
    return rows;
  }

  /** The attempts of a customer, newest first. */
  public async listAttemptsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly PaymentAttemptRecord[]> {
    const rows = await this.database.prisma.paymentAttempt.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: ATTEMPT_SELECT,
    });
    return rows;
  }

  /** Every attempt, newest first, for the administrative surface and the reconciliation. */
  public async listAttempts(limit: number): Promise<readonly PaymentAttemptRecord[]> {
    const rows = await this.database.prisma.paymentAttempt.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: ATTEMPT_SELECT,
    });
    return rows;
  }

  /** The provider event with that identifier, or null. It is the deduplication check. */
  public async findProviderEvent(
    provider: string,
    providerEventId: string,
  ): Promise<ProviderEventRecord | null> {
    const row = await this.database.prisma.providerEvent.findUnique({
      where: { provider_providerEventId: { provider, providerEventId } },
      select: EVENT_SELECT,
    });
    return row === null ? null : row;
  }

  /** The recorded provider events, newest first. */
  public async listProviderEvents(
    orderId: string | null,
    limit: number,
  ): Promise<readonly ProviderEventRecord[]> {
    const rows = await this.database.prisma.providerEvent.findMany({
      where: orderId === null ? {} : { orderId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: EVENT_SELECT,
    });
    return rows;
  }

  /** The refund a customer's idempotency key already created, or null. */
  public async findRefundByIdempotencyKey(
    customerId: string,
    idempotencyKey: string,
  ): Promise<RefundRecord | null> {
    const row = await this.database.prisma.refund.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
      select: REFUND_SELECT,
    });
    return row === null ? null : row;
  }

  /** The refunds of a payment, oldest first. */
  public async listRefundsForAttempt(attemptId: string): Promise<readonly RefundRecord[]> {
    const rows = await this.database.prisma.refund.findMany({
      where: { paymentAttemptId: attemptId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: REFUND_SELECT,
    });
    return rows;
  }

  /** Every refund, newest first, for the administrative surface. */
  public async listRefunds(limit: number): Promise<readonly RefundRecord[]> {
    const rows = await this.database.prisma.refund.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: REFUND_SELECT,
    });
    return rows;
  }

  public async findAttemptByProviderReference(
    provider: string,
    providerReference: string,
  ): Promise<PaymentAttemptRecord | null> {
    return this.database.prisma.paymentAttempt.findFirst({
      where: { provider, providerReference },
      select: ATTEMPT_SELECT,
    });
  }

  public async successfulRefundedMinor(paymentAttemptId: string): Promise<number> {
    const result = await this.database.prisma.refund.aggregate({
      where: { paymentAttemptId, status: 'SUCCEEDED' },
      _sum: { amountMinor: true },
    });
    return result._sum.amountMinor ?? 0;
  }

  public async reconciliationPage(
    at: Date,
    cursor: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<PaymentAttemptRecord[]> {
    return this.database.prisma.paymentAttempt.findMany({
      where: {
        createdAt: { lte: at },
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: ATTEMPT_SELECT,
    });
  }

  /**
   * Creates a payment attempt.
   *
   * A concurrent request with the same idempotency key is refused by the unique constraint, and the
   * caller then reads the winner's attempt.
   */
  public async createAttempt(attributes: PaymentAttemptAttributes): Promise<PaymentAttemptRecord> {
    try {
      return await this.database.prisma.paymentAttempt.create({
        data: attributes,
        select: ATTEMPT_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new PaymentIdempotencyConflictError();
      throw error;
    }
  }

  /**
   * Moves an attempt to a new state.
   *
   * The update is conditional on the attempt's **current** state, so two concurrent events cannot
   * both apply the same transition.
   */
  public async transitionAttempt(
    attemptId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    changes: {
      readonly providerReference?: string | null | undefined;
      readonly lastEventId?: string | null | undefined;
      readonly statusReason?: string | null | undefined;
      readonly succeededAt?: Date | null | undefined;
      readonly failedAt?: Date | null | undefined;
    } = {},
  ): Promise<PaymentAttemptRecord | null> {
    const result = await this.database.prisma.paymentAttempt.updateMany({
      where: { id: attemptId, status: from },
      data: {
        status: to,
        ...(changes.providerReference === undefined
          ? {}
          : { providerReference: changes.providerReference }),
        ...(changes.lastEventId === undefined ? {} : { lastEventId: changes.lastEventId }),
        ...(changes.statusReason === undefined ? {} : { statusReason: changes.statusReason }),
        ...(changes.succeededAt === undefined ? {} : { succeededAt: changes.succeededAt }),
        ...(changes.failedAt === undefined ? {} : { failedAt: changes.failedAt }),
      },
    });
    if (result.count === 0) return null;
    return this.findAttemptById(attemptId);
  }

  /**
   * Records a provider event.
   *
   * The write is conditional on the event not having been recorded, so two concurrent deliveries of
   * the same event produce exactly one recorded event.
   */
  public async recordProviderEvent(event: {
    readonly provider: string;
    readonly providerEventId: string;
    readonly eventType: string;
    readonly outcome: ProviderEventRecord['outcome'];
    readonly orderId: string | null;
    readonly paymentAttemptId: string | null;
    readonly reason: string | null;
    readonly detail: Prisma.InputJsonValue;
  }): Promise<ProviderEventRecord | null> {
    try {
      return await this.database.prisma.providerEvent.create({
        data: event,
        select: EVENT_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return null;
      throw error;
    }
  }

  /**
   * Creates a refund and advances the attempt's refunded total, in one transaction.
   *
   * The refunded total is advanced with a **conditional** update, so the update only applies while
   * the attempt's refunded total plus the refund's amount still fits within the amount that was
   * paid. Two concurrent refunds therefore cannot both succeed past the limit: the second one
   * updates nothing and the transaction rolls back.
   */
  public async createRefund(
    attributes: RefundAttributes,
    actorUserId: string | null = null,
  ): Promise<RefundRecord> {
    try {
      return await this.database.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM payment_attempts WHERE id = ${attributes.paymentAttemptId}::uuid FOR UPDATE`;
        const attempt = await transaction.paymentAttempt.findUnique({
          where: { id: attributes.paymentAttemptId },
        });
        if (attempt === null) throw new PaymentAttemptNotFoundError();
        const remaining = attempt.amountMinor - attempt.refundedMinor - attempt.pendingRefundMinor;
        if (attempt.status !== 'SUCCEEDED' || attributes.amountMinor > remaining)
          throw new RefundExceedsPaymentError(remaining);
        await transaction.paymentAttempt.update({
          where: { id: attempt.id },
          data: { pendingRefundMinor: { increment: attributes.amountMinor } },
        });

        const refund = await transaction.refund.create({
          data: attributes,
          select: REFUND_SELECT,
        });
        await transaction.refundEvent.create({
          data: {
            refundId: refund.id,
            previousStatus: null,
            nextStatus: refund.status,
            actorUserId,
            reason: refund.reason,
          },
        });
        return refund;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new PaymentIdempotencyConflictError();
      throw error;
    }
  }

  /**
   * Moves a refund to a new state.
   *
   * The update is conditional on the refund's **current** state, so a repeated event applies once.
   */
  public async transitionRefund(
    refundId: string,
    from: RefundStatus,
    to: RefundStatus,
    changes: {
      readonly providerReference?: string | null | undefined;
      readonly succeededAt?: Date | null | undefined;
    } = {},
  ): Promise<RefundRecord | null> {
    return this.database.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId }, select: REFUND_SELECT });
      if (refund === null) return null;
      await tx.$queryRaw`SELECT id FROM payment_attempts WHERE id = ${refund.paymentAttemptId}::uuid FOR UPDATE`;
      const result = await tx.refund.updateMany({
        where: { id: refundId, status: from },
        data: {
          status: to,
          ...(changes.providerReference === undefined
            ? {}
            : { providerReference: changes.providerReference }),
          ...(changes.succeededAt === undefined ? {} : { succeededAt: changes.succeededAt }),
        },
      });
      if (result.count === 0) return null;
      if (from !== to)
        await tx.refundEvent.create({
          data: {
            refundId,
            previousStatus: from,
            nextStatus: to,
            actorUserId: null,
            reason: to === 'FAILED' ? 'PROVIDER_FAILED' : 'PROVIDER_SUCCEEDED',
          },
        });
      if (from === 'PENDING' && to === 'FAILED') {
        await tx.paymentAttempt.update({
          where: { id: refund.paymentAttemptId },
          data: { pendingRefundMinor: { decrement: refund.amountMinor } },
        });
      }
      if (from === 'PENDING' && to === 'SUCCEEDED') {
        await tx.paymentAttempt.update({
          where: { id: refund.paymentAttemptId },
          data: {
            pendingRefundMinor: { decrement: refund.amountMinor },
            refundedMinor: { increment: refund.amountMinor },
          },
        });
      }
      if (to === 'SUCCEEDED') {
        const totals = await tx.refund.aggregate({
          where: { paymentAttemptId: refund.paymentAttemptId, status: 'SUCCEEDED' },
          _sum: { amountMinor: true },
        });
        const paid = await tx.paymentAttempt.findUniqueOrThrow({
          where: { id: refund.paymentAttemptId },
        });
        if (totals._sum.amountMinor === paid.amountMinor) {
          await tx.paymentAttempt.updateMany({
            where: { id: paid.id, status: 'SUCCEEDED' },
            data: { status: 'REFUNDED', statusReason: 'FULLY_REFUNDED' },
          });
        }
      }
      return tx.refund.findUnique({ where: { id: refundId }, select: REFUND_SELECT });
    });
  }
}

/** Raised when a concurrent request already created the record for an idempotency key. */
export class PaymentIdempotencyConflictError extends Error {
  public constructor() {
    super('A payment record already exists for that idempotency key');
    this.name = 'PaymentIdempotencyConflictError';
  }
}

/** Raised when the payment attempt a refund refers to does not exist. */
export class PaymentAttemptNotFoundError extends Error {
  public constructor() {
    super('The payment attempt does not exist');
    this.name = 'PaymentAttemptNotFoundError';
  }
}

/** Raised when the refunds would exceed the amount that was paid. */
export class RefundExceedsPaymentError extends Error {
  public constructor(public readonly remainingMinor: number = 0) {
    super('The refunds would exceed the amount that was paid');
    this.name = 'RefundExceedsPaymentError';
  }
}
