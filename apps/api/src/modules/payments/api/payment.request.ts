import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';

/**
 * The request bodies of the payment and refund routes.
 *
 * Every schema is strict, so an unexpected field is refused rather than ignored. A request that
 * carries a price, a total, or a card number is therefore impossible to make.
 */

export class CreatePaymentAttemptRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    orderId: z.uuid(),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;
}

export class CreateRefundRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    paymentAttemptId: z.uuid(),
    amountMinor: z.number().int().min(1).max(2_147_483_647),
    reason: z.string().trim().min(1).max(300).nullable().default(null),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public paymentAttemptId!: string;

  @ApiProperty({
    type: Number,
    minimum: 1,
    maximum: 2_147_483_647,
    description: 'The exact integer minor units the refund covers.',
  })
  public amountMinor!: number;

  @ApiProperty({ type: String, minLength: 1, maxLength: 300, nullable: true })
  public reason!: string | null;
}

export class PaymentAttemptIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    paymentAttemptId: z.uuid(),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public paymentAttemptId!: string;
}
