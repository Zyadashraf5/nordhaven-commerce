import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Reviews capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. Writing a review is bounded more tightly than a read,
 * because a review is a statement the platform publishes and a flood of them is the abuse the
 * moderation exists to catch.
 */
export const REVIEW_RATE_LIMITS = {
  read: { id: 'reviews.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'reviews.write', limit: 20, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
