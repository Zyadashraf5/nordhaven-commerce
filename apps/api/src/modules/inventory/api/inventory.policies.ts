import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Inventory and Bundles capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the caller
 * is the only usable dimension — exactly as recorded for Milestones 02 and 04. Every route in this
 * capability is administrative, so both policies are keyed by the client. State is process-local and
 * resets on restart.
 */
export const INVENTORY_RATE_LIMITS = {
  read: { id: 'inventory.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'inventory.write', limit: 120, windowSeconds: 900, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
