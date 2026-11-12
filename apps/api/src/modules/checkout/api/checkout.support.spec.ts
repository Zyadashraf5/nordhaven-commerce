import { quoteFingerprint, SETTLEMENT_CURRENCY } from './checkout.support';

/**
 * The Checkout capability's value-rule tests.
 *
 * The fingerprint is what lets a later step detect that the figures it holds are no longer the
 * figures the customer saw, so its behaviour is proven here exactly.
 */

const material = {
  destinationCountryCode: 'EG',
  currency: SETTLEMENT_CURRENCY,
  lines: [
    {
      lineId: 'line-1',
      variantId: 'variant-1',
      bundleId: null,
      quantity: 2,
      unitPriceMinor: 100_000,
      netMinor: 200_000,
      taxMinor: 28_000,
      totalMinor: 228_000,
    },
  ],
  netSubtotalMinor: 200_000,
  taxTotalMinor: 28_000,
  totalMinor: 228_000,
};

describe('the checkout value rules', () => {
  it('settles in EGP', () => {
    expect(SETTLEMENT_CURRENCY).toBe('EGP');
  });

  describe('the quote fingerprint', () => {
    it('is a hexadecimal digest of the expected length', () => {
      expect(quoteFingerprint(material)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is identical for the same material content', () => {
      expect(quoteFingerprint(material)).toBe(quoteFingerprint({ ...material }));
    });

    it('changes when a line amount changes', () => {
      const changed = { ...material, totalMinor: 228_001 };
      expect(quoteFingerprint(changed)).not.toBe(quoteFingerprint(material));
    });

    it('changes when a line quantity changes', () => {
      const changed = {
        ...material,
        lines: [{ ...material.lines[0]!, quantity: 3 }],
      };
      expect(quoteFingerprint(changed)).not.toBe(quoteFingerprint(material));
    });

    it('changes when the unit price changes', () => {
      const changed = {
        ...material,
        lines: [{ ...material.lines[0]!, unitPriceMinor: 100_001 }],
      };
      expect(quoteFingerprint(changed)).not.toBe(quoteFingerprint(material));
    });

    it('changes when the destination changes', () => {
      expect(quoteFingerprint({ ...material, destinationCountryCode: 'US' })).not.toBe(
        quoteFingerprint(material),
      );
    });

    it('changes when the tax changes', () => {
      const changed = {
        ...material,
        lines: [{ ...material.lines[0]!, taxMinor: 28_001 }],
        taxTotalMinor: 28_001,
      };
      expect(quoteFingerprint(changed)).not.toBe(quoteFingerprint(material));
    });

    it('changes when a line is added', () => {
      const changed = {
        ...material,
        lines: [
          ...material.lines,
          {
            lineId: 'line-2',
            variantId: 'variant-2',
            bundleId: null,
            quantity: 1,
            unitPriceMinor: 5_000,
            netMinor: 5_000,
            taxMinor: 700,
            totalMinor: 5_700,
          },
        ],
      };
      expect(quoteFingerprint(changed)).not.toBe(quoteFingerprint(material));
    });

    it('does not change when an unrelated line ordering does not change the content', () => {
      const reordered = { ...material, lines: [...material.lines].reverse() };
      expect(quoteFingerprint(reordered)).toBe(quoteFingerprint(material));
    });
  });
});
