import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import { cartQuantity, itemId } from './cart.support';

/**
 * The request bodies of the cart routes.
 *
 * Every schema is strict, so an unexpected field is refused rather than ignored, and every value
 * is normalized at the boundary so the application layer receives a validated quantity or
 * identifier.
 */

export class AddCartItemRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    variantId: z.uuid(),
    quantity: cartQuantity(),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public variantId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 999 })
  public quantity!: number;
}

export class AddCartBundleRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    bundleId: z.uuid(),
    quantity: cartQuantity(),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public bundleId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 999 })
  public quantity!: number;
}

export class SetCartItemQuantityRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    quantity: cartQuantity(),
  });

  @ApiProperty({ type: Number, minimum: 1, maximum: 999 })
  public quantity!: number;
}

export class CartItemIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ itemId: itemId() });

  @ApiProperty({ type: String, format: 'uuid' })
  public itemId!: string;
}
