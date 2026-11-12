import { Injectable } from '@nestjs/common';
import { SETTLEMENT_CURRENCY } from '../../../platform/config/environment';
import {
  type PaymentAttemptSummary,
  type PaymentFinancialSummary,
  type PaymentOperations,
  type PaymentStatusValue,
} from '../contracts';
import { PaymentOperationsRepository } from '../persistence/payment-operations.repository';

/**
 * The financial operations.
 *
 * The service owns the rules; the repository owns the aggregation. Every amount is an exact integer
 * count of minor units, and the service never computes a total from a row it read itself.
 */
@Injectable()
export class PaymentOperationsService implements PaymentOperations {
  public constructor(private readonly operations: PaymentOperationsRepository) {}

  public async financialSummary(): Promise<PaymentFinancialSummary> {
    const summary = await this.operations.financialSummary();
    return {
      collectedMinor: summary.collectedMinor,
      refundedMinor: summary.refundedMinor,
      pendingRefundMinor: summary.pendingRefundMinor,
      attempts: summary.attempts,
      refunds: summary.refunds,
      currency: SETTLEMENT_CURRENCY,
    };
  }

  public async listAll(limit: number): Promise<readonly PaymentAttemptSummary[]> {
    return (await this.operations.listAll(limit)).map((row) => ({
      id: row.id,
      orderId: row.orderId,
      customerId: row.customerId,
      status: row.status as PaymentStatusValue,
      amountMinor: row.amountMinor,
      currency: row.currency,
      provider: row.provider,
      createdAt: row.createdAt,
    }));
  }

  /** The attempts of one customer, newest first. */
  public async listForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly PaymentAttemptSummary[]> {
    return (await this.operations.listForCustomer(customerId, limit)).map((row) => ({
      id: row.id,
      orderId: row.orderId,
      customerId: row.customerId,
      status: row.status as PaymentStatusValue,
      amountMinor: row.amountMinor,
      currency: row.currency,
      provider: row.provider,
      createdAt: row.createdAt,
    }));
  }
}
