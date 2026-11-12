import { ApiProperty } from '@nestjs/swagger';
import type { CartLineView, CartView } from '../application/cart.service';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else: no internal-only
 * column, no other module's data, and never an echo of a rejected value.
 */

export class CartLineResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, enum: ['VARIANT', 'BUNDLE'] })
  public targetKind!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public variantId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public bundleId!: string | null;

  @ApiProperty({
    type: String,
    description: 'The SKU for a SKU line, the bundle name for a bundle line.',
  })
  public sku!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: String })
  public productName!: string;

  @ApiProperty({ type: String })
  public productSlug!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 999 })
  public quantity!: number;

  @ApiProperty({
    type: Number,
    description: 'The price the customer last agreed to, in exact integer minor units.',
  })
  public lastKnownUnitPriceMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public lastKnownUnitCurrency!: string;

  @ApiProperty({
    type: Number,
    description: 'The price the customer would pay now, in exact integer minor units.',
  })
  public currentUnitPriceMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currentUnitCurrency!: string;

  @ApiProperty({
    type: Boolean,
    description: 'True when the current price differs from the price the customer last agreed to.',
  })
  public priceChanged!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'False when the product is no longer published, so the line cannot be bought.',
  })
  public purchasable!: boolean;
}

export class CartResponse {
  @ApiProperty({ type: [CartLineResponse] })
  public lines!: CartLineResponse[];

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export function toCartLineResponse(line: CartLineView): CartLineResponse {
  return {
    id: line.id,
    targetKind: line.targetKind,
    variantId: line.variantId,
    bundleId: line.bundleId,
    sku: line.sku,
    productId: line.productId,
    productName: line.productName,
    productSlug: line.productSlug,
    quantity: line.quantity,
    lastKnownUnitPriceMinor: line.lastKnownUnitPriceMinor,
    lastKnownUnitCurrency: line.lastKnownUnitCurrency,
    currentUnitPriceMinor: line.currentUnitPriceMinor,
    currentUnitCurrency: line.currentUnitCurrency,
    priceChanged: line.priceChanged,
    purchasable: line.purchasable,
  };
}

export function toCartResponse(cart: CartView): CartResponse {
  return {
    lines: cart.lines.map(toCartLineResponse),
    updatedAt: cart.updatedAt.toISOString(),
  };
}
