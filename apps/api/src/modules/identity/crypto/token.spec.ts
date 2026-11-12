import {
  generateRecoveryCode,
  generateToken,
  hashToken,
  hexDigestsEqual,
  normalizeRecoveryCode,
} from './token';

describe('session and challenge tokens', () => {
  it('generates 256 bits of URL-safe entropy', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('does not repeat across many draws', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
  });

  it('hashes deterministically to a 64-character digest and separates distinct inputs', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('administrator recovery codes', () => {
  it('uses three groups of four unambiguous symbols', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[IO01]/);
  });

  it('does not repeat across many draws', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(200);
  });

  it('normalizes the human-entered form before hashing', () => {
    expect(normalizeRecoveryCode('abcd-efgh ijkl')).toBe('ABCDEFGHIJKL');
    expect(normalizeRecoveryCode(' AB2C-D3EF ')).toBe('AB2CD3EF');
  });
});

describe('hexDigestsEqual', () => {
  it('compares digests of equal and unequal value', () => {
    const digest = hashToken(generateToken());
    expect(hexDigestsEqual(digest, digest)).toBe(true);
    expect(hexDigestsEqual(digest, hashToken(generateToken()))).toBe(false);
  });

  it('never reports equality for different lengths', () => {
    expect(hexDigestsEqual('ab', 'abcd')).toBe(false);
    expect(hexDigestsEqual('', 'a')).toBe(false);
  });
});
