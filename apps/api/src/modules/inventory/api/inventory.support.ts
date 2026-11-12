import { z } from 'zod';

/**
 * The inventory value rules, shared by the request-boundary schemas, the OpenAPI decorators, and the
 * application layer, so a bound or a normalization rule is defined once.
 *
 * Quantities are exact non-negative integers (constitution principle VIII applies to counts as well as
 * money), and a bundle's availability is derived arithmetic, never a stored number.
 */

export const REASON_MAX_LENGTH = 300;
export const BUNDLE_NAME_MAX_LENGTH = 200;
export const BUNDLE_DESCRIPTION_MAX_LENGTH = 2000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
export const MAX_COMPONENTS_PER_BUNDLE = 50;
export const MAX_RESERVATION_LINES = 50;
export const MAX_QUANTITY = 1_000_000;
export const MAX_BUNDLE_QUANTITY = 10_000;
export const DEFAULT_RESERVATION_TTL_SECONDS = 900;
export const MIN_RESERVATION_TTL_SECONDS = 60;
export const MAX_RESERVATION_TTL_SECONDS = 86_400;
export const MAX_RESERVATION_EXTENSION_SECONDS = 86_400;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

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

/** A non-negative integer quantity, bounded so a multiplication cannot overflow. */
export function quantity(options: { readonly maximum?: number; readonly minimum?: number } = {}) {
  return z
    .number()
    .int()
    .min(options.minimum ?? 0)
    .max(options.maximum ?? MAX_QUANTITY);
}

/** A positive integer count of bundles. */
export function bundleQuantity() {
  return quantity({ minimum: 1, maximum: MAX_BUNDLE_QUANTITY });
}

/** A non-negative display position. */
export function position() {
  return z.number().int().min(0).max(1_000_000);
}

/**
 * A bundle composition line.
 *
 * A `FIXED` bundle carries a per-bundle `quantity`; a `DYNAMIC` bundle carries an allowed range
 * (`minQuantity`/`maxQuantity`). The two shapes are mutually exclusive and the rule is enforced by the
 * schemas below and restated in the service, so a caller cannot smuggle a fixed quantity into a dynamic
 * bundle or vice versa.
 */
export interface CompositionComponent {
  readonly variantId: string;
  readonly quantity: number | null;
  readonly minQuantity: number | null;
  readonly maxQuantity: number | null;
  readonly position: number;
}

/**
 * How many whole bundles a component can support, given how many units of that component are available.
 * A component with a missing or non-positive per-bundle quantity supports none.
 */
export function componentAffordable(available: number, perBundleQuantity: number): number {
  if (perBundleQuantity <= 0) return 0;
  return Math.floor(available / perBundleQuantity);
}

/**
 * Bundle availability: the smallest affordable count over every component, so a bundle never implies
 * stock its components cannot fulfil (constitution principle V). An empty composition supports nothing.
 */
export function bundleAvailability(
  components: readonly { readonly available: number; readonly perBundleQuantity: number }[],
): number {
  if (components.length === 0) return 0;
  let available = Number.POSITIVE_INFINITY;
  for (const component of components) {
    available = Math.min(
      available,
      componentAffordable(component.available, component.perBundleQuantity),
    );
  }
  return Number.isFinite(available) ? Math.max(0, available) : 0;
}

/**
 * Resolves a bundle reservation to the SKU holds it implies. A bundle of `quantity` bundles holds
 * `quantity * perBundleQuantity` of each component, so the same units are never counted twice
 * (HC-INV-004): a bundle keeps no stock of its own.
 */
export function resolveBundleLines(
  components: readonly { readonly variantId: string; readonly perBundleQuantity: number }[],
  quantity: number,
): { readonly variantId: string; readonly quantity: number }[] {
  return components.map((component) => ({
    variantId: component.variantId,
    quantity: component.perBundleQuantity * quantity,
  }));
}

/** A keyset position of a SKU-ordered inventory listing. */
export interface InventoryCursorPosition {
  readonly sku: string;
  readonly id: string;
}

/** Encodes a keyset position opaquely. */
export function encodeInventoryCursor(position: InventoryCursorPosition): string {
  return Buffer.from(`${position.sku}\u0000${position.id}`, 'utf8').toString('base64url');
}

/** Decodes a keyset position; an unreadable cursor returns null for boundary validation. */
export function decodeInventoryCursor(value: string): InventoryCursorPosition | null {
  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf('\u0000');
  if (separator < 0) return null;
  const sku = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
      id,
    )
  )
    return null;
  return { sku, id };
}

/** A keyset position of a time-ordered listing (movements, reservations). */
export interface TimeCursorPosition {
  readonly timestamp: string;
  readonly id: string;
}

/** Encodes a time-ordered keyset position opaquely. */
export function encodeTimeCursor(position: TimeCursorPosition): string {
  return Buffer.from(`${position.timestamp}\u0000${position.id}`, 'utf8').toString('base64url');
}

/** Decodes a time-ordered keyset position; an unreadable cursor returns null for boundary validation. */
export function decodeTimeCursor(value: string): TimeCursorPosition | null {
  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf('\u0000');
  if (separator <= 0) return null;
  const timestamp = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
      id,
    )
  )
    return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return { timestamp, id };
}
