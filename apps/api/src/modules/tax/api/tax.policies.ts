import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Tax capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. Configuration writes are bounded more tightly than reads
 * because each one touches the database. State is process-local and resets on restart, as recorded
 * for Milestone 02.
 */
export const TAX_RATE_LIMITS = {
  read: { id: 'tax.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'tax.write', limit: 60, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
