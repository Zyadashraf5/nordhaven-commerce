import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies for the Payments capability.
 *
 * The limiter runs before session authentication, so the principal is not yet resolved and the
 * caller is the only usable dimension. The webhook intake is bounded more tightly than the
 * customer routes, because it is the surface an attacker would use, and a provider is not a
 * customer, so the caller dimension is the only one available. State is process-local and resets on
 * restart, as recorded for Milestone 02.
 */
export const PAYMENT_RATE_LIMITS = {
  read: { id: 'payments.read', limit: 300, windowSeconds: 300, key: 'client' },
  write: { id: 'payments.write', limit: 30, windowSeconds: 900, key: 'client' },
  webhook: { id: 'payments.webhook', limit: 120, windowSeconds: 300, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
