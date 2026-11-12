import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Product Catalog capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the caller
 * is the only usable dimension. Anonymous browsing shares the read policy with administrative reads
 * because both are read-only; administrative writes are bounded more tightly because each one touches
 * the database. State is process-local and resets on restart, as recorded for Milestone 02.
 */
export const CATALOG_RATE_LIMITS = {
  read: { id: 'catalog.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'catalog.write', limit: 60, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
