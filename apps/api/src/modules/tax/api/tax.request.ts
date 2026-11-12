import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import { countryCode, taxClassification, taxRateBasisPoints } from './tax.support';

/**
 * The request bodies of the tax administration routes.
 *
 * Every schema is strict, so an unexpected field is refused rather than ignored, and every value
 * is normalized at the boundary.
 */

/** An ISO 8601 instant, which the effective window is expressed in. */
function instant() {
  return z
    .string()
    .trim()
    .datetime({ offset: true })
    .transform((value) => new Date(value));
}

export class CreateTaxRuleRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    jurisdiction: countryCode(),
    classification: taxClassification(),
    rateBasisPoints: taxRateBasisPoints(),
    taxInclusive: z.boolean().default(false),
    effectiveFrom: instant(),
    effectiveTo: instant().nullable().default(null),
    priority: z.number().int().min(0).max(10_000).default(0),
  });

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public jurisdiction!: string;

  @ApiProperty({ type: String })
  public classification!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 10000 })
  public rateBasisPoints!: number;

  @ApiProperty({ type: Boolean })
  public taxInclusive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  public effectiveFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public effectiveTo!: string | null;

  @ApiProperty({ type: Number, minimum: 0, maximum: 10000 })
  public priority!: number;
}

export class SetTaxClassificationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    classification: taxClassification(),
  });

  @ApiProperty({ type: String })
  public classification!: string;
}

export class TaxRuleIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ ruleId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public ruleId!: string;
}

export class TaxProductIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ productId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;
}
