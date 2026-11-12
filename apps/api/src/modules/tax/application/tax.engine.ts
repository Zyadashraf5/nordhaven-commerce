import { roundHalfUp, TAX_ROUNDING_RULE } from '../api/tax.support';

/**
 * The tax calculation engine.
 *
 * The engine is a pure function: it takes the applicable rules and the priced lines, and returns the
 * tax breakdown. It performs no I/O, so it is exhaustively testable and cannot drift from the
 * persistence layer.
 *
 * Every amount is an exact integer count of minor units. No monetary value ever passes through a
 * binary floating-point representation.
 */

/** One tax rule as the engine sees it. */
export interface TaxRuleInput {
  readonly id: string;
  readonly jurisdiction: string;
  readonly classification: string;
  /** The rate as an exact number of basis points; one hundred is one percent. */
  readonly rateBasisPoints: number;
  /** True when the priced amount already includes the tax. */
  readonly taxInclusive: boolean;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly priority: number;
}

/** One priced line the tax is assessed on. */
export interface TaxableLineInput {
  /** The line's identity, echoed in the result so a caller can match the lines up. */
  readonly lineId: string;
  /** The product's tax classification. */
  readonly classification: string;
  /** The priced amount of the line in minor units, before any tax is removed. */
  readonly grossMinor: number;
}

/** The tax assessed on one line. */
export interface TaxLineResult {
  readonly lineId: string;
  readonly classification: string;
  /** The rule the tax was assessed under, or null when no rule applied. */
  readonly ruleId: string | null;
  readonly rateBasisPoints: number;
  /** True when the priced amount already included the tax. */
  readonly taxInclusive: boolean;
  /** The priced amount of the line, in minor units. */
  readonly grossMinor: number;
  /** The net amount of the line, before tax, in minor units. */
  readonly netMinor: number;
  /** The tax on the line, in minor units. */
  readonly taxMinor: number;
  /** The amount the customer pays for the line, in minor units. */
  readonly totalMinor: number;
}

/** The tax assessment of a whole quote. */
export interface TaxAssessment {
  readonly lines: readonly TaxLineResult[];
  /** The net subtotal of every line, before tax, in minor units. */
  readonly netSubtotalMinor: number;
  /** The tax total of every line, in minor units. */
  readonly taxTotalMinor: number;
  /** The amount the customer pays in total, in minor units. */
  readonly totalMinor: number;
  /** The sum of the priced line amounts, in minor units. */
  readonly quotedSubtotalMinor: number;
  /** The rounding rule the assessment used. */
  readonly roundingRule: string;
  /** The classifications that had no applicable rule, so the caller can block the quote. */
  readonly unclassifiedClassifications: readonly string[];
  /** True when the rules mix tax-inclusive and tax-exclusive treatment, which makes one total ambiguous. */
  readonly mixedPricingModes: boolean;
}

/**
 * Selects the rule that applies to one classification.
 *
 * Several rules may match. The resolution is deterministic: the highest priority wins, then the most
 * recent effective start, then the lowest rule identifier. It is never the arbitrary order the
 * database happens to return the rows in, and the identifier tie-break matches the ascending order
 * the rules are listed in.
 */
export function selectTaxRule(
  rules: readonly TaxRuleInput[],
  classification: string,
  at: Date,
): TaxRuleInput | null {
  const candidates = rules.filter(
    (rule) =>
      rule.classification === classification &&
      rule.effectiveFrom <= at &&
      (rule.effectiveTo === null || rule.effectiveTo > at),
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) => {
    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best;
    }
    const byStart = candidate.effectiveFrom.getTime() - best.effectiveFrom.getTime();
    if (byStart !== 0) return byStart > 0 ? candidate : best;
    return candidate.id < best.id ? candidate : best;
  });
}

/**
 * Assesses the tax on a set of priced lines.
 *
 * The tax is assessed **per line** and rounded **once per line**, because tax is assessed per
 * item. A per-line round and then a sum is not the same as a round of a sum, and the decision is
 * that the per-line amount is the taxable one.
 *
 * A line whose classification has **no** applicable rule contributes a zero tax *and* is reported in
 * `unclassifiedClassifications`, so the caller can block the quote. A missing rule is never treated
 * as a zero rate.
 *
 * The identity `netSubtotalMinor + taxTotalMinor === totalMinor` holds exactly, in every
 * configuration, including a tax-inclusive one: a tax-inclusive line's total is the priced amount
 * the customer was shown, and a tax-exclusive line's total is that amount plus the tax.
 */
export function assessTax(
  rules: readonly TaxRuleInput[],
  lines: readonly TaxableLineInput[],
  at: Date,
): TaxAssessment {
  const results: TaxLineResult[] = [];
  const unclassified = new Set<string>();
  let inclusiveSeen = false;
  let exclusiveSeen = false;

  for (const line of lines) {
    const rule = selectTaxRule(rules, line.classification, at);
    if (rule === null) {
      unclassified.add(line.classification);
      results.push({
        lineId: line.lineId,
        classification: line.classification,
        ruleId: null,
        rateBasisPoints: 0,
        taxInclusive: false,
        grossMinor: line.grossMinor,
        netMinor: line.grossMinor,
        taxMinor: 0,
        totalMinor: line.grossMinor,
      });
      continue;
    }

    if (rule.taxInclusive) inclusiveSeen = true;
    else exclusiveSeen = true;

    if (rule.taxInclusive) {
      // The priced amount already includes the tax, so the net is extracted first and the tax is
      // exactly the difference. That keeps net + tax === gross to the last minor unit.
      const denominator = 10_000 + rule.rateBasisPoints;
      const netMinor = Math.min(
        line.grossMinor,
        roundHalfUp(BigInt(line.grossMinor) * 10_000n, denominator),
      );
      const taxMinor = line.grossMinor - netMinor;
      results.push({
        lineId: line.lineId,
        classification: line.classification,
        ruleId: rule.id,
        rateBasisPoints: rule.rateBasisPoints,
        taxInclusive: true,
        grossMinor: line.grossMinor,
        netMinor,
        taxMinor,
        totalMinor: netMinor + taxMinor,
      });
      continue;
    }

    // The price excludes the tax, so the tax is added to the exact net amount.
    const taxMinor = roundHalfUp(BigInt(line.grossMinor) * BigInt(rule.rateBasisPoints), 10_000);
    results.push({
      lineId: line.lineId,
      classification: line.classification,
      ruleId: rule.id,
      rateBasisPoints: rule.rateBasisPoints,
      taxInclusive: false,
      grossMinor: line.grossMinor,
      netMinor: line.grossMinor,
      taxMinor,
      totalMinor: line.grossMinor + taxMinor,
    });
  }

  const netSubtotalMinor = results.reduce((total, line) => total + line.netMinor, 0);
  const taxTotalMinor = results.reduce((total, line) => total + line.taxMinor, 0);
  const totalMinor = results.reduce((total, line) => total + line.totalMinor, 0);
  const quotedSubtotalMinor = results.reduce((total, line) => total + line.grossMinor, 0);

  return {
    lines: results,
    netSubtotalMinor,
    taxTotalMinor,
    totalMinor,
    quotedSubtotalMinor,
    roundingRule: TAX_ROUNDING_RULE,
    unclassifiedClassifications: [...unclassified].sort(),
    mixedPricingModes: inclusiveSeen && exclusiveSeen,
  };
}
