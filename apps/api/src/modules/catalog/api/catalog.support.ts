import { z } from 'zod';
import type { CategoryRecord } from '../persistence/category.repository';

/**
 * The catalog value rules, shared by the request-boundary schemas, the OpenAPI decorators, and the
 * application layer, so a bound or a normalization rule is defined once.
 *
 * Prices are exact integer minor units with an explicit currency (constitution principle VIII). Slugs
 * and SKUs are normalized deterministically so a duplicate is a duplicate regardless of the casing or
 * spacing an administrator typed.
 */

export const CATEGORY_NAME_MAX_LENGTH = 160;
export const BRAND_NAME_MAX_LENGTH = 160;
export const PRODUCT_NAME_MAX_LENGTH = 200;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;
export const SLUG_MAX_LENGTH = 200;
export const SKU_MAX_LENGTH = 64;
export const VARIANT_DIMENSION_MAX_LENGTH = 80;
export const IMAGE_URL_MAX_LENGTH = 2048;
export const IMAGE_ALT_TEXT_MAX_LENGTH = 300;
export const ATTRIBUTE_NAME_MAX_LENGTH = 80;
export const ATTRIBUTE_VALUE_MAX_LENGTH = 300;
export const CURRENCY_CODE_LENGTH = 3;
export const MAX_IMAGES_PER_PRODUCT = 20;
export const MAX_ATTRIBUTES_PER_PRODUCT = 50;
/** The largest price the storage type can hold, asserted at the boundary. */
export const MAX_PRICE_MINOR = 2_000_000_000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
/** The largest discount the storage type can hold: one hundred percent. */
export { MAX_DISCOUNT_BASIS_POINTS } from '../pricing';
/** The longest free-text search term the boundary accepts. */
export const MAX_SEARCH_TERM_LENGTH = 200;

const SLUG_BODY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_BODY = /^[A-Z0-9][A-Z0-9._-]*$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

/**
 * Rejects the C0/C1 control range and DEL. Checked numerically rather than with a regular expression so
 * the guard stays readable and does not trip an analyzer rule about control characters in literals.
 */
export function isFreeOfControlCharacters(value: string): boolean {
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

/** An optional attribute: a value that carries no text is stored as "not provided". */
export function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .refine(isFreeOfControlCharacters)
    .transform((value) => (value.length === 0 ? null : value));
}

/** A non-negative integer count of minor units, bounded by the storage type. */
export function minorUnits() {
  return z.number().int().min(0).max(MAX_PRICE_MINOR);
}

/** A non-negative display position. */
export function position() {
  return z.number().int().min(0).max(1_000_000);
}

/** Three ASCII letters, normalized to upper case. */
export function currencyCode() {
  return z
    .string()
    .trim()
    .regex(CURRENCY_PATTERN)
    .transform((value) => value.toUpperCase());
}

/** Derives a normalized slug body from free text. Returns null when nothing usable remains. */
export function slugify(value: string): string | null {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized.length === 0 || normalized.length > SLUG_MAX_LENGTH) return null;
  return normalized;
}

/** A slug that may be supplied explicitly; it is normalized and validated. */
export function slugValue() {
  return z
    .string()
    .trim()
    .transform((value) => slugify(value) ?? value.toLowerCase())
    .refine((value) => SLUG_BODY.test(value) && value.length <= SLUG_MAX_LENGTH);
}

/** A SKU: trimmed, normalized to upper case, and restricted to an integration-safe alphabet. */
export function skuValue() {
  return z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value.length <= SKU_MAX_LENGTH && SKU_BODY.test(value));
}

/** An absolute http or https URL. No storage subsystem is approved (assumption M04-ASM-004). */
export function imageUrl() {
  return z
    .string()
    .trim()
    .max(IMAGE_URL_MAX_LENGTH)
    .refine(isFreeOfControlCharacters)
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });
}

export interface ProductCursorPosition {
  readonly name: string;
  readonly id: string;
}

/**
 * A free-text search term, trimmed and collapsed.
 *
 * Returns null when nothing usable remains, so a term of only punctuation or whitespace is
 * refused at the boundary instead of silently matching everything.
 */
export function normalizeSearchTerm(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) return null;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return null;
  return normalized;
}

/**
 * An attribute filter pair, matched case-insensitively on both sides.
 *
 * The name and the value are separated by the first colon, so a value may itself contain colons.
 */
export function parseAttributeFilter(value: string): { name: string; value: string } | null {
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const name = value.slice(0, separator).trim();
  const attributeValue = value.slice(separator + 1).trim();
  if (name.length === 0 || attributeValue.length === 0) return null;
  return { name, value: attributeValue };
}

/** Encodes a keyset position opaquely. The separator cannot occur in a validated catalog name. */
export function encodeProductCursor(position: ProductCursorPosition): string {
  return Buffer.from(`${position.name}\u0000${position.id}`, 'utf8').toString('base64url');
}

/** Decodes a keyset position; an unreadable cursor is treated as absent by the caller. */
export function decodeProductCursor(value: string): ProductCursorPosition | null {
  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf('\u0000');
  if (separator <= 0) return null;
  const name = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  return { name, id };
}

/** One category node with its direct children, for the two-level public tree. */
export interface CategoryTreeNode extends CategoryRecord {
  readonly children: CategoryRecord[];
}

/**
 * Assembles the two-level tree. Any node whose parent is absent from the set is surfaced as a root so
 * the response never silently drops a category.
 */
export function buildCategoryTree(records: readonly CategoryRecord[]): CategoryTreeNode[] {
  const roots = records.filter((record) => record.parentId === null);
  const orphans = records.filter(
    (record) =>
      record.parentId !== null && !records.some((candidate) => candidate.id === record.parentId),
  );
  return [...roots, ...orphans].map((root) => ({
    ...root,
    children: records.filter((record) => record.parentId === root.id),
  }));
}
