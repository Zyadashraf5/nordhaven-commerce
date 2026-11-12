import { z } from 'zod';

/**
 * The Cart capability's value rules.
 *
 * A cart is an intent record, not a commitment: it never reserves stock and never blocks a
 * purchase that is currently unavailable. The rules here therefore bound only what the customer
 * asked for - a positive whole quantity and an exact price in minor units.
 */

/** The largest quantity one cart line may hold. */
export const MAX_CART_LINE_QUANTITY = 999;

/** The largest number of lines one cart may hold. */
export const MAX_CART_LINES = 200;

/**
 * A cart line quantity: a positive whole number within the per-line maximum.
 *
 * A quantity beyond the maximum is refused rather than clamped, so a caller is never silently
 * given less than they asked for.
 */
export function cartQuantity() {
  return z.number().int().min(1).max(MAX_CART_LINE_QUANTITY);
}

/** The identifier of a cart line or a wishlist item. */
export function itemId() {
  return z.uuid();
}
