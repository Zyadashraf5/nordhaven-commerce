import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IDENTITY_AUDIT, type IdentityAudit } from '../../identity';
import { NOTIFICATION_SENDER, type NotificationSender } from '../../notification';
import { ORDER_LEDGER, type OrderLedger } from '../../order';
import { PAYMENT_OPERATIONS, type PaymentOperations } from '../../payments';
import { REVIEW_LIBRARY, type ReviewLibrary } from '../../review';
import { SHIPPING_FULFILLMENT, type ShippingFulfillment } from '../../shipping';
import type {
  AdministrationView,
  CustomerDetail,
  CustomerSummary,
  OperationalOverview,
} from '../contracts';

const RECORD_ID_LIMIT = 500;

/** Bounded orchestration over owner-published aggregates and identity pages. Owns no persistence. */
@Injectable()
export class AdministrationService implements AdministrationView {
  public constructor(
    @Inject(ORDER_LEDGER) private readonly orders: OrderLedger,
    @Inject(SHIPPING_FULFILLMENT) private readonly shipping: ShippingFulfillment,
    @Inject(REVIEW_LIBRARY) private readonly reviews: ReviewLibrary,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(PAYMENT_OPERATIONS) private readonly payments: PaymentOperations,
    @Inject(IDENTITY_AUDIT) private readonly identity: IdentityAudit,
  ) {}

  /** Full persisted state aggregates. This live picture is not a cross-provider accounting snapshot. */
  public async overview(): Promise<OperationalOverview> {
    const [orders, shipments, returns, reviews, notifications, accounts, money] = await Promise.all(
      [
        this.orders.stateCounts(),
        this.shipping.shipmentStateCounts(),
        this.shipping.returnStateCounts(),
        this.reviews.stateCounts(),
        this.notifications.stateCounts(),
        this.identity.countAccounts(),
        this.payments.financialSummary(),
      ],
    );
    return {
      orders,
      shipments,
      returns,
      reviews,
      notifications,
      accounts,
      collectedMinor: money.collectedMinor,
      refundedMinor: money.refundedMinor,
      pendingRefundMinor: money.pendingRefundMinor,
      currency: money.currency,
    };
  }

  public async customers(limit: number): Promise<readonly CustomerSummary[]> {
    return (await this.customersPage(limit, null)).customers;
  }

  /** Merge sorted bounded owner pages, preserving commerce identities without an Identity row. */
  public async customersPage(
    limit: number,
    cursor: string | null,
  ): Promise<{ customers: readonly CustomerSummary[]; nextCursor: string | null }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new BadRequestException({ code: 'VALIDATION_ERROR' });
    const pages = await Promise.all([
      this.identity.accountIdsAfter(cursor, limit + 1),
      this.orders.customerIdsAfter(cursor, limit + 1),
      this.reviews.customerIdsAfter(cursor, limit + 1),
      this.shipping.shipmentCustomerIdsAfter(cursor, limit + 1),
      this.shipping.returnCustomerIdsAfter(cursor, limit + 1),
    ]);
    const all = [...new Set(pages.flat())].sort();
    const selected = all.slice(0, limit);
    return {
      customers: await this.customerSummaries(selected),
      nextCursor: all.length > limit ? (selected.at(-1) ?? null) : null,
    };
  }

  private async customerSummaries(ids: readonly string[]): Promise<readonly CustomerSummary[]> {
    if (ids.length === 0) return [];
    const [accounts, orders, reviews, shipments, returns] = await Promise.all([
      this.identity.accountsForIds(ids),
      this.orders.customerCounts(ids),
      this.reviews.customerCounts(ids),
      this.shipping.shipmentCustomerCounts(ids),
      this.shipping.returnCustomerCounts(ids),
    ]);
    const facts = new Map(accounts.map((a) => [a.id, a])),
      oc = new Map(orders.map((a) => [a.customerId, a.count])),
      rc = new Map(reviews.map((a) => [a.customerId, a.count])),
      sc = new Map(shipments.map((a) => [a.customerId, a.count])),
      ret = new Map(returns.map((a) => [a.customerId, a.count]));
    return ids.map((customerId) => {
      const a = facts.get(customerId);
      return {
        customerId,
        email: a?.email ?? null,
        role: a?.role ?? null,
        accountCreatedAt: a?.createdAt ?? null,
        orderCount: oc.get(customerId) ?? 0,
        reviewCount: rc.get(customerId) ?? 0,
        shipmentCount: sc.get(customerId) ?? 0,
        returnCount: ret.get(customerId) ?? 0,
      };
    });
  }

  public async customer(customerId: string): Promise<CustomerDetail | null> {
    const [summaries, orderIds, reviewIds, shipmentIds, returnIds] = await Promise.all([
      this.customerSummaries([customerId]),
      this.orders.recordIdsForCustomer(customerId, RECORD_ID_LIMIT),
      this.reviews.recordIdsForCustomer(customerId, RECORD_ID_LIMIT),
      this.shipping.shipmentIdsForCustomer(customerId, RECORD_ID_LIMIT),
      this.shipping.returnIdsForCustomer(customerId, RECORD_ID_LIMIT),
    ]);
    const summary = summaries[0];
    if (summary === undefined) return null;
    if (
      summary.accountCreatedAt === null &&
      summary.orderCount + summary.reviewCount + summary.shipmentCount + summary.returnCount === 0
    )
      return null;
    return {
      ...summary,
      orderIds,
      reviewIds,
      shipmentIds,
      returnIds,
      recordsTruncated:
        summary.orderCount > orderIds.length ||
        summary.reviewCount > reviewIds.length ||
        summary.shipmentCount > shipmentIds.length ||
        summary.returnCount > returnIds.length,
    };
  }

  public async securityEvents(limit: number) {
    return this.identity.recentSecurityEvents(limit);
  }
}
