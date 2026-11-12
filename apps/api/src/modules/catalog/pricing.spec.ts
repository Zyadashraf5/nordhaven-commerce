import { discountedAmountMinor, effectivePriceMinor } from './pricing';

describe('catalog pricing', () => {
  describe('discountedAmountMinor', () => {
    it('rounds a half case up, at the effective-price boundary', () => {
      // 1999 * 5000 / 10000 = 999.5 exactly, which rounds half up to 1000.
      expect(discountedAmountMinor(1999, 5000)).toBe(1000);
    });

    it('rounds down below the half and up above it', () => {
      expect(discountedAmountMinor(1999, 4999)).toBe(999);
      expect(discountedAmountMinor(1999, 5001)).toBe(1000);
    });

    it('discounts nothing at zero basis points', () => {
      expect(discountedAmountMinor(129900, 0)).toBe(0);
    });

    it('discounts the whole amount at one hundred percent', () => {
      expect(discountedAmountMinor(129900, 10000)).toBe(129900);
    });

    it('keeps every intermediate value exact at the largest supported amount', () => {
      // 2,000,000,000 * 10,000 is 2 * 10^13, far below Number.MAX_SAFE_INTEGER.
      expect(discountedAmountMinor(2_000_000_000, 10000)).toBe(2_000_000_000);
      expect(discountedAmountMinor(2_000_000_000, 5000)).toBe(1_000_000_000);
      expect(discountedAmountMinor(2_000_000_000, 1)).toBe(200_000);
    });

    it('is exact for every basis point at a price that exercises a half case', () => {
      for (let basisPoints = 0; basisPoints <= 10000; basisPoints += 1) {
        const expected = Math.floor((1299 * basisPoints + 5000) / 10000);
        expect(discountedAmountMinor(1299, basisPoints)).toBe(expected);
      }
    });
  });

  describe('effectivePriceMinor', () => {
    it('equals the base price when there is no discount', () => {
      expect(effectivePriceMinor(129900, 0)).toBe(129900);
    });

    it('equals the base price reduced by the rounded discount', () => {
      expect(effectivePriceMinor(1999, 5000)).toBe(999);
      // 129900 * 2500 / 10000 is exactly 32475, so a quarter off leaves 97425.
      expect(effectivePriceMinor(129900, 2500)).toBe(97425);
    });

    it('is zero, never negative, at a full discount', () => {
      expect(effectivePriceMinor(129900, 10000)).toBe(0);
    });

    it('is zero for a zero base price', () => {
      expect(effectivePriceMinor(0, 5000)).toBe(0);
    });

    it('never exceeds the base price', () => {
      for (let basisPoints = 0; basisPoints <= 10000; basisPoints += 1) {
        const effective = effectivePriceMinor(129900, basisPoints);
        expect(effective).toBeGreaterThanOrEqual(0);
        expect(effective).toBeLessThanOrEqual(129900);
      }
    });

    it('matches the database expression exactly for a range of amounts', () => {
      // The stored value is constrained by this expression in PostgreSQL, so the application rule
      // and the storage rule must agree bit for bit.
      for (const basePriceMinor of [0, 1, 2, 3, 1999, 5000, 129900, 2_000_000_000]) {
        for (const basisPoints of [0, 1, 3333, 5000, 9999, 10000]) {
          const expected =
            basePriceMinor - Math.floor((basePriceMinor * basisPoints + 5000) / 10000);
          expect(effectivePriceMinor(basePriceMinor, basisPoints)).toBe(Math.max(0, expected));
        }
      }
    });
  });
});
