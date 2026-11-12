import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Cart capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. Writes are bounded more tightly than reads because each one
 * touches the database. State is process-local and resets on restart, as recorded for Milestone 02.
 */
export const CART_RATE_LIMITS = {
  read: { id: 'cart.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'cart.write', limit: 60, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
