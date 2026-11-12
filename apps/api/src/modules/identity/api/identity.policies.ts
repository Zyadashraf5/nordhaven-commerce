import type { RateLimitPolicy } from '../../../platform/security/rate-limiter';

/**
 * Declared fixed-window policies.
 *
 * Each policy is bound by client, and by the submitted account identifier where one exists, so one
 * caller cannot exhaust another account's budget and a rotating client cannot hide behind a single
 * account. Durable, restart-surviving protection for sign-in is the account lockout stored on the
 * user record.
 */
export const RATE_LIMITS = {
  register: { id: 'auth.register', limit: 5, windowSeconds: 900, key: 'client-and-account' },
  signIn: { id: 'auth.sign-in', limit: 10, windowSeconds: 300, key: 'client-and-account' },
  mfaChallenge: { id: 'auth.mfa', limit: 10, windowSeconds: 300, key: 'client' },
  mfaEnrollment: { id: 'auth.mfa.enrollment', limit: 10, windowSeconds: 900, key: 'client' },
  mfaEnrollmentConfirmation: {
    id: 'auth.mfa.enrollment.confirmation',
    limit: 10,
    windowSeconds: 900,
    key: 'client',
  },
  passwordChange: { id: 'auth.password.change', limit: 10, windowSeconds: 900, key: 'client' },
  resetRequest: {
    id: 'auth.password-reset.request',
    limit: 5,
    windowSeconds: 900,
    key: 'client-and-account',
  },
  resetConfirmation: {
    id: 'auth.password-reset.confirmation',
    limit: 10,
    windowSeconds: 900,
    key: 'client',
  },
  accountList: { id: 'admin.accounts.list', limit: 60, windowSeconds: 60, key: 'client' },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;
