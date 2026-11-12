import { z } from 'zod';
import {
  ENVIRONMENT_SCOPES,
  environmentScopeFor,
  type EnvironmentScopeValue,
} from '../../../platform/config/environment';

/**
 * The Tax capability's value rules.
 *
 * A tax rule is configuration data, never a constant: the approved decision forbids hardcoding a
 * rate as a universal rate, so the rate is an exact integer count of basis points and the engine
 * selects the rule that applies.
 */

/**
 * The environment a tax rule or a checkout destination belongs to.
 *
 * The scoping rule is a platform concept, because every scoped configuration shares it, so it
 * lives in the platform's configuration module and is re-exported here for the Tax capability's
 * existing importers.
 */
export { ENVIRONMENT_SCOPES, environmentScopeFor, type EnvironmentScopeValue };

/** The classification a product is taxed under when no explicit classification is set. */
export const DEFAULT_TAX_CLASSIFICATION = 'STANDARD';

/** The largest rate a rule may carry: one hundred percent. */
export const MAX_TAX_RATE_BASIS_POINTS = 10_000;

/** The rounding rule applied once per line. */
export const TAX_ROUNDING_RULE = 'half-up-per-line' as const;

/** A country code: exactly two letters. */
export function countryCode() {
  return z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase());
}

/** A tax classification code. */
export function taxClassification() {
  return z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase());
}

/** A rate in exact basis points. */
export function taxRateBasisPoints() {
  return z.number().int().min(0).max(MAX_TAX_RATE_BASIS_POINTS);
}

/**
 * Rounds a non-negative fraction to the nearest whole minor unit, half up.
 *
 * The addition of half the divisor before the truncation is what makes the half case round up, and
 * the whole computation stays in integer arithmetic, so no monetary value ever passes through a
 * binary floating-point representation.
 */
export function roundHalfUp(numerator: number | bigint, denominator: number): number {
  if (!Number.isSafeInteger(denominator) || denominator <= 0)
    throw new Error('The rounding divisor must be positive');
  if (typeof numerator === 'number' && (!Number.isSafeInteger(numerator) || numerator < 0))
    throw new Error('The rounding numerator must be a non-negative integer');
  const value = BigInt(numerator);
  if (value < 0n) throw new Error('The rounding numerator must be non-negative');
  const result = (value + BigInt(Math.floor(denominator / 2))) / BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('The monetary result exceeds safe representation');
  return Number(result);
}
