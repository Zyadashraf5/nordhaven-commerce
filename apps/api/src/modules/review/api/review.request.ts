import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';

/**
 * The request bodies of the review routes.
 *
 * Every schema is strict, so an unexpected field is refused rather than ignored. A request that
 * carries a verified-purchase flag or a moderation status is therefore impossible to make: the
 * platform decides both.
 */

/** A rating: a whole number from one to five. */
const rating = z.number().int().min(1).max(5);

export class CreateReviewRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    productId: z.uuid(),
    rating,
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4000),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 5 })
  public rating!: number;

  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  public title!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 4000 })
  public body!: string;
}

export class EditReviewRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    rating,
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4000),
  });

  @ApiProperty({ type: Number, minimum: 1, maximum: 5 })
  public rating!: number;

  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  public title!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 4000 })
  public body!: string;
}

export class ReviewIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ reviewId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public reviewId!: string;
}

export class ProductReviewsQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    productId: z.uuid(),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;
}

export class ModerateReviewRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    decision: z.enum(['APPROVED', 'REJECTED']),
    /** The fixed reason the decision is recorded with. */
    reason: z.string().trim().min(1).max(200).nullable().default(null),
  });

  @ApiProperty({ type: 'string', enum: ['APPROVED', 'REJECTED'] })
  public decision!: 'APPROVED' | 'REJECTED';

  @ApiProperty({ type: String, minLength: 1, maxLength: 200, nullable: true })
  public reason!: string | null;
}
