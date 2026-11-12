import { BadRequestException } from '@nestjs/common';
import type { PrincipalRole } from '../../../platform/security/principal';
import { evaluatePasswordPolicy } from '../crypto/password-hasher';
import type { UserAccountSummary } from '../persistence/user.repository';

/** Single normalization point for the only sign-in identifier. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toAccountSummary(user: {
  readonly id: string;
  readonly email: string;
  readonly role: PrincipalRole;
  readonly createdAt: Date;
}): UserAccountSummary {
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

/**
 * Reported exactly like a boundary validation failure so the error contract stays uniform and the
 * response never repeats a rejected value.
 */
export function passwordPolicyError(): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    details: [{ path: 'password', message: 'Invalid value' }],
  });
}

export function assertPasswordPolicy(password: string, email: string): void {
  if (!evaluatePasswordPolicy(password, email).valid) throw passwordPolicyError();
}

/**
 * Derives a short, non-sensitive client label from `User-Agent`.
 *
 * The address is deliberately not stored: a coarse label is enough for a customer to recognize a
 * device, and it keeps stored personal data minimal.
 */
export function clientLabelFromUserAgent(userAgent: string | undefined): string | null {
  if (userAgent === undefined) return null;
  const cleaned = userAgent.replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, 80);
}

export function addSeconds(from: Date, seconds: number): Date {
  return new Date(from.getTime() + seconds * 1000);
}
