import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Shipping and Fulfillment capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. A return writes several rows and, when the goods arrive,
 * moves stock and money, so it is bounded more tightly than a read. State is process-local and
 * resets on restart, as recorded for Milestone 02.
 */
export const SHIPPING_RATE_LIMITS = {
  read: { id: 'shipping.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'shipping.write', limit: 30, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
