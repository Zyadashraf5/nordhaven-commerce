import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SETTLEMENT_CURRENCY } from '../../../platform/config/environment';

/**
 * The Checkout capability's value rules.
 *
 * The settlement currency is EGP, as the approved decision states. It is a constant rather than a
 * configuration key because the approved decision fixes it, and the display-currency work that
 * would need it configurable is not approved. The constant lives in the platform's configuration
 * module, because the Shipping capability names the same currency, and it is re-exported here for
 * the Checkout capability's existing importers.
 */
export { SETTLEMENT_CURRENCY };

/** The maximum quantity one cart line may hold, which the Cart enforces on write. */
export const MAX_CHECKOUT_LINE_QUANTITY = 999;

/** The number of hex characters in a quote fingerprint. */
export const FINGERPRINT_LENGTH = 64;

/** A destination country code: exactly two letters. */
export function destinationCountryCode() {
  return z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase());
}

/**
 * The fingerprint of a quote.
 *
 * The digest covers the quote's material content: the destination, the currency, and every line's
 * identity, quantity, price, and tax, plus the totals. A change to any of them changes the
 * fingerprint, and an unrelated change does not, so a later step can tell exactly whether the
 * figures it holds are still the figures the customer saw.
 *
 * The digest is over a canonical, explicitly ordered serialization rather than over an object's
 * incidental key order, so the fingerprint is stable across runs and processes.
 */
export function quoteFingerprint(material: {
  readonly destinationCountryCode: string;
  readonly currency: string;
  readonly lines: readonly {
    readonly lineId: string;
    readonly variantId: string | null;
    readonly bundleId: string | null;
    readonly quantity: number;
    readonly unitPriceMinor: number;
    readonly netMinor: number;
    readonly taxMinor: number;
    readonly totalMinor: number;
  }[];
  readonly netSubtotalMinor: number;
  readonly taxTotalMinor: number;
  readonly totalMinor: number;
}): string {
  const canonical = [
    material.destinationCountryCode,
    material.currency,
    ...material.lines.map((line) =>
      [
        line.lineId,
        line.variantId ?? '',
        line.bundleId ?? '',
        String(line.quantity),
        String(line.unitPriceMinor),
        String(line.netMinor),
        String(line.taxMinor),
        String(line.totalMinor),
      ].join(':'),
    ),
    String(material.netSubtotalMinor),
    String(material.taxTotalMinor),
    String(material.totalMinor),
  ].join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
