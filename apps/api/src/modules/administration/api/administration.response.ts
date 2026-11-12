import { ApiProperty } from '@nestjs/swagger';
import type { CustomerDetail, CustomerSummary, OperationalOverview } from '../contracts';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares. The administrative surface reports the
 * platform's own facts and never echoes a rejected value or a credential.
 */

export class OperationalCountResponse {
  @ApiProperty({ type: String })
  public state!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  public count!: number;
}

export class OperationalOverviewResponse {
  @ApiProperty({ type: [OperationalCountResponse] })
  public orders!: OperationalCountResponse[];

  @ApiProperty({ type: [OperationalCountResponse] })
  public shipments!: OperationalCountResponse[];

  @ApiProperty({ type: [OperationalCountResponse] })
  public returns!: OperationalCountResponse[];

  @ApiProperty({ type: [OperationalCountResponse] })
  public reviews!: OperationalCountResponse[];

  @ApiProperty({ type: [OperationalCountResponse] })
  public notifications!: OperationalCountResponse[];

  @ApiProperty({ type: Number, minimum: 0 })
  public accounts!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public collectedMinor!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public refundedMinor!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public pendingRefundMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;
}

export class CustomerSummaryResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public customerId!: string;

  @ApiProperty({ type: String, nullable: true })
  public email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public role!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public accountCreatedAt!: string | null;

  @ApiProperty({ type: Number, minimum: 0 })
  public orderCount!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public reviewCount!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public shipmentCount!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  public returnCount!: number;
}

export class CustomersResponse {
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) public nextCursor!: string | null;
  @ApiProperty({ type: [CustomerSummaryResponse] })
  public customers!: CustomerSummaryResponse[];
}

export class CustomerDetailResponse extends CustomerSummaryResponse {
  @ApiProperty({
    type: Boolean,
    description: 'Counts cover full history; record-ID arrays are limited to500 per type.',
  })
  public recordsTruncated!: boolean;
  @ApiProperty({ type: [String] })
  public orderIds!: string[];

  @ApiProperty({ type: [String] })
  public reviewIds!: string[];

  @ApiProperty({ type: [String] })
  public shipmentIds!: string[];

  @ApiProperty({ type: [String] })
  public returnIds!: string[];
}

export class SecurityEventResponse {
  @ApiProperty({ type: String })
  public eventType!: string;

  @ApiProperty({ type: String })
  public outcome!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public actorUserId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public actorRole!: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  public correlationId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class AuditTrailResponse {
  @ApiProperty({ type: [SecurityEventResponse] })
  public events!: SecurityEventResponse[];
}

export function toOperationalOverviewResponse(
  overview: OperationalOverview,
): OperationalOverviewResponse {
  return {
    orders: overview.orders.map((entry) => ({ state: entry.state, count: entry.count })),
    shipments: overview.shipments.map((entry) => ({ state: entry.state, count: entry.count })),
    returns: overview.returns.map((entry) => ({ state: entry.state, count: entry.count })),
    reviews: overview.reviews.map((entry) => ({ state: entry.state, count: entry.count })),
    notifications: overview.notifications.map((entry) => ({
      state: entry.state,
      count: entry.count,
    })),
    accounts: overview.accounts,
    collectedMinor: overview.collectedMinor,
    refundedMinor: overview.refundedMinor,
    pendingRefundMinor: overview.pendingRefundMinor,
    currency: overview.currency,
  };
}

export function toCustomerSummaryResponse(summary: CustomerSummary): CustomerSummaryResponse {
  return {
    customerId: summary.customerId,
    email: summary.email,
    role: summary.role,
    accountCreatedAt:
      summary.accountCreatedAt === null ? null : summary.accountCreatedAt.toISOString(),
    orderCount: summary.orderCount,
    reviewCount: summary.reviewCount,
    shipmentCount: summary.shipmentCount,
    returnCount: summary.returnCount,
  };
}

export function toCustomersResponse(
  summaries: readonly CustomerSummary[],
  nextCursor: string | null = null,
): CustomersResponse {
  return { customers: summaries.map(toCustomerSummaryResponse), nextCursor };
}

export function toCustomerDetailResponse(detail: CustomerDetail): CustomerDetailResponse {
  return {
    ...toCustomerSummaryResponse(detail),
    recordsTruncated: detail.recordsTruncated,
    orderIds: [...detail.orderIds],
    reviewIds: [...detail.reviewIds],
    shipmentIds: [...detail.shipmentIds],
    returnIds: [...detail.returnIds],
  };
}
