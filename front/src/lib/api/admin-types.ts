/**
 * Admin shapes from openapi.json 1.3.0 (`/api/v1/admin/*`). Amounts are exact
 * integer minor units.
 */
import type { ApiOrder } from './commerce-types';

export type ProductStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface AdminRef {
  id: string;
  name: string;
  slug: string;
}

export interface AdminProductSummary {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  baseCurrency: string;
  basePriceMinor: number;
  discountBasisPoints: number;
  effectivePriceMinor: number;
  brand: AdminRef;
  category: AdminRef;
  createdAt: string;
  updatedAt: string;
}

export interface AdminVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  material: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProduct extends AdminProductSummary {
  description: string;
  images: { url: string; altText: string | null; position: number }[];
  attributes: { name: string; value: string; position: number }[];
  variants: AdminVariant[];
}

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  children: AdminCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminInventoryItem {
  id: string;
  variantId: string | null;
  bundleId: string | null;
  productId: string | null;
  productName: string | null;
  sku: string | null;
  onHand: number;
  reserved: number;
  available: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMovement {
  id: string;
  reason:
    | 'ADJUSTMENT'
    | 'RESERVATION_CREATED'
    | 'RESERVATION_RELEASED'
    | 'RESERVATION_EXPIRED'
    | 'RESERVATION_CONFIRMED';
  onHandDelta: number;
  onHandAfter: number;
  reservedDelta: number;
  reservedAfter: number;
  reservationId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminReservation {
  id: string;
  idempotencyKey: string;
  status: 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  lines: { id: string; sku: string | null; quantity: number }[];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBundle {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  kind: 'FIXED' | 'DYNAMIC';
  available: number;
  components: {
    id: string;
    variantId: string;
    sku: string;
    quantity: number | null;
    minQuantity: number | null;
    maxQuantity: number | null;
    position: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomerRow {
  customerId: string;
  email: string | null;
  role: string | null;
  accountCreatedAt: string | null;
  orderCount: number;
  reviewCount: number;
  shipmentCount: number;
  returnCount: number;
}

export interface AdminCustomerDetail extends AdminCustomerRow {
  orderIds: string[];
  reviewIds: string[];
  shipmentIds: string[];
  returnIds: string[];
  recordsTruncated: boolean;
}

export type AdminOrder = ApiOrder;

export interface AdminPreOrder {
  id: string;
  status:
    | 'AWAITING_STOCK'
    | 'STOCK_RESERVED'
    | 'AWAITING_PAYMENT'
    | 'CONVERTED'
    | 'CANCELLED'
    | 'EXPIRED';
  statusReason: string | null;
  currency: string;
  totalMinor: number;
  orderId: string | null;
  reservationId: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface AdminShipment {
  id: string;
  orderId: string;
  status: 'PREPARED' | 'PACKED' | 'HANDED_OVER' | 'DELIVERED' | 'CANCELLED';
  statusReason: string | null;
  methodCode: string;
  methodLabel: string;
  amountMinor: number;
  currency: string;
  carrierCode: string | null;
  trackingReference: string | null;
  destinationCountryCode: string;
  destinationLabel: string;
  lines: { orderLineId: string; quantity: number }[];
  createdAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

export interface AdminTransition {
  actor: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  eventType: string;
  previousStatus: string | null;
  nextStatus: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminPaymentAttempt {
  id: string;
  orderId: string;
  provider: string;
  providerReference: string | null;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  statusReason: string | null;
  amountMinor: number;
  currency: string;
  refundedMinor: number;
  pendingRefundMinor: number;
  createdAt: string;
  succeededAt: string | null;
  failedAt: string | null;
}

export interface AdminPaymentEvent {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  outcome: 'APPLIED' | 'DUPLICATE' | 'REJECTED' | 'UNKNOWN_ORDER';
  orderId: string | null;
  paymentAttemptId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminReconciliation {
  checked: number;
  differences: {
    attemptId: string;
    orderId: string;
    platformStatus: string;
    providerStatus: string | null;
    reason: string;
  }[];
}

export interface AdminRefund {
  id: string;
  orderId: string;
  paymentAttemptId: string;
  amountMinor: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  reason: string | null;
  providerReference: string | null;
  createdAt: string;
  succeededAt: string | null;
}

export interface AdminReturn {
  id: string;
  orderId: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED' | 'CANCELLED';
  reasonCode: string;
  totalMinor: number;
  currency: string;
  lines: { id: string; orderLineId: string; quantity: number; restocked: boolean }[];
  refundId: string | null;
  refundStatus: string | null;
  createdAt: string;
  decidedAt: string | null;
  receivedAt: string | null;
}

export interface AdminReview {
  id: string;
  productId: string;
  orderId: string | null;
  rating: number;
  title: string;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  verifiedPurchase: boolean;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedByUserId: string | null;
  createdAt: string;
}

export interface AdminNotification {
  id: string;
  kind: string;
  subject: string;
  body: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
  provider: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface AdminOverview {
  accounts: number;
  currency: string;
  collectedMinor: number;
  refundedMinor: number;
  pendingRefundMinor: number;
  orders: { state: string; count: number }[];
  shipments: { state: string; count: number }[];
  returns: { state: string; count: number }[];
  reviews: { state: string; count: number }[];
  notifications: { state: string; count: number }[];
}

export interface AdminAuditEvent {
  eventType: string;
  outcome: string;
  actorRole: string | null;
  actorUserId: string | null;
  correlationId: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
  createdAt: string;
}

export interface AdminCheckoutDestination {
  countryCode: string;
  label: string;
  enabled: boolean;
  shippingApproved: boolean;
  taxJurisdiction: string;
}

export interface AdminShippingMethod {
  id: string;
  code: string;
  label: string;
  active: boolean;
  amountMinor: number;
  currency: string;
  destinationCountryCode: string | null;
  environment: string;
}

export interface AdminShippingDestination {
  countryCode: string;
  label: string;
  enabled: boolean;
  carrierCode: string | null;
  environment: string;
}

export interface AdminTaxRule {
  id: string;
  jurisdiction: string;
  classification: string;
  rateBasisPoints: number;
  taxInclusive: boolean;
  priority: number;
  environment: 'TEST' | 'PRODUCTION';
  effectiveFrom: string;
  effectiveTo: string | null;
}
