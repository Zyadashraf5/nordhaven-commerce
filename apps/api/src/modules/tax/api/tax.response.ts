import { ApiProperty } from '@nestjs/swagger';
import type { TaxRuleView } from '../application/tax.service';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else: no internal-only
 * column and never an echo of a rejected value.
 */

export class TaxRuleResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, enum: ['TEST', 'PRODUCTION'] })
  public environment!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public jurisdiction!: string;

  @ApiProperty({ type: String })
  public classification!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 10000 })
  public rateBasisPoints!: number;

  @ApiProperty({
    type: Boolean,
    description: 'True when the configured price already includes the tax.',
  })
  public taxInclusive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  public effectiveFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public effectiveTo!: string | null;

  @ApiProperty({ type: Number })
  public priority!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public createdByUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public updatedByUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class TaxRulesResponse {
  @ApiProperty({ type: [TaxRuleResponse] })
  public rules!: TaxRuleResponse[];
}

export function toTaxRuleResponse(rule: TaxRuleView): TaxRuleResponse {
  return {
    id: rule.id,
    environment: rule.environment,
    jurisdiction: rule.jurisdiction,
    classification: rule.classification,
    rateBasisPoints: rule.rateBasisPoints,
    taxInclusive: rule.taxInclusive,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    priority: rule.priority,
    createdByUserId: rule.createdByUserId,
    updatedByUserId: rule.updatedByUserId,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

export function toTaxRulesResponse(rules: readonly TaxRuleView[]): TaxRulesResponse {
  return { rules: rules.map(toTaxRuleResponse) };
}
