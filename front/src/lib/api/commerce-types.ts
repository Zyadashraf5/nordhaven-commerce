/**
 * Cart, wishlist, checkout, order and payment shapes from the backend OpenAPI
 * contract (1.3.0). Amounts are exact integer minor units.
 */

export interface ApiCartLine {
  id: string;
  targetKind: 'VARIANT' | 'BUNDLE';
  variantId: string | null;
  bundleId: string | null;
  /** The SKU for a SKU line, the bundle name for a bundle line. */
  sku: string;
  productId: string;
  productName: string;
  productSlug: string;
  quantity: number;
  lastKnownUnitPriceMinor: number;
  lastKnownUnitCurrency: string;
  currentUnitPriceMinor: number;
  currentUnitCurrency: string;
  priceChanged: boolean;
  /** False when the product is no longer published. */
  purchasable: boolean;
}

export interface ApiCart {
  lines: ApiCartLine[];
  updatedAt: string;
}

export interface ApiWishlistItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  currentPriceMinor: number;
  currentCurrency: string;
  purchasable: boolean;
  savedAt: string;
}

export interface ApiWishlist {
  items: ApiWishlistItem[];
}

export type CheckoutBlockerCode =
  | 'CART_EMPTY'
  | 'PRODUCT_UNAVAILABLE'
  | 'QUANTITY_UNSUPPORTED'
  | 'AMOUNT_UNSUPPORTED'
  | 'INSUFFICIENT_STOCK'
  | 'DESTINATION_NOT_SUPPORTED'
  | 'SHIPPING_NOT_APPROVED'
  | 'TAX_RULE_MISSING'
  | 'TAX_PRICING_MODE_MIXED'
  | 'CURRENCY_NOT_SETTLED';

export interface ApiCheckoutBlocker {
  code: CheckoutBlockerCode;
  lineId?: string;
  sku?: string;
}

export interface ApiQuoteLine {
  lineId: string;
  targetKind: 'VARIANT' | 'BUNDLE';
  variantId: string | null;
  bundleId: string | null;
  sku: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
  unitCurrency: string;
  priceChanged: boolean;
  taxClassification: string;
  taxRuleId: string | null;
  taxRateBasisPoints: number;
  taxInclusive: boolean;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface ApiCheckoutQuote {
  currency: string;
  destinationCountryCode: string;
  taxJurisdiction: string;
  ready: boolean;
  blockers: ApiCheckoutBlocker[];
  lines: ApiQuoteLine[];
  netSubtotalMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
  roundingRule: string;
  fingerprint: string;
}

export interface ApiShippingOption {
  code: string;
  label: string;
  amountMinor: number;
  currency: string;
  destinationCountryCode: string | null;
}

export interface ApiShippingOptions {
  environment: 'TEST' | 'PRODUCTION';
  /** Informational configuration; no shipping charge is collected. */
  chargeCollected: boolean;
  options: ApiShippingOption[];
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PAID_PENDING_ALLOCATION'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FULFILLED'
  | 'REFUNDED';

export interface ApiOrderLine {
  id: string;
  bundleId: string | null;
  variantId: string | null;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  unitCurrency: string;
  discountBasisPoints: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxClassification: string;
  taxInclusive: boolean;
  taxRateBasisPoints: number;
  composition: unknown[];
}

export interface ApiOrder {
  id: string;
  status: OrderStatus;
  statusReason: string | null;
  currency: string;
  destinationCountryCode: string;
  taxJurisdiction: string;
  /** Net subtotal before tax. */
  subtotalMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
  refundedMinor: number;
  quoteFingerprint: string;
  reservationId: string | null;
  /** End of the pending-payment stock hold. */
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: ApiOrderLine[];
}

export interface ApiOrderList {
  orders: ApiOrder[];
}

export interface ApiPaymentAttempt {
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

export interface ApiPaymentList {
  attempts: ApiPaymentAttempt[];
}
