import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';

/**
 * The request bodies of the order and pre-order routes.
 *
 * Every schema is strict, so an unexpected field is refused rather than ignored. A request that
 * carries a price, a tax amount, or a total is therefore impossible to make, which is the
 * boundary's expression of the rule that a client never supplies an amount.
 */

/** A destination country code: exactly two letters. */
function destinationCountryCode() {
  return z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase());
}

export class CreateOrderRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    destinationCountryCode: destinationCountryCode(),
    /**
     * The fingerprint of the quote the customer confirmed.
     *
     * It is a token that says "this is what I saw", not an amount. When it differs from the
     * recomputed quote, the price changed and the customer must confirm the new figure.
     */
    expectedFingerprint: z.string().trim().length(64).nullable().default(null),
  });

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public destinationCountryCode!: string;

  @ApiProperty({ type: String, minLength: 64, maxLength: 64, nullable: true })
  public expectedFingerprint!: string | null;
}

export class CreatePreOrderRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    destinationCountryCode: destinationCountryCode(),
  });

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public destinationCountryCode!: string;
}

export class OrderIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ orderId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;
}

export class PreOrderIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ preOrderId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public preOrderId!: string;
}

export class IdempotencyKeyHeader {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    idempotencyKey: z.string().trim().min(8).max(200),
  });

  @ApiProperty({
    type: String,
    minLength: 8,
    maxLength: 200,
    description:
      'The stable business key that makes a repeated request safe. It is scoped to the customer.',
  })
  public idempotencyKey!: string;
}

export class ConvertPreOrderRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    expectedFingerprint: z.string().trim().length(64).nullable().default(null),
  });
  @ApiProperty({ type: String, minLength: 64, maxLength: 64, nullable: true })
  public expectedFingerprint!: string | null;
}
