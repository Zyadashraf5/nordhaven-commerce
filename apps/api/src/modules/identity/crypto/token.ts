import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Session, challenge, and recovery-token length in bytes (256 bits). */
const TOKEN_BYTES = 32;

/** Alphabet without visually ambiguous characters; exactly 32 symbols keeps generation unbiased. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const RECOVERY_GROUPS = 3;
const RECOVERY_GROUP_LENGTH = 4;

/** Generates a URL-safe, high-entropy token. The raw value is only ever returned, never stored. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Non-reversible storage form for tokens, session credentials, and recovery codes. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Normalizes a human-entered recovery code before hashing. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** Generates a single-use administrator recovery code in `XXXX-XXXX-XXXX` form. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH);
  const characters = Array.from(bytes, (byte) => RECOVERY_ALPHABET.charAt(byte % 32));
  const groups: string[] = [];
  for (let index = 0; index < RECOVERY_GROUPS; index += 1) {
    const start = index * RECOVERY_GROUP_LENGTH;
    groups.push(characters.slice(start, start + RECOVERY_GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

/** Constant-time comparison of two hex digests. */
export function hexDigestsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
