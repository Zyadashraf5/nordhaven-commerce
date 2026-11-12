import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import { destinationCountryCode } from './checkout.support';

/**
 * The request bodies of the checkout routes.
 *
 * Every schema is strict, so an unexpected field is refused rather than ignored, and every value
 * is normalized at the boundary.
 */

export class QuoteCheckoutRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    destinationCountryCode: destinationCountryCode(),
  });

  @ApiProperty({
    type: String,
    minLength: 2,
    maxLength: 2,
    description: 'The destination country the cart is quoted for.',
  })
  public destinationCountryCode!: string;
}

export class ConfigureDestinationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    enabled: z.boolean(),
    taxJurisdiction: destinationCountryCode(),
    shippingApproved: z.boolean(),
    label: z.string().trim().min(1).max(120),
  });

  @ApiProperty({ type: Boolean })
  public enabled!: boolean;

  @ApiProperty({
    type: String,
    minLength: 2,
    maxLength: 2,
    description: 'The jurisdiction whose tax rules apply to this destination.',
  })
  public taxJurisdiction!: string;

  @ApiProperty({
    type: Boolean,
    description:
      'True when an approved shipping rule covers this destination. A destination needs both an approved shipping rule and an approved tax rule before a customer may check out.',
  })
  public shippingApproved!: boolean;

  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  public label!: string;
}

export class DestinationCountryParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    countryCode: destinationCountryCode(),
  });

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public countryCode!: string;
}
