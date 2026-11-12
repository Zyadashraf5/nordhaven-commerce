import type { CartIntentLine } from '../cart';
/**
 * The Checkout capability's published contract.
 *
 * The Milestone 09 Orders capability consumes this contract to create an order from a validated
 * quote. It never reaches into the Checkout module's tables or repositories, and the Checkout module
 * never depends on Orders, so the two do not form a cycle.
 */

/** The reason a quote is not ready. The set is closed, so a client can render it exhaustively. */
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

/** One reason the quote cannot be completed. */
export interface CheckoutBlocker {
  readonly code: CheckoutBlockerCode;
  /** The affected cart line, when the reason belongs to one line. */
  readonly lineId?: string;
  /** The affected SKU, when the reason belongs to one line. */
  readonly sku?: string;
}

/** What a cart line names: a catalog SKU, or a bundle. */
export type CheckoutLineTargetKind = 'VARIANT' | 'BUNDLE';

/** One priced line of a quote. */
export interface CheckoutQuoteLine {
  /** The cart line the quote line came from. */
  readonly lineId: string;
  readonly targetKind: CheckoutLineTargetKind;
  /** The catalog SKU, when the line names one. */
  readonly variantId: string | null;
  /** The bundle, when the line names one. */
  readonly bundleId: string | null;
  /** The SKU or bundle reference a customer sees. */
  readonly sku: string;
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  /** The price the customer would pay now, in exact integer minor units. */
  readonly unitPriceMinor: number;
  readonly unitCurrency: string;
  readonly discountBasisPoints: number;
  /** True when the price differs from the price the customer last agreed to. */
  readonly priceChanged: boolean;
  /** The tax classification the line was assessed under. */
  readonly taxClassification: string;
  /** The tax rule the line was assessed under, or null when no rule applied. */
  readonly taxRuleId: string | null;
  readonly taxRateBasisPoints: number;
  /** True when the line's price already includes the tax. */
  readonly taxInclusive: boolean;
  /** The net amount of the line, before tax, in exact integer minor units. */
  readonly netMinor: number;
  /** The tax on the line, in exact integer minor units. */
  readonly taxMinor: number;
  /** The amount the customer pays for the line, in exact integer minor units. */
  readonly totalMinor: number;
}

/** A priced, validated view of a customer's cart for one destination. */
export interface CheckoutQuote {
  /** The settlement currency of the quote. */
  readonly currency: string;
  /** The destination country the quote was produced for. */
  readonly destinationCountryCode: string;
  /** The jurisdiction whose tax rules were applied. */
  readonly taxJurisdiction: string;
  /** True when the cart can be checked out without any blocker. */
  readonly ready: boolean;
  /** Every reason the quote is not ready, so the customer sees them all at once. */
  readonly blockers: readonly CheckoutBlocker[];
  readonly lines: readonly CheckoutQuoteLine[];
  /** The net subtotal of every line, before tax, in exact integer minor units. */
  readonly netSubtotalMinor: number;
  /** The tax total of every line, in exact integer minor units. */
  readonly taxTotalMinor: number;
  /** The amount the customer pays, in exact integer minor units. */
  readonly totalMinor: number;
  /** The rounding rule the tax assessment used. */
  readonly roundingRule: string;
  /**
   * A deterministic digest of the quote's material content.
   *
   * It changes when any material amount, line, or destination changes, so a later step can detect
   * that it is working from a stale price.
   */
  readonly fingerprint: string;
}

/** A request to quote a customer's cart for a destination. */
export interface CheckoutQuoteRequest {
  readonly intent?: readonly CartIntentLine[];
  /** The customer whose cart is quoted. */
  readonly customerId: string;
  /** The destination country code the quote is produced for. */
  readonly destinationCountryCode: string;
}

/**
 * The Checkout capability's published quote contract.
 *
 * The Orders capability quotes through it before creating an order, so the order's price snapshot
 * and the customer's confirmation always refer to the same figures.
 */
export interface CheckoutQuoter {
  quote(request: CheckoutQuoteRequest): Promise<CheckoutQuote>;
}

/** The injection token the Checkout capability publishes its quoter under. */
export const CHECKOUT_QUOTER = Symbol('CHECKOUT_QUOTER');
