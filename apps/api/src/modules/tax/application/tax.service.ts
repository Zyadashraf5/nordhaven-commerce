import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import { DEFAULT_TAX_CLASSIFICATION } from '../api/tax.support';
import {
  type AssessedTaxLine,
  type TaxAssessment,
  type TaxAssessor,
  type TaxAssessmentRequest,
  type TaxableLine,
} from '../contracts';
import { assessTax, selectTaxRule } from './tax.engine';
import {
  type TaxRuleAttributes,
  type TaxRuleRecord,
  TaxRepository,
  TaxRuleConflictError,
} from '../persistence/tax.repository';
import {
  isForeignKeyConstraintViolation,
  isRecordNotFoundError,
} from '../persistence/prisma-errors';

/** One tax rule as the administrative surface presents it. */
export interface TaxRuleView {
  readonly id: string;
  readonly environment: 'TEST' | 'PRODUCTION';
  readonly jurisdiction: string;
  readonly classification: string;
  readonly rateBasisPoints: number;
  readonly taxInclusive: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly priority: number;
  readonly createdByUserId: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * The tax configuration and the tax calculation.
 *
 * The service owns the configuration and the selection of the applicable rules; the engine owns the
 * arithmetic. A missing rule is reported rather than treated as a zero rate, so a caller can block
 * the quote.
 */
@Injectable()
export class TaxService implements TaxAssessor {
  public constructor(private readonly taxes: TaxRepository) {}

  /** Every configured rule. */
  public async listRules(): Promise<TaxRuleView[]> {
    return (await this.taxes.listRules()).map(toRuleView);
  }

  /** Creates a rule. */
  public async createRule(attributes: TaxRuleAttributes): Promise<TaxRuleView> {
    try {
      return toRuleView(await this.taxes.createRule(attributes));
    } catch (error) {
      if (error instanceof TaxRuleConflictError) throw AppError.taxRuleConflict();
      throw error;
    }
  }

  /** Removes a rule. */
  public async removeRule(id: string, actorUserId: string | null = null): Promise<void> {
    try {
      await this.taxes.deleteRule(id, actorUserId);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw AppError.taxRuleNotFound();
      throw error;
    }
  }

  /** The classification of a product, or the standard classification when it has none. */
  public async classificationOf(productId: string): Promise<string> {
    return (await this.taxes.findClassification(productId)) ?? DEFAULT_TAX_CLASSIFICATION;
  }

  /** The classifications of a set of products, defaulting to the standard classification. */
  public async classificationsOf(productIds: readonly string[]): Promise<Map<string, string>> {
    const stored = await this.taxes.findClassifications(productIds);
    const resolved = new Map<string, string>();
    for (const productId of productIds) {
      resolved.set(productId, stored.get(productId) ?? DEFAULT_TAX_CLASSIFICATION);
    }
    return resolved;
  }

  /**
   * The classification of each product, keyed by product identifier.
   *
   * The Tax capability owns the classification, so a caller never resolves it itself; a product
   * with no explicit classification uses the standard one.
   */
  public async classifyProducts(productIds: readonly string[]): Promise<Map<string, string>> {
    return this.classificationsOf(productIds);
  }

  /** Sets the classification of a product. */
  public async setClassification(
    productId: string,
    classification: string,
    actorUserId: string | null = null,
  ): Promise<void> {
    try {
      await this.taxes.setClassification(productId, classification, actorUserId);
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) throw AppError.productNotFound();
      throw error;
    }
  }

  /** Removes the classification of a product, returning it to the standard classification. */
  public async clearClassification(
    productId: string,
    actorUserId: string | null = null,
  ): Promise<void> {
    await this.taxes.clearClassification(productId, actorUserId);
  }

  /**
   * Assesses the tax on a set of priced lines for one jurisdiction.
   *
   * The rules are the ones configured for the environment and the jurisdiction, and the assessment
   * is the engine's. The product classifications are resolved here, because the Tax capability owns
   * them. A line whose classification has no rule is reported in `unclassifiedClassifications`,
   * which is what makes a missing rule a blocker rather than a zero rate.
   */
  public async assess(request: TaxAssessmentRequest): Promise<TaxAssessment> {
    const rules = await this.taxes.listRulesFor(request.environment, request.jurisdiction);
    const classifications = await this.classificationsOf(
      request.lines.map((line) => line.productId),
    );
    return assessTax(
      rules.map((rule) => ({
        id: rule.id,
        jurisdiction: rule.jurisdiction,
        classification: rule.classification,
        rateBasisPoints: rule.rateBasisPoints,
        taxInclusive: rule.taxInclusive,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        priority: rule.priority,
      })),
      request.lines.map((line) => ({
        lineId: line.lineId,
        classification: classifications.get(line.productId) ?? DEFAULT_TAX_CLASSIFICATION,
        grossMinor: line.grossMinor,
      })),
      new Date(),
    );
  }

  /**
   * The rule that applies to one classification in a jurisdiction right now.
   *
   * Exposed so the administrative surface can show which rule a jurisdiction actually applies,
   * without a caller re-implementing the selection.
   */
  public async effectiveRule(
    environment: 'TEST' | 'PRODUCTION',
    jurisdiction: string,
    classification: string,
  ): Promise<TaxRuleView | null> {
    const rules = await this.taxes.listRulesFor(environment, jurisdiction);
    const selected = selectTaxRule(
      rules.map((rule) => ({
        id: rule.id,
        jurisdiction: rule.jurisdiction,
        classification: rule.classification,
        rateBasisPoints: rule.rateBasisPoints,
        taxInclusive: rule.taxInclusive,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        priority: rule.priority,
      })),
      classification,
      new Date(),
    );
    if (selected === null) return null;
    const record = await this.taxes.findRuleById(selected.id);
    return record === null ? null : toRuleView(record);
  }
}

function toRuleView(rule: TaxRuleRecord): TaxRuleView {
  return {
    id: rule.id,
    environment: rule.environment,
    jurisdiction: rule.jurisdiction,
    classification: rule.classification,
    rateBasisPoints: rule.rateBasisPoints,
    taxInclusive: rule.taxInclusive,
    effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveTo: rule.effectiveTo === null ? null : rule.effectiveTo.toISOString(),
    priority: rule.priority,
    createdByUserId: rule.createdByUserId,
    updatedByUserId: rule.updatedByUserId,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

/** One assessed line, re-exported for the administrative projection. */
export type { AssessedTaxLine, TaxableLine };
