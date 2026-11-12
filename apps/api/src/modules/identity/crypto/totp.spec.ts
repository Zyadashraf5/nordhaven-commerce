import {
  decodeBase32,
  encodeBase32,
  generateSharedSecret,
  generateTotpCode,
  timeStepFor,
  verifyTotpCode,
} from './totp';

/**
 * RFC 6238 Appendix B reference vectors for the SHA-1 profile. The shared secret is the ASCII value
 * `12345678901234567890`, and the expected values are the eight-digit codes the RFC publishes.
 */
const RFC_SECRET = encodeBase32(Buffer.from('12345678901234567890', 'utf8'));

const RFC_VECTORS: readonly [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('base32', () => {
  it('matches the RFC 4648 encoding of the RFC 6238 secret', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('round-trips arbitrary bytes and ignores padding', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
    expect(decodeBase32(`${RFC_SECRET}====`)).toEqual(decodeBase32(RFC_SECRET));
  });

  it('rejects a symbol outside the base32 alphabet', () => {
    expect(() => decodeBase32('0189')).toThrow('Invalid base32 input');
  });
});

describe('generateTotpCode', () => {
  it.each(RFC_VECTORS)('reproduces the RFC 6238 vector at T=%i seconds', (seconds, expected) => {
    expect(generateTotpCode(RFC_SECRET, timeStepFor(seconds * 1000), 8)).toBe(expected);
  });

  it('generates a 160-bit shared secret that is 32 base32 characters', () => {
    const secret = generateSharedSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(decodeBase32(secret)).toHaveLength(20);
    expect(generateSharedSecret()).not.toBe(secret);
  });
});

describe('verifyTotpCode', () => {
  const secret = generateSharedSecret();
  const currentStep = 1000;
  const nowMs = currentStep * 30 * 1000;

  it('accepts the current step inside the acceptance window', () => {
    const code = generateTotpCode(secret, currentStep);
    expect(verifyTotpCode(secret, code, nowMs)).toEqual({ valid: true, timeStep: currentStep });
  });

  it('accepts the adjacent steps of the window and rejects the step beyond it', () => {
    expect(verifyTotpCode(secret, generateTotpCode(secret, currentStep - 1), nowMs).valid).toBe(
      true,
    );
    expect(verifyTotpCode(secret, generateTotpCode(secret, currentStep + 1), nowMs).valid).toBe(
      true,
    );
    expect(verifyTotpCode(secret, generateTotpCode(secret, currentStep - 2), nowMs).valid).toBe(
      false,
    );
    expect(verifyTotpCode(secret, generateTotpCode(secret, currentStep + 2), nowMs).valid).toBe(
      false,
    );
  });

  it('rejects a captured code that has already been accepted', () => {
    const code = generateTotpCode(secret, currentStep);
    expect(verifyTotpCode(secret, code, nowMs, { lastAcceptedStep: currentStep }).valid).toBe(
      false,
    );
    expect(
      verifyTotpCode(secret, generateTotpCode(secret, currentStep + 1), nowMs, {
        lastAcceptedStep: currentStep,
      }).valid,
    ).toBe(true);
  });

  it('rejects anything that is not the declared number of digits', () => {
    expect(verifyTotpCode(secret, '12345', nowMs).valid).toBe(false);
    expect(verifyTotpCode(secret, '1234567', nowMs).valid).toBe(false);
    expect(verifyTotpCode(secret, 'abcdef', nowMs).valid).toBe(false);
  });

  it('rejects a code produced for a different secret', () => {
    expect(
      verifyTotpCode(generateSharedSecret(), generateTotpCode(secret, currentStep), nowMs).valid,
    ).toBe(false);
  });
});
