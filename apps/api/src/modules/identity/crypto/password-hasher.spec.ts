import {
  evaluatePasswordPolicy,
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from './password-hasher';

const PASSWORD = 'Correct-Horse-Battery-9';
const EMAIL = 'owner@nordhaven.test';

describe('evaluatePasswordPolicy', () => {
  it('accepts a password inside the declared bounds', () => {
    expect(evaluatePasswordPolicy(PASSWORD, EMAIL)).toEqual({ valid: true, violations: [] });
  });

  it('reports the length violations', () => {
    expect(evaluatePasswordPolicy('short', EMAIL).violations).toEqual(['TOO_SHORT']);
    expect(evaluatePasswordPolicy('x'.repeat(300), EMAIL).violations).toEqual(['TOO_LONG']);
  });

  it('rejects a password that repeats the account address, ignoring case and padding', () => {
    expect(evaluatePasswordPolicy(EMAIL, EMAIL).violations).toEqual(['MATCHES_EMAIL']);
    expect(evaluatePasswordPolicy(`  ${EMAIL.toUpperCase()}  `, EMAIL).violations).toEqual([
      'MATCHES_EMAIL',
    ]);
  });
});

describe('password hashing', () => {
  let stored: string;

  beforeAll(async () => {
    stored = await hashPassword(PASSWORD);
  });

  it('stores a versioned, self-describing hash that never contains the password', () => {
    const parts = stored.split('$');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toBe('v=1');
    expect(parts[2]).toBe('N=32768,r=8,p=1');
    expect(stored).not.toContain(PASSWORD);
  });

  it('verifies the original password and rejects a near miss', async () => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
    await expect(verifyPassword(`${PASSWORD}!`, stored)).resolves.toBe(false);
  });

  it('uses a fresh salt so two hashes of one password differ', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).not.toBe(second);
    await expect(verifyPassword(PASSWORD, first)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, second)).resolves.toBe(true);
  });

  it('fails closed for a stored value it did not produce', async () => {
    const malformed = [
      '',
      'plaintext',
      'scrypt$v=2$N=32768,r=8,p=1$AA==$AA==',
      'bcrypt$v=1$N=32768,r=8,p=1$AA==$AA==',
      'scrypt$v=1$N=32768,r=8,p=1$AA==',
    ];

    for (const value of malformed) {
      await expect(verifyPassword(PASSWORD, value)).resolves.toBe(false);
    }
  });

  it('performs a discarding, equal-cost derivation for an unknown account', async () => {
    await expect(verifyDummyPassword(PASSWORD)).resolves.toBeUndefined();
  });
});
