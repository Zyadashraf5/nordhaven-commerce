import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP over RFC 4226 HOTP truncation, implemented on the Node.js standard library and
 * proved against the RFC 6238 Appendix B test vectors (see `totp.spec.ts`).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD_SECONDS = 30;
const SECRET_BYTES = 20;

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
  }
  return output;
}

export function decodeBase32(encoded: string): Buffer {
  const normalized = encoded.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error('Invalid base32 input');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a new base32-encoded 160-bit shared secret. */
export function generateSharedSecret(): string {
  return encodeBase32(randomBytes(SECRET_BYTES));
}

export function timeStepFor(epochMs: number, periodSeconds: number = PERIOD_SECONDS): number {
  return Math.floor(epochMs / 1000 / periodSeconds);
}

export function generateTotpCode(
  secretBase32: string,
  timeStep: number,
  digits: number = DIGITS,
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac('sha1', decodeBase32(secretBase32)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export interface TotpVerificationOptions {
  readonly windowSteps?: number;
  readonly digits?: number;
  readonly periodSeconds?: number;
  /**
   * Highest TOTP time step that has already been accepted. Any step at or below it is rejected,
   * which makes a captured code unusable a second time inside the acceptance window.
   */
  readonly lastAcceptedStep?: number | null;
}

export interface TotpVerificationResult {
  readonly valid: boolean;
  readonly timeStep?: number;
}

export function verifyTotpCode(
  secretBase32: string,
  candidate: string,
  nowMs: number,
  options: TotpVerificationOptions = {},
): TotpVerificationResult {
  const digits = options.digits ?? DIGITS;
  const periodSeconds = options.periodSeconds ?? PERIOD_SECONDS;
  const windowSteps = options.windowSteps ?? 1;
  const lastAcceptedStep = options.lastAcceptedStep ?? null;

  if (!new RegExp(`^[0-9]{${digits}}$`).test(candidate)) return { valid: false };

  const currentStep = timeStepFor(nowMs, periodSeconds);
  for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
    const timeStep = currentStep + offset;
    if (timeStep < 0) continue;
    if (lastAcceptedStep !== null && timeStep <= lastAcceptedStep) continue;
    const expected = generateTotpCode(secretBase32, timeStep, digits);
    if (expected.length !== candidate.length) continue;
    if (timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(candidate, 'utf8'))) {
      return { valid: true, timeStep };
    }
  }
  return { valid: false };
}

export const TOTP_DEFAULTS = {
  algorithm: 'SHA1',
  digits: DIGITS,
  periodSeconds: PERIOD_SECONDS,
  windowSteps: 1,
} as const;
