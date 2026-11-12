import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Memory-hard password hashing on the Node.js standard library.
 *
 * Storage format (versioned and self-describing so parameters can be raised later without a flag
 * day): `scrypt$v=1$N=<N>,r=<r>,p=<p>$<salt-base64>$<key-base64>`.
 */

const ALGORITHM = 'scrypt';
const FORMAT_VERSION = 1;
const PARAMETER_N = 32768;
const PARAMETER_R = 8;
const PARAMETER_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** 128 * N * r is 32 MiB; Node requires maxmem to exceed it. */
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

/** Fixed, non-secret salt used for the equal-cost dummy verification of unknown accounts. */
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 0x5a);

export type PasswordPolicyViolation = 'TOO_SHORT' | 'TOO_LONG' | 'MATCHES_EMAIL';

export interface PasswordPolicyResult {
  readonly valid: boolean;
  readonly violations: readonly PasswordPolicyViolation[];
}

export function evaluatePasswordPolicy(password: string, email: string): PasswordPolicyResult {
  const violations: PasswordPolicyViolation[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) violations.push('TOO_SHORT');
  if (length > PASSWORD_MAX_LENGTH) violations.push('TOO_LONG');
  if (password.trim().toLowerCase() === email.trim().toLowerCase())
    violations.push('MATCHES_EMAIL');
  return { valid: violations.length === 0, violations };
}

interface HashParameters {
  readonly n: number;
  readonly r: number;
  readonly p: number;
}

interface ParsedPasswordHash {
  readonly parameters: HashParameters;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function deriveKey(
  password: string,
  salt: Buffer,
  parameters: HashParameters,
  keyBytes: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyBytes,
      {
        N: parameters.n,
        r: parameters.r,
        p: parameters.p,
        maxmem: MAX_MEMORY_BYTES,
      },
      (error, derivedKey) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(
    password,
    salt,
    { n: PARAMETER_N, r: PARAMETER_R, p: PARAMETER_P },
    KEY_BYTES,
  );
  return [
    ALGORITHM,
    `v=${FORMAT_VERSION}`,
    `N=${PARAMETER_N},r=${PARAMETER_R},p=${PARAMETER_P}`,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

function parseStoredHash(stored: string): ParsedPasswordHash | null {
  const parts = stored.split('$');
  if (parts.length !== 5) return null;
  const [algorithm, version, parameterText, saltText, keyText] = parts;
  if (algorithm !== ALGORITHM || version !== `v=${FORMAT_VERSION}`) return null;
  if (parameterText === undefined || saltText === undefined || keyText === undefined) return null;

  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parameterText);
  if (match === null) return null;
  const salt = Buffer.from(saltText, 'base64');
  const key = Buffer.from(keyText, 'base64');
  if (salt.length !== SALT_BYTES || key.length < 32) return null;

  return {
    parameters: { n: Number(match[1]), r: Number(match[2]), p: Number(match[3]) },
    salt,
    key,
  };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (parsed === null) return false;
  const derived = await deriveKey(password, parsed.salt, parsed.parameters, parsed.key.length);
  return derived.length === parsed.key.length && timingSafeEqual(derived, parsed.key);
}

/**
 * Performs one verification-equivalent derivation for an account that does not exist.
 *
 * The result is discarded; the purpose is to keep sign-in timing independent of account existence.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  await deriveKey(
    password,
    DUMMY_SALT,
    { n: PARAMETER_N, r: PARAMETER_R, p: PARAMETER_P },
    KEY_BYTES,
  );
}
