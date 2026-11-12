/**
 * Client-side validation for the account screens (Stage 3 auth & account
 * boards). These validators mirror the exact field rules and error strings of
 * the approved boards — they never talk to a backend, they only guard inputs.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Email required/format check; null means valid. */
export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return 'Enter your email address';
  if (!EMAIL_RE.test(trimmed)) {
    return 'Enter a full email address, like name@example.com';
  }
  return null;
}

/** Egyptian mobile: 10 digits starting with 1 after the +20 country code. */
export function normalizeEgyptMobile(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function isValidEgyptMobile(value: string): boolean {
  return /^1[0-9]{9}$/.test(normalizeEgyptMobile(value));
}

export const MOBILE_ERROR = 'Enter a 10-digit mobile number after +20, like 100 000 0000';

/** Mobile format check. `optional` keeps blank inputs valid. */
export function validateEgyptMobile(value: string, optional = false): string | null {
  if (value.trim() === '' && optional) return null;
  if (value.trim() === '') return MOBILE_ERROR;
  if (!isValidEgyptMobile(value)) return MOBILE_ERROR;
  return null;
}

export const POSTAL_ERROR = 'Postal codes in Egypt have 5 digits';

/** Postal codes in Egypt have 5 digits; the field itself is optional. */
export function validatePostalCode(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^[0-9]{5}$/.test(trimmed)) return POSTAL_ERROR;
  return null;
}

/* ------------------------------------------------------------------ *
 * Password rules
 * ------------------------------------------------------------------ */

/** The backend's minimum (identity PASSWORD_MIN_LENGTH; the API rejects shorter). */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRule {
  label: string;
  /** True once the typed password satisfies the rule. */
  ok: boolean;
}

const localPart = (email: string): string => email.trim().toLowerCase().split('@')[0] ?? '';

/**
 * The registration / reset-password rules board list. Mirrors the board
 * evaluation exactly — including that the last rule only lights up once a
 * password has been typed.
 */
export function authPasswordRules(password: string, email: string): PasswordRule[] {
  const local = localPart(email);
  const avoidsEmail =
    password.length > 0 && !(local.length >= 3 && password.toLowerCase().includes(local));
  return [
    { label: 'At least 12 characters', ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'At least one letter', ok: /[A-Za-z]/.test(password) },
    { label: 'At least one number', ok: /[0-9]/.test(password) },
    { label: 'Doesn’t include your email', ok: avoidsEmail },
  ];
}

/**
 * The security-page rules board list — here the letter/number rule is combined
 * and the new password must differ from the current one.
 */
export function securityPasswordRules(password: string, currentPassword: string): PasswordRule[] {
  return [
    { label: 'At least 12 characters', ok: password.length >= PASSWORD_MIN_LENGTH },
    {
      label: 'At least one letter and one number',
      ok: /[A-Za-z]/.test(password) && /[0-9]/.test(password),
    },
    {
      label: 'Different from your current password',
      ok: password.length > 0 && password !== currentPassword,
    },
  ];
}

/** True when every rule is met. */
export function allRulesMet(rules: PasswordRule[]): boolean {
  return rules.every((rule) => rule.ok);
}

/** "3 of 4 requirements met" — the board's screen-reader summary. */
export function rulesMetSummary(rules: PasswordRule[]): string {
  const met = rules.filter((rule) => rule.ok).length;
  return `${met} of ${rules.length} requirements met`;
}
