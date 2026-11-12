import { SecretCipher } from './secret-cipher';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/** Flips one bit of the ciphertext segment while keeping the payload shape intact. */
function tamperCiphertext(payload: string): string {
  const parts = payload.split(':');
  const index = parts.length - 1;
  const bytes = Buffer.from(parts[index] ?? '', 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  parts[index] = bytes.toString('base64');
  return parts.join(':');
}

describe('SecretCipher', () => {
  const cipher = new SecretCipher(KEY);

  it('refuses key material that is not exactly 32 bytes', () => {
    expect(() => new SecretCipher('c2hvcnQ=')).toThrow('32 bytes');
    expect(() => new SecretCipher(Buffer.alloc(16, 1).toString('base64'))).toThrow('32 bytes');
  });

  it('round-trips a shared secret without exposing the plaintext', () => {
    const payload = cipher.encrypt(SECRET);
    expect(payload).not.toContain(SECRET);
    expect(cipher.decrypt(payload)).toBe(SECRET);
  });

  it('emits a versioned, four-part payload with a fresh initialisation vector', () => {
    const first = cipher.encrypt(SECRET);
    const second = cipher.encrypt(SECRET);

    expect(first.split(':')).toHaveLength(4);
    expect(first.startsWith('v1:')).toBe(true);
    expect(first).not.toBe(second);
    expect(cipher.decrypt(second)).toBe(SECRET);
  });

  it('fails closed on a tampered payload', () => {
    expect(() => cipher.decrypt(tamperCiphertext(cipher.encrypt(SECRET)))).toThrow();
  });

  it('fails closed when the payload was produced with another key', () => {
    const foreign = new SecretCipher(OTHER_KEY).encrypt(SECRET);
    expect(() => cipher.decrypt(foreign)).toThrow();
  });

  it.each(['not-a-payload', 'v2:AA==:AA==:AA==', 'v1:AA==:AA==:AA==', 'v1:AA==:AA=='])(
    'rejects the malformed payload %p without leaking it',
    (payload) => {
      expect(() => cipher.decrypt(payload)).toThrow('Unsupported ciphertext format');
      try {
        cipher.decrypt(payload);
      } catch (error: unknown) {
        expect(String(error)).not.toContain(payload);
      }
    },
  );
});
