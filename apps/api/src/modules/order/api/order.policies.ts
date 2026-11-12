import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Orders capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. Placing an order writes several rows and holds stock, so
 * it is bounded more tightly than a read. State is process-local and resets on restart, as recorded
 * for Milestone 02.
 */
export const ORDER_RATE_LIMITS = {
  read: { id: 'orders.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'orders.write', limit: 30, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
