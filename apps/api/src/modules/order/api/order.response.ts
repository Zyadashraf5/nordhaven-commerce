import { ApiProperty } from '@nestjs/swagger';
import type { OrderSnapshot } from '../contracts';
import type { PreOrderRecord } from '../persistence/pre-order.repository';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else: no internal-only
 * column, no other capability's data, and never an echo of a rejected value.
 */

export class OrderLineResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public variantId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public bundleId!: string | null;

  @ApiProperty({ type: String })
  public sku!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: String })
  public productName!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 999 })
  public quantity!: number;

  @ApiProperty({ type: Number })
  public unitPriceMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public unitCurrency!: string;

  @ApiProperty({ type: Number })
  public discountBasisPoints!: number;

  @ApiProperty({ type: Number })
  public taxRateBasisPoints!: number;

  @ApiProperty({ type: Boolean })
  public taxInclusive!: boolean;

  @ApiProperty({ type: String })
  public taxClassification!: string;

  @ApiProperty({ type: Number })
  public netMinor!: number;

  @ApiProperty({ type: Number })
  public taxMinor!: number;

  @ApiProperty({ type: Number })
  public totalMinor!: number;

  @ApiProperty({
    type: [Object],
    description: 'The snapshotted bundle composition, when the line names a bundle.',
  })
  public composition!: { variantId: string; sku: string; quantity: number }[];
}

export class OrderResponse {
  @ApiProperty({ type: Number, minimum: 0 })
  public refundedMinor!: number;
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({
    type: String,
    enum: [
      'PENDING_PAYMENT',
      'PAID',
      'PAID_PENDING_ALLOCATION',
      'PAYMENT_FAILED',
      'CANCELLED',
      'EXPIRED',
      'FULFILLED',
      'REFUNDED',
    ],
  })
  public status!: string;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: Number })
  public subtotalMinor!: number;

  @ApiProperty({ type: Number })
  public taxTotalMinor!: number;

  @ApiProperty({ type: Number })
  public totalMinor!: number;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public destinationCountryCode!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public taxJurisdiction!: string;

  @ApiProperty({ type: String, minLength: 64, maxLength: 64 })
  public quoteFingerprint!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public reservationId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public statusReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public paidAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public cancelledAt!: string | null;

  @ApiProperty({ type: [OrderLineResponse] })
  public lines!: OrderLineResponse[];
}

export class OrdersResponse {
  @ApiProperty({ type: [OrderResponse] })
  public orders!: OrderResponse[];
}

export class PreOrderResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({
    type: String,
    enum: [
      'AWAITING_STOCK',
      'STOCK_RESERVED',
      'AWAITING_PAYMENT',
      'CONVERTED',
      'CANCELLED',
      'EXPIRED',
    ],
  })
  public status!: string;

  @ApiProperty({ type: Number })
  public totalMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public orderId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public reservationId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public statusReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public cancelledAt!: string | null;
}

export class PreOrdersResponse {
  @ApiProperty({ type: [PreOrderResponse] })
  public preOrders!: PreOrderResponse[];
}

export function toOrderLineResponse(line: OrderSnapshot['lines'][number]): OrderLineResponse {
  return {
    id: line.id,
    variantId: line.variantId,
    bundleId: line.bundleId,
    sku: line.sku,
    productId: line.productId,
    productName: line.productName,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    unitCurrency: line.unitCurrency,
    discountBasisPoints: line.discountBasisPoints,
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxInclusive: line.taxInclusive,
    taxClassification: line.taxClassification,
    netMinor: line.netMinor,
    taxMinor: line.taxMinor,
    totalMinor: line.totalMinor,
    composition: line.composition.map((entry) => ({ ...entry })),
  };
}

export function toOrderResponse(order: OrderSnapshot): OrderResponse {
  return {
    id: order.id,
    refundedMinor: order.refundedMinor,
    status: order.status,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    taxTotalMinor: order.taxTotalMinor,
    totalMinor: order.totalMinor,
    destinationCountryCode: order.destinationCountryCode,
    taxJurisdiction: order.taxJurisdiction,
    quoteFingerprint: order.quoteFingerprint,
    reservationId: order.reservationId,
    statusReason: order.statusReason,
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paidAt: order.paidAt === null ? null : order.paidAt.toISOString(),
    cancelledAt: order.cancelledAt === null ? null : order.cancelledAt.toISOString(),
    lines: order.lines.map(toOrderLineResponse),
  };
}

export function toOrdersResponse(orders: readonly OrderSnapshot[]): OrdersResponse {
  return { orders: orders.map(toOrderResponse) };
}

export function toPreOrderResponse(preOrder: PreOrderRecord): PreOrderResponse {
  return {
    id: preOrder.id,
    status: preOrder.status,
    totalMinor: preOrder.totalMinor,
    currency: preOrder.currency,
    orderId: preOrder.orderId,
    reservationId: preOrder.reservationId,
    statusReason: preOrder.statusReason,
    createdAt: preOrder.createdAt.toISOString(),
    updatedAt: preOrder.updatedAt.toISOString(),
    cancelledAt: preOrder.cancelledAt === null ? null : preOrder.cancelledAt.toISOString(),
  };
}

export function toPreOrdersResponse(preOrders: readonly PreOrderRecord[]): PreOrdersResponse {
  return { preOrders: preOrders.map(toPreOrderResponse) };
}
