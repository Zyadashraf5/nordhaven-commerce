import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Notifications capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension.
 */
export const NOTIFICATION_RATE_LIMITS = {
  write: { id: 'notifications.retry', limit: 30, windowSeconds: 300, key: 'client' },
  read: { id: 'notifications.read', limit: 300, windowSeconds: 300, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
