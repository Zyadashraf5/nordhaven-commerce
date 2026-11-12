/**
 * The catalog's money rules.
 *
 * This file is a leaf of the Catalog module: it imports nothing, so the request-boundary schemas,
 * the application services, and the persistence repositories can all use the same arithmetic without
 * any layer importing another. Keeping one definition of the rule is what makes the stored
 * effective price, the price filter, and the response projection agree with each other and with the
 * database constraint that enforces them.
 *
 * Every amount is an exact integer count of minor units in an explicit currency. No
 * binary floating-point arithmetic is used to compute a monetary amount (constitution principle
 * VIII).
 */

/** The largest discount the storage type can hold: one hundred percent. */
export const MAX_DISCOUNT_BASIS_POINTS = 10_000;

/**
 * The discounted amount, in minor units, for a base price and a discount in basis points.
 *
 * The rule is half up, applied once, at the effective-price boundary: the exact fraction
 * `base * bps / 10000` is rounded to the nearest whole minor unit, with a half case rounding up.
 *
 * The arithmetic stays exact in integer form. The platform bounds the base price at
 * 2,000,000,000 minor units and the discount at 10,000 basis points, so the product is at most
 * 2 * 10^13, far below `Number.MAX_SAFE_INTEGER` (about 9 * 10^15). Every intermediate value is
 * therefore exactly representable and the result is exact.
 */
export function discountedAmountMinor(basePriceMinor: number, discountBasisPoints: number): number {
  return Math.floor((basePriceMinor * discountBasisPoints + 5000) / 10000);
}

/**
 * The price a customer pays: the base price reduced by the direct discount.
 *
 * The result is never negative, so a full discount yields exactly zero rather than a negative
 * amount. The database constrains the stored value to this same expression, so the storage layer
 * refuses any value that disagrees with it.
 */
export function effectivePriceMinor(basePriceMinor: number, discountBasisPoints: number): number {
  const discounted = discountedAmountMinor(basePriceMinor, discountBasisPoints);
  return Math.max(0, basePriceMinor - discounted);
}
