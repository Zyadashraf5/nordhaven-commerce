import type { EnvironmentScopeValue } from './api/tax.support';

/**
 * The Tax capability's published contract.
 *
 * Another capability that needs a tax figure reads it through this contract and never through the
 * Tax module's tables or repositories. The contract is deliberately narrow: the rules to apply, the
 * lines to assess, and the result.
 */

/** One priced line the tax is assessed on. */
export interface TaxableLine {
  /** The line's identity, echoed in the result so a caller can match the lines up. */
  readonly lineId: string;
  /** The priced amount of the line in minor units, before any tax is removed. */
  readonly grossMinor: number;
}

/** The tax assessed on one line. */
export interface AssessedTaxLine {
  readonly lineId: string;
  readonly classification: string;
  /** The rule the tax was assessed under, or null when no rule applied. */
  readonly ruleId: string | null;
  readonly rateBasisPoints: number;
  /** True when the priced amount already included the tax. */
  readonly taxInclusive: boolean;
  /** The net amount of the line, before tax, in minor units. */
  readonly netMinor: number;
  /** The tax on the line, in exact integer minor units. */
  readonly taxMinor: number;
  /** The amount the customer pays for the line, in exact integer minor units. */
  readonly totalMinor: number;
}

/** The tax assessment of a whole quote. */
export interface TaxAssessment {
  readonly lines: readonly AssessedTaxLine[];
  /** The net subtotal of every line, before tax, in minor units. */
  readonly netSubtotalMinor: number;
  /** The tax total of every line, in minor units. */
  readonly taxTotalMinor: number;
  /** The amount the customer pays in total, in minor units. */
  readonly totalMinor: number;
  /** The rounding rule the assessment used. */
  readonly roundingRule: string;
  /** The classifications that had no applicable rule, so the caller can block the quote. */
  readonly unclassifiedClassifications: readonly string[];
  /** True when the rules mix tax-inclusive and tax-exclusive treatment, which makes one total ambiguous. */
  readonly mixedPricingModes: boolean;
}

/** A request to assess the tax on a set of priced lines. */
export interface TaxAssessmentRequest {
  /** The environment whose rules apply. */
  readonly environment: EnvironmentScopeValue;
  /** The jurisdiction whose rules apply, which is the destination's tax jurisdiction. */
  readonly jurisdiction: string;
  /**
   * The lines to assess, each with the product it belongs to.
   *
   * The Tax capability resolves the product's classification itself, because it owns the
   * classification; a caller never decides how a product is classified.
   */
  readonly lines: readonly {
    readonly lineId: string;
    readonly productId: string;
    readonly grossMinor: number;
  }[];
}

/**
 * The tax calculation the Tax capability publishes.
 *
 * A missing rule is reported through `unclassifiedClassifications` rather than treated as a zero
 * rate, so a caller can refuse to complete a quote for a jurisdiction it has not configured.
 */
export interface TaxAssessor {
  assess(request: TaxAssessmentRequest): Promise<TaxAssessment>;
  /**
   * The classification of each product, keyed by product identifier.
   *
   * The Tax capability owns the classification, so a caller never resolves it itself; a product
   * with no explicit classification uses the standard one.
   */
  classifyProducts(productIds: readonly string[]): Promise<Map<string, string>>;
}

/** The injection token the Tax module publishes its assessor under. */
export const TAX_ASSESSOR = Symbol('TAX_ASSESSOR');
