import { BadRequestException, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import {
  type OrderRefundOutcome,
  type OrderRefundRequest,
  type PaymentRefunds,
} from '../contracts';
import { PaymentService } from './payment.service';

/**
 * The refund contract, for another capability that must return money.
 *
 * The attempt is resolved here, so the caller does not have to know which attempt paid the order,
 * and the cumulative refund limit, the idempotency key, and the provider call all stay inside the
 * Payments capability, which owns them.
 */
@Injectable()
export class PaymentRefundService implements PaymentRefunds {
  public constructor(private readonly payments: PaymentService) {}

  public async refundOrder(request: OrderRefundRequest): Promise<OrderRefundOutcome> {
    if (request.amountMinor < 1) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'amountMinor', message: 'Invalid value' }],
      });
    }
    if (request.idempotencyKey.trim().length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'idempotencyKey', message: 'Invalid value' }],
      });
    }

    const attempts = await this.payments.attemptsForOrder(request.orderId);
    const paid = attempts
      .filter(
        (attempt) =>
          attempt.customerId === request.customerId &&
          (attempt.status === 'SUCCEEDED' || attempt.status === 'REFUNDED'),
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const attempt = paid[0];
    if (attempt === undefined) throw AppError.paymentNotFound();

    const refund = await this.payments.refund({
      customerId: request.customerId,
      paymentAttemptId: attempt.id,
      actorUserId: request.actorUserId ?? null,
      idempotencyKey: request.idempotencyKey,
      amountMinor: request.amountMinor,
      reason: request.reason,
    });

    return {
      refundId: refund.refundId,
      status: refund.status as OrderRefundOutcome['status'],
      amountMinor: refund.amountMinor,
      currency: attempt.currency,
    };
  }
}
