import { ApiProperty } from '@nestjs/swagger';
import type { CheckoutBlocker, CheckoutQuote, CheckoutQuoteLine } from '../contracts';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else: no internal-only
 * column, no other module's data, and never an echo of a rejected value.
 */

export class CheckoutBlockerResponse {
  @ApiProperty({
    type: String,
    enum: [
      'CART_EMPTY',
      'PRODUCT_UNAVAILABLE',
      'QUANTITY_UNSUPPORTED',
      'AMOUNT_UNSUPPORTED',
      'INSUFFICIENT_STOCK',
      'DESTINATION_NOT_SUPPORTED',
      'SHIPPING_NOT_APPROVED',
      'TAX_RULE_MISSING',
      'TAX_PRICING_MODE_MIXED',
      'CURRENCY_NOT_SETTLED',
    ],
  })
  public code!: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  public lineId?: string;

  @ApiProperty({ type: String, required: false })
  public sku?: string;
}

export class CheckoutQuoteLineResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public lineId!: string;

  @ApiProperty({ type: String, enum: ['VARIANT', 'BUNDLE'] })
  public targetKind!: string;

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

  @ApiProperty({
    type: Number,
    description: 'The price the customer pays now, in exact integer minor units.',
  })
  public unitPriceMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public unitCurrency!: string;

  @ApiProperty({
    type: Boolean,
    description: 'True when the price differs from the price the customer last agreed to.',
  })
  public priceChanged!: boolean;

  @ApiProperty({ type: String })
  public taxClassification!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public taxRuleId!: string | null;

  @ApiProperty({ type: Number })
  public taxRateBasisPoints!: number;

  @ApiProperty({ type: Boolean })
  public taxInclusive!: boolean;

  @ApiProperty({
    type: Number,
    description: 'The net amount of the line before tax, in exact integer minor units.',
  })
  public netMinor!: number;

  @ApiProperty({
    type: Number,
    description: 'The tax on the line, in exact integer minor units.',
  })
  public taxMinor!: number;

  @ApiProperty({
    type: Number,
    description: 'The amount the customer pays for the line, in exact integer minor units.',
  })
  public totalMinor!: number;
}

export class CheckoutQuoteResponse {
  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public destinationCountryCode!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public taxJurisdiction!: string;

  @ApiProperty({
    type: Boolean,
    description: 'True when the cart can be checked out without any blocker.',
  })
  public ready!: boolean;

  @ApiProperty({
    type: [CheckoutBlockerResponse],
    description: 'Every reason the quote is not ready.',
  })
  public blockers!: CheckoutBlockerResponse[];

  @ApiProperty({ type: [CheckoutQuoteLineResponse] })
  public lines!: CheckoutQuoteLineResponse[];

  @ApiProperty({
    type: Number,
    description: 'The net subtotal before tax, in exact integer minor units.',
  })
  public netSubtotalMinor!: number;

  @ApiProperty({
    type: Number,
    description: 'The tax total, in exact integer minor units.',
  })
  public taxTotalMinor!: number;

  @ApiProperty({
    type: Number,
    description: 'The amount the customer pays, in exact integer minor units.',
  })
  public totalMinor!: number;

  @ApiProperty({ type: String })
  public roundingRule!: string;

  @ApiProperty({
    type: String,
    description:
      'A deterministic digest of the quote. It changes when any material amount, line, or destination changes.',
  })
  public fingerprint!: string;
}

export class CheckoutDestinationResponse {
  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public countryCode!: string;

  @ApiProperty({ type: Boolean })
  public enabled!: boolean;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public taxJurisdiction!: string;

  @ApiProperty({ type: Boolean })
  public shippingApproved!: boolean;

  @ApiProperty({ type: String })
  public label!: string;
}

export class CheckoutDestinationsResponse {
  @ApiProperty({ type: [CheckoutDestinationResponse] })
  public destinations!: CheckoutDestinationResponse[];
}

export function toCheckoutBlockerResponse(blocker: CheckoutBlocker): CheckoutBlockerResponse {
  return {
    code: blocker.code,
    ...(blocker.lineId === undefined ? {} : { lineId: blocker.lineId }),
    ...(blocker.sku === undefined ? {} : { sku: blocker.sku }),
  };
}

export function toCheckoutQuoteLineResponse(line: CheckoutQuoteLine): CheckoutQuoteLineResponse {
  return {
    lineId: line.lineId,
    targetKind: line.targetKind,
    variantId: line.variantId,
    bundleId: line.bundleId,
    sku: line.sku,
    productId: line.productId,
    productName: line.productName,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    unitCurrency: line.unitCurrency,
    priceChanged: line.priceChanged,
    taxClassification: line.taxClassification,
    taxRuleId: line.taxRuleId,
    taxRateBasisPoints: line.taxRateBasisPoints,
    taxInclusive: line.taxInclusive,
    netMinor: line.netMinor,
    taxMinor: line.taxMinor,
    totalMinor: line.totalMinor,
  };
}

export function toCheckoutQuoteResponse(quote: CheckoutQuote): CheckoutQuoteResponse {
  return {
    currency: quote.currency,
    destinationCountryCode: quote.destinationCountryCode,
    taxJurisdiction: quote.taxJurisdiction,
    ready: quote.ready,
    blockers: quote.blockers.map(toCheckoutBlockerResponse),
    lines: quote.lines.map(toCheckoutQuoteLineResponse),
    netSubtotalMinor: quote.netSubtotalMinor,
    taxTotalMinor: quote.taxTotalMinor,
    totalMinor: quote.totalMinor,
    roundingRule: quote.roundingRule,
    fingerprint: quote.fingerprint,
  };
}
