import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Checkout capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. Quoting reads the cart, the inventory, and the tax
 * configuration, so it is bounded more tightly than a plain read. State is process-local and resets
 * on restart, as recorded for Milestone 02.
 */
export const CHECKOUT_RATE_LIMITS = {
  read: { id: 'checkout.read', limit: 300, windowSeconds: 300, key: 'client' },
  quote: { id: 'checkout.quote', limit: 120, windowSeconds: 300, key: 'client' },
  write: { id: 'checkout.write', limit: 60, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
