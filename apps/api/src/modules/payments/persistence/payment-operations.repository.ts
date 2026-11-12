import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/**
 * The platform's money, as exact counts of minor units.
 *
 * The aggregation is done by the database over the Payments capability's own tables, so the
 * administrative surface never computes a total from a row it read itself and never reads another
 * capability's rows.
 */
@Injectable()
export class PaymentOperationsRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async financialSummary(): Promise<{
    readonly collectedMinor: number;
    readonly refundedMinor: number;
    readonly pendingRefundMinor: number;
    readonly attempts: Readonly<Record<string, number>>;
    readonly refunds: Readonly<Record<string, number>>;
  }> {
    const attempts = await this.database.prisma.paymentAttempt.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amountMinor: true },
    });
    const refunds = await this.database.prisma.refund.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amountMinor: true },
    });

    const attemptCounts: Record<string, number> = {};
    let collectedMinor = 0;
    for (const row of attempts) {
      attemptCounts[row.status] = row._count._all;
      if (row.status === 'SUCCEEDED' || row.status === 'REFUNDED') {
        collectedMinor += row._sum.amountMinor ?? 0;
      }
    }

    const refundCounts: Record<string, number> = {};
    let refundedMinor = 0;
    let pendingRefundMinor = 0;
    for (const row of refunds) {
      refundCounts[row.status] = row._count._all;
      if (row.status === 'SUCCEEDED') refundedMinor += row._sum.amountMinor ?? 0;
      if (row.status === 'PENDING') pendingRefundMinor += row._sum.amountMinor ?? 0;
    }

    return {
      collectedMinor,
      refundedMinor,
      pendingRefundMinor,
      attempts: attemptCounts,
      refunds: refundCounts,
    };
  }

  public async listAll(limit: number): Promise<
    readonly {
      readonly id: string;
      readonly orderId: string;
      readonly customerId: string;
      readonly status: string;
      readonly amountMinor: number;
      readonly currency: string;
      readonly provider: string;
      readonly createdAt: Date;
    }[]
  > {
    const rows = await this.database.prisma.paymentAttempt.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        orderId: true,
        customerId: true,
        status: true,
        amountMinor: true,
        currency: true,
        provider: true,
        createdAt: true,
      },
    });
    return rows;
  }

  /** The attempts of one customer, newest first. */
  public async listForCustomer(
    customerId: string,
    limit: number,
  ): Promise<
    readonly {
      readonly id: string;
      readonly orderId: string;
      readonly customerId: string;
      readonly status: string;
      readonly amountMinor: number;
      readonly currency: string;
      readonly provider: string;
      readonly createdAt: Date;
    }[]
  > {
    const rows = await this.database.prisma.paymentAttempt.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        orderId: true,
        customerId: true,
        status: true,
        amountMinor: true,
        currency: true,
        provider: true,
        createdAt: true,
      },
    });
    return rows;
  }
}

void Prisma;
