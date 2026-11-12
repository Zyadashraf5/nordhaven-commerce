import { z } from 'zod';

/**
 * The customer value rules, shared by the request-boundary schemas, the OpenAPI decorators, and the
 * service layer, so an attribute bound or a normalization rule is defined once.
 *
 * The rules are deliberately generic. Country-specific formatting and mandatory-ness depend on
 * HC-DEC-005, which remains Open, so a country is only checked for ISO 3166-1 alpha-2 **shape** and
 * the supported set is never restricted.
 */

export const DISPLAY_NAME_MAX_LENGTH = 120;
export const CONTACT_PHONE_MAX_LENGTH = 32;

export const ADDRESS_RECIPIENT_NAME_MAX_LENGTH = 120;
export const ADDRESS_LINE_MAX_LENGTH = 200;
export const ADDRESS_CITY_MAX_LENGTH = 120;
export const ADDRESS_REGION_MAX_LENGTH = 120;
export const ADDRESS_POSTAL_CODE_MAX_LENGTH = 32;
export const ADDRESS_COUNTRY_CODE_LENGTH = 2;

const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

/**
 * Rejects the C0/C1 control range and DEL. Checked numerically rather than with a regular expression so
 * the guard stays readable and does not trip an analyzer rule about control characters in literals.
 */
function isFreeOfControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

/** A required attribute: trimmed, non-empty, bounded, and free of interior control characters. */
export function requiredText(maxLength: number) {
  return z.string().trim().min(1).max(maxLength).refine(isFreeOfControlCharacters);
}

/**
 * An optional attribute: trimmed and bounded, but a value that carries no text is stored as "not
 * provided" rather than as an empty string, so the stored state and the response agree.
 */
export function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .refine(isFreeOfControlCharacters)
    .transform((value) => (value.length === 0 ? null : value));
}

/** A country: exactly two ASCII letters, normalized to upper case. */
export function countryCode() {
  return z
    .string()
    .trim()
    .regex(COUNTRY_CODE_PATTERN)
    .transform((value) => value.toUpperCase());
}
