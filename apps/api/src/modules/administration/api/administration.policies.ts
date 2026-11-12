import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Administration capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. The administrative surface reads several capabilities at
 * once, so it is bounded more tightly than a single-capability read.
 */
export const ADMINISTRATION_RATE_LIMITS = {
  read: { id: 'administration.read', limit: 120, windowSeconds: 300, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
