/**
 * Shared admin-API client for the F06 seed scripts.
 *
 * Signs in as the local test administrator with password + TOTP (MFA is never
 * bypassed) and returns small helpers. Credentials come from the environment,
 * or from `--env-file <path>` (commented `# F06_...=` lines are read too):
 *   F06_TEST_ADMIN_EMAIL, F06_TEST_ADMIN_PASSWORD, F06_TEST_ADMIN_TOTP_SECRET
 * API base: F06_API_BASE_URL (default http://localhost:3000).
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function requireConfirm(args, what) {
  if (!args.includes('--confirm')) {
    console.error(`Refusing to run without --confirm (this writes ${what} to the local test API).`);
    process.exit(2);
  }
}

export function loadEnvFile(args) {
  const envFileIndex = args.indexOf('--env-file');
  if (envFileIndex < 0) return;
  const text = readFileSync(args[envFileIndex + 1], 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = /^#?\s*(F06_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}

export const API = () =>
  `${(process.env.F06_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1`;

function base32(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of text.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Math.floor(Date.now() / 30000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

export async function call(method, path, options = {}, attempt = 0) {
  const { body, token } = options;
  const response = await fetch(`${API()}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // The API rate-limits bursts (429); back off and retry instead of failing the run.
  if (response.status === 429 && attempt < 8) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    return call(method, path, options, attempt + 1);
  }
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : undefined };
}

export async function signInAdmin() {
  const email = process.env.F06_TEST_ADMIN_EMAIL;
  const password = process.env.F06_TEST_ADMIN_PASSWORD;
  const secret = process.env.F06_TEST_ADMIN_TOTP_SECRET;
  if (!email || !password || !secret) {
    console.error(
      'Missing F06_TEST_ADMIN_EMAIL / F06_TEST_ADMIN_PASSWORD / F06_TEST_ADMIN_TOTP_SECRET.',
    );
    process.exit(2);
  }
  const first = await call('POST', '/auth/login', { body: { email, password } });
  if (first.status !== 200) throw new Error(`sign-in failed (${first.status})`);
  if (first.json.status === 'AUTHENTICATED') return first.json.session.token;
  if (first.json.status !== 'MFA_REQUIRED')
    throw new Error(`unexpected sign-in status ${first.json.status}`);
  // A code is accepted once; wait for the next 30 s window if this one was already used.
  for (const wait of [0, 31000]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const second = await call('POST', '/auth/login/mfa', {
      body: { challengeToken: first.json.challenge.token, code: totp(secret) },
    });
    if (second.status === 201 || second.status === 200) return second.json.token;
  }
  throw new Error('MFA verification failed');
}

export function must(result, what) {
  if (result.status >= 300)
    throw new Error(`${what} failed: ${result.status} ${JSON.stringify(result.json)}`);
  return result.json;
}
