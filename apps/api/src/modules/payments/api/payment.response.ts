import { ApiProperty } from '@nestjs/swagger';
import type { PaymentAttemptRecord, RefundRecord } from '../persistence/payment.repository';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else. In particular no
 * card number, credential, or other payment material is ever projected, because the platform stores
 * none.
 */

export class PaymentAttemptResponse {
  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Budget held for pending or unknown refund outcomes.',
  })
  public pendingRefundMinor!: number;
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;

  @ApiProperty({
    type: String,
    enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED'],
  })
  public status!: string;

  @ApiProperty({
    type: Number,
    description: 'The exact integer minor units this attempt covers.',
  })
  public amountMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: String })
  public provider!: string;

  @ApiProperty({ type: String, nullable: true })
  public providerReference!: string | null;

  @ApiProperty({
    type: Number,
    description: 'The exact integer minor units already refunded against this attempt.',
  })
  public refundedMinor!: number;

  @ApiProperty({ type: String, nullable: true })
  public statusReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public succeededAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public failedAt!: string | null;
}

export class PaymentAttemptsResponse {
  @ApiProperty({ type: [PaymentAttemptResponse] })
  public attempts!: PaymentAttemptResponse[];
}

export class RefundResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public paymentAttemptId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;

  @ApiProperty({ type: String, enum: ['PENDING', 'SUCCEEDED', 'FAILED'] })
  public status!: string;

  @ApiProperty({
    type: Number,
    description: 'The exact integer minor units this refund covers.',
  })
  public amountMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: String, nullable: true })
  public reason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public providerReference!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public succeededAt!: string | null;
}

export class RefundsResponse {
  @ApiProperty({ type: [RefundResponse] })
  public refunds!: RefundResponse[];
}

export class RefundCreatedResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public refundId!: string;

  @ApiProperty({ type: String, enum: ['PENDING', 'SUCCEEDED', 'FAILED'] })
  public status!: string;

  @ApiProperty({ type: Number })
  public amountMinor!: number;
}

export class ProviderEventResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public provider!: string;

  @ApiProperty({ type: String })
  public providerEventId!: string;

  @ApiProperty({ type: String })
  public eventType!: string;

  @ApiProperty({
    type: String,
    enum: ['APPLIED', 'DUPLICATE', 'REJECTED', 'UNKNOWN_ORDER'],
  })
  public outcome!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public orderId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public paymentAttemptId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public reason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class ProviderEventsResponse {
  @ApiProperty({ type: [ProviderEventResponse] })
  public events!: ProviderEventResponse[];
}

export class ReconciliationDifferenceResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public attemptId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;

  @ApiProperty({ type: String })
  public platformStatus!: string;

  @ApiProperty({ type: String, nullable: true })
  public providerStatus!: string | null;

  @ApiProperty({ type: String })
  public reason!: string;
}

export class ReconciliationResponse {
  @ApiProperty({ type: Number })
  public checked!: number;

  @ApiProperty({ type: [ReconciliationDifferenceResponse] })
  public differences!: ReconciliationDifferenceResponse[];
}

export function toPaymentAttemptResponse(attempt: PaymentAttemptRecord): PaymentAttemptResponse {
  return {
    id: attempt.id,
    orderId: attempt.orderId,
    status: attempt.status,
    amountMinor: attempt.amountMinor,
    currency: attempt.currency,
    provider: attempt.provider,
    providerReference: attempt.providerReference,
    refundedMinor: attempt.refundedMinor,
    pendingRefundMinor: attempt.pendingRefundMinor,
    statusReason: attempt.statusReason,
    createdAt: attempt.createdAt.toISOString(),
    succeededAt: attempt.succeededAt === null ? null : attempt.succeededAt.toISOString(),
    failedAt: attempt.failedAt === null ? null : attempt.failedAt.toISOString(),
  };
}

export function toPaymentAttemptsResponse(
  attempts: readonly PaymentAttemptRecord[],
): PaymentAttemptsResponse {
  return { attempts: attempts.map(toPaymentAttemptResponse) };
}

export function toRefundResponse(refund: RefundRecord): RefundResponse {
  return {
    id: refund.id,
    paymentAttemptId: refund.paymentAttemptId,
    orderId: refund.orderId,
    status: refund.status,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
    reason: refund.reason,
    providerReference: refund.providerReference,
    createdAt: refund.createdAt.toISOString(),
    succeededAt: refund.succeededAt === null ? null : refund.succeededAt.toISOString(),
  };
}

export function toRefundsResponse(refunds: readonly RefundRecord[]): RefundsResponse {
  return { refunds: refunds.map(toRefundResponse) };
}
