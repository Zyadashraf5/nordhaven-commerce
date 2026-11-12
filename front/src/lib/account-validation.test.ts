import { describe, expect, it } from 'vitest';
import {
  validateEmail,
  validateEgyptMobile,
  validatePostalCode,
  authPasswordRules,
  securityPasswordRules,
  allRulesMet,
  rulesMetSummary,
  isValidEgyptMobile,
} from './account-validation';

describe('validateEmail', () => {
  it('rejects an empty value', () => {
    expect(validateEmail('')).toBe('Enter your email address');
    expect(validateEmail('   ')).toBe('Enter your email address');
  });

  it('rejects partial addresses with the full-address copy', () => {
    expect(validateEmail('mariam@example')).toBe(
      'Enter a full email address, like name@example.com',
    );
    expect(validateEmail('mariam.example.com')).toBe(
      'Enter a full email address, like name@example.com',
    );
  });

  it('accepts full addresses, trimmed', () => {
    expect(validateEmail('  mariam.adel@example.com  ')).toBeNull();
  });
});

describe('Egyptian mobile numbers', () => {
  it('accepts 10 digits starting with 1, ignoring spaces and dashes', () => {
    expect(isValidEgyptMobile('100 000 0000')).toBe(true);
    expect(isValidEgyptMobile('100-000-0000')).toBe(true);
    expect(isValidEgyptMobile('1012345678')).toBe(true);
  });

  it('rejects numbers that do not start with 1 or have the wrong length', () => {
    expect(isValidEgyptMobile('200 000 0000')).toBe(false);
    expect(isValidEgyptMobile('100 000 000')).toBe(false);
    expect(isValidEgyptMobile('0100 000 0000')).toBe(false);
  });

  it('validates the full form field: required unless optional', () => {
    expect(validateEgyptMobile('')).toBe(
      'Enter a 10-digit mobile number after +20, like 100 000 0000',
    );
    expect(validateEgyptMobile('', true)).toBeNull();
    expect(validateEgyptMobile('123', true)).toBe(
      'Enter a 10-digit mobile number after +20, like 100 000 0000',
    );
  });
});

describe('postal codes', () => {
  it('keeps the optional field valid when blank', () => {
    expect(validatePostalCode('')).toBeNull();
  });

  it('requires exactly five digits', () => {
    expect(validatePostalCode('11211')).toBeNull();
    expect(validatePostalCode('1121')).toBe('Postal codes in Egypt have 5 digits');
    expect(validatePostalCode('1121a')).toBe('Postal codes in Egypt have 5 digits');
  });
});

describe('authPasswordRules (register / reset board)', () => {
  const RULES = 4;
  it('marks nothing met for an empty password', () => {
    const rules = authPasswordRules('', 'mariam.adel@example.com');
    expect(rules).toHaveLength(RULES);
    expect(allRulesMet(rules)).toBe(false);
  });

  it('tracks progress as the password grows', () => {
    const weak = authPasswordRules('abc', 'mariam.adel@example.com');
    expect(weak.map((r) => r.label)).toEqual([
      'At least 12 characters',
      'At least one letter',
      'At least one number',
      'Doesn’t include your email',
    ]);
    expect(rulesMetSummary(weak)).toBe('2 of 4 requirements met');
  });

  it('rejects a password that contains the email local part', () => {
    const clean = authPasswordRules('secret linen 9', 'mariam.adel@example.com');
    expect(clean.every((r) => r.ok)).toBe(true);
    const withLocal = authPasswordRules('mariam.adel1', 'mariam.adel@example.com');
    expect(withLocal.find((r) => r.label === 'Doesn’t include your email')?.ok).toBe(false);
  });

  it('accepts a strong password', () => {
    expect(authPasswordRules('linen-oat-24', 'mariam.adel@example.com').every((r) => r.ok)).toBe(
      true,
    );
  });
});

describe('securityPasswordRules (security board)', () => {
  it('requires length, a letter and a number, and difference from current', () => {
    const rules = securityPasswordRules('12345678', '12345678');
    expect(rules.find((r) => r.label === 'At least one letter and one number')?.ok).toBe(false);
    expect(rules.find((r) => r.label === 'Different from your current password')?.ok).toBe(false);

    const ok = securityPasswordRules('linen-oat-25', 'linen-oat-24');
    expect(allRulesMet(ok)).toBe(true);
  });
});
