import { assessTax, selectTaxRule, type TaxRuleInput } from './tax.engine';

/**
 * The tax engine's unit tests.
 *
 * The engine is pure, so every rule it states is proven here without a database: the rounding, the
 * inclusive and exclusive treatments, the deterministic rule selection, the missing-rule report, and
 * the exactness of the totals.
 */

const at = new Date('2026-06-01T00:00:00.000Z');

function rule(overrides: Partial<TaxRuleInput> = {}): TaxRuleInput {
  return {
    id: 'rule-1',
    jurisdiction: 'EG',
    classification: 'STANDARD',
    rateBasisPoints: 1400,
    taxInclusive: false,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    priority: 0,
    ...overrides,
  };
}

describe('the tax engine', () => {
  describe('rule selection', () => {
    it('selects the only matching rule', () => {
      const selected = selectTaxRule([rule()], 'STANDARD', at);
      expect(selected?.id).toBe('rule-1');
    });

    it('returns nothing when no rule matches the classification', () => {
      expect(selectTaxRule([rule()], 'REDUCED', at)).toBeNull();
    });

    it('ignores a rule whose effective window has not opened', () => {
      const future = rule({ effectiveFrom: new Date('2026-12-01T00:00:00.000Z') });
      expect(selectTaxRule([future], 'STANDARD', at)).toBeNull();
    });

    it('ignores a rule whose effective window has closed', () => {
      const expired = rule({
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(selectTaxRule([expired], 'STANDARD', at)).toBeNull();
    });

    it('prefers the highest priority among several matching rules', () => {
      const selected = selectTaxRule(
        [rule({ id: 'low', priority: 0 }), rule({ id: 'high', priority: 10 })],
        'STANDARD',
        at,
      );
      expect(selected?.id).toBe('high');
    });

    it('breaks a priority tie by the most recent effective start', () => {
      const selected = selectTaxRule(
        [
          rule({ id: 'older', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }),
          rule({ id: 'newer', effectiveFrom: new Date('2026-03-01T00:00:00.000Z') }),
        ],
        'STANDARD',
        at,
      );
      expect(selected?.id).toBe('newer');
    });

    it('breaks a full tie deterministically by the rule identifier', () => {
      const selected = selectTaxRule([rule({ id: 'b' }), rule({ id: 'a' })], 'STANDARD', at);
      expect(selected?.id).toBe('a');
    });
  });

  describe('the exclusive treatment', () => {
    it('adds the tax to the priced amount', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 1400 })],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 100_000 }],
        at,
      );
      expect(assessment.lines[0]?.netMinor).toBe(100_000);
      expect(assessment.lines[0]?.taxMinor).toBe(14_000);
      expect(assessment.lines[0]?.totalMinor).toBe(114_000);
    });

    it('rounds a fractional amount half up', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 1400 })],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 105 }],
        at,
      );
      // 105 * 1400 / 10000 = 14.7, which rounds up to 15.
      expect(assessment.lines[0]?.taxMinor).toBe(15);
    });

    it('rounds an exact half up', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 5000 })],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 101 }],
        at,
      );
      // 101 * 5000 / 10000 = 50.5, which rounds up to 51.
      expect(assessment.lines[0]?.taxMinor).toBe(51);
    });

    it('produces no tax for a configured zero rate', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 0 })],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 100_000 }],
        at,
      );
      expect(assessment.lines[0]?.taxMinor).toBe(0);
      expect(assessment.lines[0]?.totalMinor).toBe(100_000);
    });
  });

  describe('the inclusive treatment', () => {
    it('extracts the tax from the priced amount', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 1400, taxInclusive: true })],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 114_000 }],
        at,
      );
      // 114000 already includes the tax: the net is 100000 and the tax is the difference.
      expect(assessment.lines[0]?.netMinor).toBe(100_000);
      expect(assessment.lines[0]?.taxMinor).toBe(14_000);
      expect(assessment.lines[0]?.totalMinor).toBe(114_000);
    });

    it('keeps the net and the tax summing to the priced amount exactly', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 1400, taxInclusive: true })],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 11_399 }],
        at,
      );
      const line = assessment.lines[0];
      expect(line).toBeDefined();
      expect((line?.netMinor ?? 0) + (line?.taxMinor ?? 0)).toBe(11_399);
    });
  });

  describe('the totals', () => {
    it('keeps the identity that the net subtotal plus the tax equals the total', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 1400 })],
        [
          { lineId: 'l1', classification: 'STANDARD', grossMinor: 129_900 },
          { lineId: 'l2', classification: 'STANDARD', grossMinor: 5_000 },
        ],
        at,
      );
      expect(assessment.netSubtotalMinor).toBe(134_900);
      expect(assessment.taxTotalMinor).toBe(18_886);
      expect(assessment.totalMinor).toBe(153_786);
      expect(assessment.netSubtotalMinor + assessment.taxTotalMinor).toBe(assessment.totalMinor);
    });

    it('rounds once per line rather than once per total', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 1000 })],
        [
          { lineId: 'l1', classification: 'STANDARD', grossMinor: 5 },
          { lineId: 'l2', classification: 'STANDARD', grossMinor: 5 },
        ],
        at,
      );
      // Each line rounds 0.5 up to 1, so the tax is 2, not 1.
      expect(assessment.taxTotalMinor).toBe(2);
    });

    it('names the rounding rule it used', () => {
      const assessment = assessTax([rule()], [], at);
      expect(assessment.roundingRule).toBe('half-up-per-line');
    });
  });

  describe('a missing rule', () => {
    it('reports the classification rather than assuming a zero rate', () => {
      const assessment = assessTax(
        [rule({ classification: 'STANDARD' })],
        [{ lineId: 'l1', classification: 'REDUCED', grossMinor: 100_000 }],
        at,
      );
      expect(assessment.unclassifiedClassifications).toEqual(['REDUCED']);
      expect(assessment.lines[0]?.ruleId).toBeNull();
    });

    it('does not treat the missing rule as an exemption', () => {
      const assessment = assessTax(
        [],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 100_000 }],
        at,
      );
      expect(assessment.unclassifiedClassifications).toEqual(['STANDARD']);
      expect(assessment.taxTotalMinor).toBe(0);
    });

    it('reports a configured zero rate differently from a missing rule', () => {
      const assessment = assessTax(
        [rule({ rateBasisPoints: 0 })],
        [{ lineId: 'l1', classification: 'STANDARD', grossMinor: 100_000 }],
        at,
      );
      expect(assessment.unclassifiedClassifications).toEqual([]);
      expect(assessment.lines[0]?.ruleId).toBe('rule-1');
    });
  });

  describe('mixed pricing modes', () => {
    it('reports that inclusive and exclusive rules were mixed', () => {
      const assessment = assessTax(
        [
          rule({ id: 'a', classification: 'STANDARD', taxInclusive: true }),
          rule({ id: 'b', classification: 'REDUCED', taxInclusive: false }),
        ],
        [
          { lineId: 'l1', classification: 'STANDARD', grossMinor: 100_000 },
          { lineId: 'l2', classification: 'REDUCED', grossMinor: 100_000 },
        ],
        at,
      );
      expect(assessment.mixedPricingModes).toBe(true);
    });

    it('does not report mixing when every rule agrees', () => {
      const assessment = assessTax(
        [
          rule({ id: 'a', classification: 'STANDARD' }),
          rule({ id: 'b', classification: 'REDUCED' }),
        ],
        [
          { lineId: 'l1', classification: 'STANDARD', grossMinor: 100_000 },
          { lineId: 'l2', classification: 'REDUCED', grossMinor: 100_000 },
        ],
        at,
      );
      expect(assessment.mixedPricingModes).toBe(false);
    });
  });
});

describe('large exact tax intermediates', () => {
  it('rounds inclusive line tax exactly when multiplication exceeds Number safe precision', () => {
    const assessment = assessTax(
      [rule({ rateBasisPoints: 76, taxInclusive: true })],
      [{ lineId: 'large', classification: 'STANDARD', grossMinor: 1_997_999_002_998 }],
      at,
    );
    expect(assessment.lines[0]?.netMinor).toBe(1_982_928_744_539);
    expect(assessment.netSubtotalMinor + assessment.taxTotalMinor).toBe(assessment.totalMinor);
  });
});
